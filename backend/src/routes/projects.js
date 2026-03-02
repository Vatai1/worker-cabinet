import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { uploadToS3, deleteFromS3, getFromS3, getS3FileUrl } from '../config/s3.js'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const router = express.Router()

// Helper: get project with members
async function getProjectWithMembers(projectId) {
  const projectResult = await query(
    `SELECT
       p.*,
       u.first_name AS creator_first_name,
       u.last_name  AS creator_last_name
     FROM company_projects p
     LEFT JOIN users u ON p.created_by = u.id
     WHERE p.id = $1`,
    [projectId]
  )
  if (projectResult.rows.length === 0) return null

  const project = projectResult.rows[0]

  const membersResult = await query(
    `SELECT
       m.role,
       m.joined_at,
       m.description,
       u.id,
       u.first_name,
       u.last_name,
       u.position,
       d.name AS department_name
     FROM company_project_members m
     JOIN users u ON m.user_id = u.id
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE m.project_id = $1
     ORDER BY
       CASE m.role WHEN 'lead' THEN 0 ELSE 1 END,
       u.last_name`,
    [projectId]
  )

  return {
    ...project,
    members: membersResult.rows,
    leads:   membersResult.rows.filter((m) => m.role === 'lead'),
    participants: membersResult.rows.filter((m) => m.role === 'member'),
  }
}

// GET /api/projects — list with lead & member preview
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, search } = req.query

    let sql = `
      SELECT
        p.id,
        p.name,
        p.full_name,
        p.description,
        p.status,
        p.start_date,
        p.end_date,
        p.created_by,
        p.created_at,
        p.updated_at,
        COUNT(DISTINCT m.user_id)::int AS member_count,
        COALESCE(
          json_agg(
            json_build_object(
              'id',         u.id,
              'first_name', u.first_name,
              'last_name',  u.last_name,
              'position',   u.position,
              'role',       m.role
            )
            ORDER BY CASE m.role WHEN 'lead' THEN 0 ELSE 1 END, u.last_name
          ) FILTER (WHERE m.user_id IS NOT NULL),
          '[]'
        ) AS members
      FROM company_projects p
      LEFT JOIN company_project_members m  ON p.id = m.project_id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE 1=1
    `
    const params = []

    if (status) {
      params.push(status)
      sql += ` AND p.status = $${params.length}`
    }

    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (p.name ILIKE $${params.length} OR p.full_name ILIKE $${params.length} OR p.description ILIKE $${params.length})`
    }

    sql += ' GROUP BY p.id ORDER BY p.created_at DESC'

    const result = await query(sql, params)
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching projects:', error)
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

// GET /api/projects/:id — full detail
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const project = await getProjectWithMembers(req.params.id)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    res.json(project)
  } catch (error) {
    console.error('Error fetching project:', error)
    res.status(500).json({ error: 'Failed to fetch project' })
  }
})

// POST /api/projects — create
router.post('/', authenticateToken, async (req, res) => {
  const client = await getClient()
  try {
    const { name, fullName, description, status, startDate, endDate, memberIds } = req.body
    const userId = req.user.id

    if (!name?.trim()) return res.status(400).json({ error: 'Название проекта обязательно' })

    await client.query('BEGIN')

    const projectResult = await client.query(
      `INSERT INTO company_projects (name, full_name, description, status, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name.trim(),
        fullName?.trim() || null,
        description?.trim() || null,
        status || 'active',
        startDate || null,
        endDate   || null,
        userId,
      ]
    )
    const project = projectResult.rows[0]

    // Creator is always a lead
    const leadsSet = new Set([String(userId)])
    const membersSet = new Set((memberIds || []).map(String))

    await client.query(
      'INSERT INTO company_project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [project.id, userId, 'lead']
    )

    for (const memberId of membersSet) {
      if (!leadsSet.has(memberId)) {
        await client.query(
          'INSERT INTO company_project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [project.id, memberId, 'member']
        )
      }
    }

    await client.query('COMMIT')

    const full = await getProjectWithMembers(project.id)
    res.status(201).json(full)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error creating project:', error)
    res.status(500).json({ error: 'Failed to create project' })
  } finally {
    client.release()
  }
})

