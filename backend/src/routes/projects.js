import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { uploadToS3, deleteFromS3, getFromS3, getS3FileUrl } from '../config/s3.js'

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
    const fileKey = `project-${id}/${safeFilename}`
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

export default router