// PUT /api/projects/:id — update
router.put('/:id', authenticateToken, async (req, res) => {
  const client = await getClient()
  try {
    const { id } = req.params
    const { name, fullName, description, status, startDate, endDate } = req.body
    const userId = req.user.id

    // Only leads or admins can edit
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE company_projects
       SET name = COALESCE($1, name),
           full_name = COALESCE($2, full_name),
           description = $3,
           status = COALESCE($4, status),
           start_date = $5,
           end_date = $6
       WHERE id = $7
       RETURNING *`,
      [
        name?.trim() || null,
        fullName?.trim() || null,
        description?.trim() || null,
        status || null,
        startDate || null,
        endDate   || null,
        id,
      ]
    )

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Project not found' })
    }

    await client.query('COMMIT')

    const full = await getProjectWithMembers(id)
    res.json(full)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error updating project:', error)
    res.status(500).json({ error: 'Failed to update project' })
  } finally {
    client.release()
  }
})

// POST /api/projects/:id/members — add member
router.post('/:id/members', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { userId: targetUserId, role } = req.body
    const currentUserId = req.user.id

    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, currentUserId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await query(
      `INSERT INTO company_project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [id, targetUserId, role || 'member']
    )

    const full = await getProjectWithMembers(id)
    res.json(full)
  } catch (error) {
    console.error('Error adding member:', error)
    res.status(500).json({ error: 'Failed to add member' })
  }
})

// PUT /api/projects/:id/members/:userId — update member info
router.put('/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { id, userId: targetUserId } = req.params
    const { description } = req.body
    const currentUserId = req.user.id

    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, currentUserId]
    )
    if (accessCheck.rows.length === 0 && String(currentUserId) !== String(targetUserId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await query(
      `UPDATE company_project_members
       SET description = $1
       WHERE project_id = $2 AND user_id = $3`,
      [description || null, id, targetUserId]
    )

    const full = await getProjectWithMembers(id)
    res.json(full)
  } catch (error) {
    console.error('Error updating member:', error)
    res.status(500).json({ error: 'Failed to update member' })
  }
})

// DELETE /api/projects/:id/members/:userId — remove member
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { id, userId: targetUserId } = req.params
    const currentUserId = req.user.id

    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, currentUserId]
    )
    if (accessCheck.rows.length === 0 && String(currentUserId) !== String(targetUserId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await query(
      'DELETE FROM company_project_members WHERE project_id = $1 AND user_id = $2',
      [id, targetUserId]
    )

    const full = await getProjectWithMembers(id)
    res.json(full)
  } catch (error) {
    console.error('Error removing member:', error)
    res.status(500).json({ error: 'Failed to remove member' })
  }
})

// GET /api/projects/:id/documents — list documents (optionally filtered by folder_path)
router.get('/:id/documents', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const folderPath = req.query.folder || null

    let sql = `
      SELECT
         d.*,
         u.first_name AS uploader_first_name,
         u.last_name  AS uploader_last_name
       FROM project_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.project_id = $1`
    const params = [id]

    if (folderPath !== null) {
      params.push(folderPath)
      sql += ` AND d.folder_path = $${params.length}`
    }

    sql += ' ORDER BY d.created_at DESC'

    const result = await query(sql, params)
    const documents = result.rows.map(doc => ({
      ...doc,
      file_path: getS3FileUrl(doc.file_path)
    }))
    res.json(documents)
  } catch (error) {
    console.error('Error fetching documents:', error)
    res.status(500).json({ error: 'Failed to fetch documents' })
  }
})

// GET /api/projects/:id/folders — list folders at a given parent_path
router.get('/:id/folders', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const parentPath = req.query.parent || '/'

    const result = await query(
      `SELECT * FROM project_folders
       WHERE project_id = $1 AND parent_path = $2
       ORDER BY name`,
      [id, parentPath]
    )
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching folders:', error)
    res.status(500).json({ error: 'Failed to fetch folders' })
  }
})

// POST /api/projects/:id/folders — create folder
router.post('/:id/folders', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { name, parentPath = '/' } = req.body
    const userId = req.user.id

    if (!name?.trim()) return res.status(400).json({ error: 'Название папки обязательно' })

    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2
       UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) return res.status(403).json({ error: 'Forbidden' })

    const safeName = name.trim().replace(/\//g, '_')
    const normalizedParent = parentPath.endsWith('/') ? parentPath : `${parentPath}/`
    const path = `${normalizedParent}${safeName}/`

    const result = await query(
      `INSERT INTO project_folders (project_id, name, path, parent_path, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, path) DO NOTHING
       RETURNING *`,
      [id, safeName, path, parentPath, userId]
    )
    if (result.rows.length === 0) return res.status(409).json({ error: 'Папка уже существует' })
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error creating folder:', error)
    res.status(500).json({ error: 'Failed to create folder' })
  }
})

// PUT /api/projects/:id/folders/:folderId — rename folder
router.put('/:id/folders/:folderId', authenticateToken, async (req, res) => {
  try {
    const { id, folderId } = req.params
    const { name } = req.body
    const userId = req.user.id

    if (!name?.trim()) return res.status(400).json({ error: 'Название папки обязательно' })

    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) return res.status(403).json({ error: 'Forbidden' })

    const folderResult = await query(
      `SELECT * FROM project_folders WHERE id = $1 AND project_id = $2`,
      [folderId, id]
    )
    if (folderResult.rows.length === 0) return res.status(404).json({ error: 'Folder not found' })

    const folder = folderResult.rows[0]
    const safeName = name.trim().replace(/\//g, '_')
    const newPath = `${folder.parent_path}${safeName}/`

    const result = await query(
      `UPDATE project_folders
       SET name = $1, path = $2
       WHERE id = $3 AND project_id = $4
       RETURNING *`,
      [safeName, newPath, folderId, id]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error renaming folder:', error)
    res.status(500).json({ error: 'Failed to rename folder' })
  }
})

// DELETE /api/projects/:id/folders — delete folder (and its contents)
router.delete('/:id/folders', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { path } = req.body
    const userId = req.user.id

    if (!path) return res.status(400).json({ error: 'path required' })

    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) return res.status(403).json({ error: 'Forbidden' })

    // Delete all documents inside (and nested)
    await query(
      `DELETE FROM project_documents WHERE project_id = $1 AND folder_path LIKE $2`,
      [id, `${path}%`]
    )
    // Delete all subfolders
    await query(
      `DELETE FROM project_folders WHERE project_id = $1 AND path LIKE $2`,
      [id, `${path}%`]
    )
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting folder:', error)
    res.status(500).json({ error: 'Failed to delete folder' })
  }
})

// POST /api/projects/:id/documents — upload document
router.post('/:id/documents', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' })
    }

    // Only leads, admins, hr, or members can upload
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { name, tags, description, folderPath = '/' } = req.body
    const docName = name || req.file.originalname
    const timestamp = Date.now()
    const extension = req.file.originalname.split('.').pop()
    const safeFilename = `doc-${timestamp}.${extension}`
    const fileKey = `projects/${id}/${safeFilename}`
    await uploadToS3(req.file, fileKey)

    const result = await query(
      `INSERT INTO project_documents (project_id, name, file_path, file_size, mime_type, uploaded_by, folder_path, tags, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        docName,
        fileKey,
        req.file.size,
        req.file.mimetype,
        userId,
        folderPath,
        tags ? JSON.parse(tags) : [],
        description || null,
      ]
    )
    
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error uploading document:', error)
    res.status(500).json({ error: 'Failed to upload document' })
  }
})

// GET /api/projects/:id/documents/:documentId/download — download document
router.get('/:id/documents/:documentId/download', authenticateToken, async (req, res) => {
  try {
    const { id, documentId } = req.params
    const userId = req.user.id
    
    const docResult = await query(
      `SELECT file_path, name, mime_type FROM project_documents WHERE id = $1 AND project_id = $2`,
      [documentId, id]
    )
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }
    
    const doc = docResult.rows[0]
    const { Body, ContentType } = await getFromS3(doc.file_path)
    
    res.setHeader('Content-Type', ContentType || doc.mime_type)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.name)}"`)
    
    Body.pipe(res)
  } catch (error) {
    console.error('Error downloading document:', error)
    res.status(500).json({ error: 'Failed to download document' })
  }
})

// GET /api/projects/:id/documents/:documentId/preview — preview document
router.get('/:id/documents/:documentId/preview', authenticateToken, async (req, res) => {
  try {
    const { id, documentId } = req.params
    const userId = req.user.id
    
    const docResult = await query(
      `SELECT file_path, name, mime_type, file_size FROM project_documents WHERE id = $1 AND project_id = $2`,
      [documentId, id]
    )
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }
    
    const doc = docResult.rows[0]
    
    // For docx files, return binary file for client-side rendering
    if (doc.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        doc.mime_type === 'application/msword' ||
        doc.name.toLowerCase().endsWith('.docx')) {
      const { Body, ContentType } = await getFromS3(doc.file_path)
      
      res.setHeader('Content-Type', ContentType || doc.mime_type)
      res.setHeader('Content-Disposition', 'inline')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      
      Body.pipe(res)
      return
    }
    
    // For text files, read content directly
    if (doc.mime_type.startsWith('text/') || 
        ['application/json', 'application/javascript', 'application/xml', 'application/yaml', 'application/x-yaml'].includes(doc.mime_type)) {
      const { Body } = await getFromS3(doc.file_path)
      const content = await Body.transformToString()
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      return res.send(content)
    }
    
    // For binary files, stream them with inline disposition for preview
    const { Body, ContentType } = await getFromS3(doc.file_path)
    
    res.setHeader('Content-Type', ContentType || doc.mime_type)
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    
    Body.pipe(res)
  } catch (error) {
    console.error('Error previewing document:', error)
    res.status(500).json({ error: 'Failed to preview document' })
  }
})

// PUT /api/projects/:id/documents/:documentId — update document (rename)
router.put('/:id/documents/:documentId', authenticateToken, async (req, res) => {
  try {
    const { id, documentId } = req.params
    const { name, description } = req.body
    const userId = req.user.id

    // Check access
    const accessCheck = await query(
      `SELECT uploaded_by FROM project_documents WHERE id = $1 AND project_id = $2`,
      [documentId, id]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const doc = accessCheck.rows[0]
    const canEdit = String(doc.uploaded_by) === String(userId)

    const isAdminOrLead = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )

    if (!canEdit && isAdminOrLead.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const updateFields = []
    const values = []
    let paramCount = 1

    if (name?.trim()) {
      updateFields.push(`name = $${paramCount}`)
      values.push(name.trim())
      paramCount++
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramCount}`)
      values.push(description || null)
      paramCount++
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    values.push(documentId)

    const result = await query(
      `UPDATE project_documents SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating document:', error)
    res.status(500).json({ error: 'Failed to update document' })
  }
})

// PUT /api/projects/:id/documents/:documentId/move — move document to another folder
router.put('/:id/documents/:documentId/move', authenticateToken, async (req, res) => {
  try {
    const { id, documentId } = req.params
    const { folderPath } = req.body
    const userId = req.user.id

    // Check access
    const accessCheck = await query(
      `SELECT uploaded_by FROM project_documents WHERE id = $1 AND project_id = $2`,
      [documentId, id]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const doc = accessCheck.rows[0]
    const canEdit = String(doc.uploaded_by) === String(userId)

    const isAdminOrLead = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )

    if (!canEdit && isAdminOrLead.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const targetPath = folderPath || '/'
    
    const result = await query(
      `UPDATE project_documents SET folder_path = $1 WHERE id = $2 AND project_id = $3 RETURNING *`,
      [targetPath, documentId, id]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error moving document:', error)
    res.status(500).json({ error: 'Failed to move document' })
  }
})

// PUT /api/projects/:id/folders/:folderId/move — move folder to another parent
router.put('/:id/folders/:folderId/move', authenticateToken, async (req, res) => {
  try {
    const { id, folderId } = req.params
    const { parentPath } = req.body
    const userId = req.user.id

    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) return res.status(403).json({ error: 'Forbidden' })

    const folderResult = await query(
      `SELECT * FROM project_folders WHERE id = $1 AND project_id = $2`,
      [folderId, id]
    )
    if (folderResult.rows.length === 0) return res.status(404).json({ error: 'Folder not found' })

    const folder = folderResult.rows[0]
    const newParentPath = parentPath || '/'
    const newPath = `${newParentPath}${folder.name}/`

    // Check if folder with same name exists in target
    const existingCheck = await query(
      `SELECT 1 FROM project_folders WHERE project_id = $1 AND path = $2 AND id != $3`,
      [id, newPath, folderId]
    )
    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Папка с таким именем уже существует в целевой директории' })
    }

    // Prevent moving folder into itself or its subfolders
    if (newPath.startsWith(folder.path)) {
      return res.status(400).json({ error: 'Нельзя переместить папку в саму себя' })
    }

    const result = await query(
      `UPDATE project_folders SET parent_path = $1, path = $2 WHERE id = $3 AND project_id = $4 RETURNING *`,
      [newParentPath, newPath, folderId, id]
    )

    // Update paths of all subfolders and documents
    const oldPath = folder.path
    await query(
      `UPDATE project_folders SET path = $1 || substring(path FROM $2) WHERE project_id = $3 AND path LIKE $4 AND id != $5`,
      [newPath, oldPath.length + 1, id, `${oldPath}%`, folderId]
    )
    await query(
      `UPDATE project_documents SET folder_path = $1 || substring(folder_path FROM $2) WHERE project_id = $3 AND folder_path LIKE $4`,
      [newPath.slice(0, -1), oldPath.length, id, `${oldPath.slice(0, -1)}%`]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error moving folder:', error)
    res.status(500).json({ error: 'Failed to move folder' })
  }
})

// DELETE /api/projects/:id/documents/:documentId — delete document
router.delete('/:id/documents/:documentId', authenticateToken, async (req, res) => {
  try {
    const { id, documentId } = req.params
    const userId = req.user.id

    // Check access
    const accessCheck = await query(
      `SELECT uploaded_by, file_path FROM project_documents WHERE id = $1 AND project_id = $2`,
      [documentId, id]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const doc = accessCheck.rows[0]
    const canDelete = String(doc.uploaded_by) === String(userId)

    const isAdminOrLead = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )

    if (!canDelete && isAdminOrLead.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    
    await deleteFromS3(doc.file_path)
    await query('DELETE FROM project_documents WHERE id = $1', [documentId])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    res.status(500).json({ error: 'Failed to delete document' })
  }
})

// DELETE /api/projects/:id — delete project
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const accessCheck = await query(
      `SELECT 1 FROM company_projects WHERE id = $1 AND created_by = $2
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await query('DELETE FROM company_projects WHERE id = $1', [id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

// Generate temporary token for document preview
function generatePreviewToken(documentId, projectId, userId) {
  const payload = {
    documentId,
    projectId,
    userId,
    type: 'document_preview',
    exp: Math.floor(Date.now() / 1000) + (60 * 30), // 30 minutes
  }
  const secret = process.env.JWT_SECRET || 'your-secret-key'
  return jwt.sign(payload, secret)
}

// Get public API URL (accessible from Docker containers)
function getPublicApiUrl() {
  return process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || 'http://host.docker.internal:5001/api'
}

// Verify preview token
function verifyPreviewToken(token) {
  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key'
    return jwt.verify(token, secret)
  } catch (error) {
    return null
  }
}

// GET /api/projects/:id/documents/:documentId/preview-token — Get temporary preview token
router.get('/:id/documents/:documentId/preview-token', authenticateToken, async (req, res) => {
  try {
    const { id, documentId } = req.params
    const userId = req.user.id

    // Check if document exists and user has access
    const docCheck = await query(
      `SELECT 1 FROM project_documents WHERE id = $1 AND project_id = $2`,
      [documentId, id]
    )

    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const token = generatePreviewToken(documentId, id, String(userId))
    const publicUrl = `${getPublicApiUrl()}/projects/${id}/documents/${documentId}/public/${token}`
    res.json({ token, publicUrl })
  } catch (error) {
    console.error('Error generating preview token:', error)
    res.status(500).json({ error: 'Failed to generate preview token' })
  }
})

// GET /api/projects/:id/documents/:documentId/public/:token — Public preview URL
router.get('/:id/documents/:documentId/public/:token', async (req, res) => {
  try {
    const { id, documentId, token } = req.params

    const decoded = verifyPreviewToken(token)
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    if (String(decoded.documentId) !== String(documentId) || String(decoded.projectId) !== String(id)) {
      return res.status(403).json({ error: 'Token does not match document' })
    }

    const docResult = await query(
      `SELECT file_path, name, mime_type, file_size FROM project_documents WHERE id = $1 AND project_id = $2`,
      [documentId, id]
    )

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const doc = docResult.rows[0]
    const { Body, ContentType } = await getFromS3(doc.file_path)

    res.setHeader('Content-Type', ContentType || doc.mime_type)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name)}"`)
    res.setHeader('Cache-Control', 'public, max-age=300') // 5 minutes

    Body.pipe(res)
  } catch (error) {
    console.error('Error serving public document:', error)
    res.status(500).json({ error: 'Failed to load document' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// ROADMAP ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/projects/:id/roadmap — get roadmap items
router.get('/:id/roadmap', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      `SELECT * FROM project_roadmap WHERE project_id = $1 ORDER BY order_index ASC, created_at ASC`,
      [id]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching roadmap:', error)
    res.status(500).json({ error: 'Failed to fetch roadmap' })
  }
})

// POST /api/projects/:id/roadmap — create roadmap item
router.post('/:id/roadmap', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { title, description, due_date } = req.body
    const userId = req.user.id

    // Check access
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Title is required' })
    }

    // Get max order_index
    const maxOrderResult = await query(
      `SELECT COALESCE(MAX(order_index), -1) as max_order FROM project_roadmap WHERE project_id = $1`,
      [id]
    )
    const orderIndex = maxOrderResult.rows[0].max_order + 1

    const result = await query(
      `INSERT INTO project_roadmap (project_id, title, description, due_date, order_index, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, title.trim(), description || null, due_date || null, orderIndex, userId]
    )

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error creating roadmap item:', error)
    res.status(500).json({ error: 'Failed to create roadmap item' })
  }
})

// PUT /api/projects/:id/roadmap/:itemId — update roadmap item
router.put('/:id/roadmap/:itemId', authenticateToken, async (req, res) => {
  try {
    const { id, itemId } = req.params
    const { title, description, due_date, status } = req.body
    const userId = req.user.id

    // Check access
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const updateFields = []
    const values = []
    let paramCount = 1

    if (title !== undefined) {
      updateFields.push(`title = $${paramCount}`)
      values.push(title.trim())
      paramCount++
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramCount}`)
      values.push(description || null)
      paramCount++
    }
    if (due_date !== undefined) {
      updateFields.push(`due_date = $${paramCount}`)
      values.push(due_date || null)
      paramCount++
    }
    if (status !== undefined) {
      updateFields.push(`status = $${paramCount}`)
      values.push(status)
      paramCount++
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    values.push(itemId, id)

    const result = await query(
      `UPDATE project_roadmap SET ${updateFields.join(', ')} WHERE id = $${paramCount} AND project_id = $${paramCount + 1} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Roadmap item not found' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating roadmap item:', error)
    res.status(500).json({ error: 'Failed to update roadmap item' })
  }
})

// PUT /api/projects/:id/roadmap/reorder — reorder roadmap items
router.put('/:id/roadmap/reorder', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { order } = req.body
    const userId = req.user.id

    // Check access
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array' })
    }

    // Update order_index for each item
    for (let i = 0; i < order.length; i++) {
      await query(
        `UPDATE project_roadmap SET order_index = $1 WHERE id = $2 AND project_id = $3`,
        [i, order[i], id]
      )
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error reordering roadmap:', error)
    res.status(500).json({ error: 'Failed to reorder roadmap' })
  }
})

// DELETE /api/projects/:id/roadmap/:itemId — delete roadmap item
router.delete('/:id/roadmap/:itemId', authenticateToken, async (req, res) => {
  try {
    const { id, itemId } = req.params
    const userId = req.user.id

    // Check access
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await query(`DELETE FROM project_roadmap WHERE id = $1 AND project_id = $2`, [itemId, id])

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting roadmap item:', error)
    res.status(500).json({ error: 'Failed to delete roadmap item' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// ROADMAP V2 — ROWS
// ═══════════════════════════════════════════════════════════════════════════

const checkRoadmapAccess = async (projectId, userId) => {
  const result = await query(
    `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
     UNION SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
    [projectId, userId]
  )
  return result.rows.length > 0
}

// GET /api/projects/:id/roadmap/rows
router.get('/:id/roadmap/rows', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT * FROM roadmap_rows WHERE project_id = $1 ORDER BY order_index ASC, id ASC`,
      [id]
    )
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching roadmap rows:', error)
    res.status(500).json({ error: 'Failed to fetch roadmap rows' })
  }
})

// POST /api/projects/:id/roadmap/rows
router.post('/:id/roadmap/rows', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { title, color } = req.body
    const userId = req.user.id

    if (!await checkRoadmapAccess(id, userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Title is required' })
    }

    const maxOrder = await query(
      `SELECT COALESCE(MAX(order_index), -1) AS m FROM roadmap_rows WHERE project_id = $1`,
      [id]
    )
    const orderIndex = maxOrder.rows[0].m + 1

    const result = await query(
      `INSERT INTO roadmap_rows (project_id, title, color, order_index, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, title.trim(), color || '#6366f1', orderIndex, userId]
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error creating roadmap row:', error)
    res.status(500).json({ error: 'Failed to create roadmap row' })
  }
})

// PUT /api/projects/:id/roadmap/rows/:rowId
router.put('/:id/roadmap/rows/:rowId', authenticateToken, async (req, res) => {
  try {
    const { id, rowId } = req.params
    const { title, color, order_index } = req.body
    const userId = req.user.id

    if (!await checkRoadmapAccess(id, userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const fields = []
    const values = []
    let n = 1
    if (title !== undefined) { fields.push(`title = $${n++}`); values.push(title.trim()) }
    if (color !== undefined) { fields.push(`color = $${n++}`); values.push(color) }
    if (order_index !== undefined) { fields.push(`order_index = $${n++}`); values.push(order_index) }

    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' })

    values.push(rowId, id)
    const result = await query(
      `UPDATE roadmap_rows SET ${fields.join(', ')} WHERE id = $${n} AND project_id = $${n + 1} RETURNING *`,
      values
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Row not found' })
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating roadmap row:', error)
    res.status(500).json({ error: 'Failed to update roadmap row' })
  }
})

// DELETE /api/projects/:id/roadmap/rows/:rowId
router.delete('/:id/roadmap/rows/:rowId', authenticateToken, async (req, res) => {
  try {
    const { id, rowId } = req.params
    const userId = req.user.id

    if (!await checkRoadmapAccess(id, userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await query(`DELETE FROM roadmap_rows WHERE id = $1 AND project_id = $2`, [rowId, id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting roadmap row:', error)
    res.status(500).json({ error: 'Failed to delete roadmap row' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// ROADMAP V2 — TASKS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/projects/:id/roadmap/tasks
router.get('/:id/roadmap/tasks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT * FROM roadmap_tasks WHERE project_id = $1 ORDER BY row_id ASC, start_month ASC`,
      [id]
    )
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching roadmap tasks:', error)
    res.status(500).json({ error: 'Failed to fetch roadmap tasks' })
  }
})

// POST /api/projects/:id/roadmap/tasks
router.post('/:id/roadmap/tasks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { row_id, title, description, start_month, end_month, status, color, priority, is_milestone } = req.body
    const userId = req.user.id

    if (!await checkRoadmapAccess(id, userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' })
    if (!row_id) return res.status(400).json({ error: 'row_id is required' })
    if (!start_month || !end_month) return res.status(400).json({ error: 'start_month and end_month are required' })

    const result = await query(
      `INSERT INTO roadmap_tasks (project_id, row_id, title, description, start_month, end_month, status, color, priority, is_milestone, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, row_id, title.trim(), description || null, start_month, end_month, status || 'pending', color || null, priority || 'medium', is_milestone || false, userId]
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error creating roadmap task:', error)
    res.status(500).json({ error: 'Failed to create roadmap task' })
  }
})

// PUT /api/projects/:id/roadmap/tasks/:taskId
router.put('/:id/roadmap/tasks/:taskId', authenticateToken, async (req, res) => {
  try {
    const { id, taskId } = req.params
    const { title, description, start_month, end_month, status, color, row_id, priority, is_milestone } = req.body
    const userId = req.user.id

    if (!await checkRoadmapAccess(id, userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const fields = []
    const values = []
    let n = 1
    if (title !== undefined) { fields.push(`title = $${n++}`); values.push(title.trim()) }
    if (description !== undefined) { fields.push(`description = $${n++}`); values.push(description || null) }
    if (start_month !== undefined) { fields.push(`start_month = $${n++}`); values.push(start_month) }
    if (end_month !== undefined) { fields.push(`end_month = $${n++}`); values.push(end_month) }
    if (status !== undefined) { fields.push(`status = $${n++}`); values.push(status) }
    if (color !== undefined) { fields.push(`color = $${n++}`); values.push(color) }
    if (row_id !== undefined) { fields.push(`row_id = $${n++}`); values.push(row_id) }
    if (priority !== undefined) { fields.push(`priority = $${n++}`); values.push(priority) }
    if (is_milestone !== undefined) { fields.push(`is_milestone = $${n++}`); values.push(is_milestone) }

    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' })

    values.push(taskId, id)
    const result = await query(
      `UPDATE roadmap_tasks SET ${fields.join(', ')} WHERE id = $${n} AND project_id = $${n + 1} RETURNING *`,
      values
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating roadmap task:', error)
    res.status(500).json({ error: 'Failed to update roadmap task' })
  }
})

// DELETE /api/projects/:id/roadmap/tasks/:taskId
router.delete('/:id/roadmap/tasks/:taskId', authenticateToken, async (req, res) => {
  try {
    const { id, taskId } = req.params
    const userId = req.user.id

    if (!await checkRoadmapAccess(id, userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await query(`DELETE FROM roadmap_tasks WHERE id = $1 AND project_id = $2`, [taskId, id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting roadmap task:', error)
    res.status(500).json({ error: 'Failed to delete roadmap task' })
  }
})

export default router
