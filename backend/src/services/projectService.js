import { query, getClient } from '../config/database.js'
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/errors.js'
import { uploadToS3, deleteFromS3, getFromS3, getS3FileUrl } from '../config/s3.js'

class ProjectService {
  async getProjectsWithFilters(filters = {}) {
    const { status, search } = filters
    
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
    return result.rows
  }

  async getProjectById(projectId) {
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
      leads: membersResult.rows.filter(m => m.role === 'lead'),
      participants: membersResult.rows.filter(m => m.role === 'member'),
    }
  }

  async createProject(data, userId) {
    const { name, fullName, description, status, startDate, endDate, memberIds } = data

    if (!name?.trim()) {
      throw new ValidationError('Название проекта обязательно')
    }

    const client = await getClient()
    try {
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
          endDate || null,
          userId,
        ]
      )
      const project = projectResult.rows[0]

      await client.query(
        'INSERT INTO company_project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [project.id, userId, 'lead']
      )

      const membersSet = new Set((memberIds || []).map(String))
      membersSet.delete(String(userId))

      for (const memberId of membersSet) {
        await client.query(
          'INSERT INTO company_project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [project.id, memberId, 'member']
        )
      }

      await client.query('COMMIT')
      return this.getProjectById(project.id)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async updateProject(projectId, data, userId) {
    const { name, fullName, description, status, startDate, endDate } = data

    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [projectId, userId]
    )
    if (accessCheck.rows.length === 0) {
      throw new ForbiddenError('Недостаточно прав для редактирования проекта')
    }

    const client = await getClient()
    try {
      await client.query('BEGIN')

      const updates = []
      const values = []
      let paramIndex = 1

      if (name !== undefined) {
        if (!name?.trim()) throw new ValidationError('Название проекта обязательно')
        updates.push(`name = $${paramIndex++}`)
        values.push(name.trim())
      }
      if (fullName !== undefined) {
        updates.push(`full_name = $${paramIndex++}`)
        values.push(fullName?.trim() || null)
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`)
        values.push(description?.trim() || null)
      }
      if (status !== undefined) {
        updates.push(`status = $${paramIndex++}`)
        values.push(status)
      }
      if (startDate !== undefined) {
        updates.push(`start_date = $${paramIndex++}`)
        values.push(startDate || null)
      }
      if (endDate !== undefined) {
        updates.push(`end_date = $${paramIndex++}`)
        values.push(endDate || null)
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`)
        values.push(projectId)
        await client.query(
          `UPDATE company_projects SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        )
      }

      await client.query('COMMIT')
      return this.getProjectById(projectId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async deleteProject(projectId, userId) {
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [projectId, userId]
    )
    if (accessCheck.rows.length === 0) {
      throw new ForbiddenError('Недостаточно прав для удаления проекта')
    }

    await query('DELETE FROM company_projects WHERE id = $1', [projectId])
    return { success: true }
  }

  async addMember(projectId, userId, role, addedBy) {
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [projectId, addedBy]
    )
    if (accessCheck.rows.length === 0) {
      throw new ForbiddenError('Недостаточно прав для добавления участников')
    }

    await query(
      'INSERT INTO company_project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3',
      [projectId, userId, role || 'member']
    )

    return this.getProjectById(projectId)
  }

  async updateMember(projectId, memberId, data, updatedBy) {
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [projectId, updatedBy]
    )
    if (accessCheck.rows.length === 0) {
      throw new ForbiddenError('Недостаточно прав для редактирования участников')
    }

    const { role, description } = data
    const updates = []
    const values = []
    let paramIndex = 1

    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`)
      values.push(role)
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(description?.trim() || null)
    }

    if (updates.length > 0) {
      values.push(projectId, memberId)
      await query(
        `UPDATE company_project_members SET ${updates.join(', ')} WHERE project_id = $${paramIndex++} AND user_id = $${paramIndex}`,
        values
      )
    }

    return this.getProjectById(projectId)
  }

  async removeMember(projectId, memberId, removedBy) {
    const accessCheck = await query(
      `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
      [projectId, removedBy]
    )
    if (accessCheck.rows.length === 0) {
      throw new ForbiddenError('Недостаточно прав для удаления участников')
    }

    await query(
      'DELETE FROM company_project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, memberId]
    )

    return this.getProjectById(projectId)
  }

  async getFolders(projectId, parentPath = '') {
    const result = await query(
      `SELECT id, name, path, parent_path, created_by, created_at
       FROM project_folders
       WHERE project_id = $1 AND parent_path = $2
       ORDER BY name`,
      [projectId, parentPath]
    )
    return result.rows
  }

  async createFolder(projectId, name, parentPath, userId) {
    const path = parentPath ? `${parentPath}/${name}` : name
    
    const result = await query(
      `INSERT INTO project_folders (project_id, name, path, parent_path, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [projectId, name, path, parentPath || '', userId]
    )
    return result.rows[0]
  }

  async updateFolder(projectId, folderId, name) {
    const result = await query(
      `UPDATE project_folders SET name = $1 WHERE id = $2 AND project_id = $3 RETURNING *`,
      [name, folderId, projectId]
    )
    if (result.rows.length === 0) {
      throw new NotFoundError('Папка не найдена')
    }
    return result.rows[0]
  }

  async deleteFolder(projectId, folderId) {
    const result = await query(
      'DELETE FROM project_folders WHERE id = $1 AND project_id = $2 RETURNING id',
      [folderId, projectId]
    )
    if (result.rows.length === 0) {
      throw new NotFoundError('Папка не найдена')
    }
    return { success: true }
  }

  async getDocuments(projectId, folderPath = '') {
    const result = await query(
      `SELECT id, name, path, folder_path, size, mime_type, tags, created_by, created_at, updated_at
       FROM project_documents
       WHERE project_id = $1 AND folder_path = $2
       ORDER BY name`,
      [projectId, folderPath]
    )
    return result.rows.map(doc => ({
      ...doc,
      url: getS3FileUrl(doc.path),
    }))
  }

  async uploadDocument(projectId, file, folderPath, userId) {
    const key = folderPath 
      ? `projects/${projectId}/${folderPath}/${Date.now()}_${file.originalname}`
      : `projects/${projectId}/${Date.now()}_${file.originalname}`

    await uploadToS3(file, key)

    const result = await query(
      `INSERT INTO project_documents (project_id, name, path, folder_path, size, mime_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [projectId, file.originalname, key, folderPath || '', file.size, file.mimetype, userId]
    )

    return {
      ...result.rows[0],
      url: getS3FileUrl(key),
    }
  }

  async deleteDocument(projectId, documentId) {
    const docResult = await query(
      'SELECT path FROM project_documents WHERE id = $1 AND project_id = $2',
      [documentId, projectId]
    )
    if (docResult.rows.length === 0) {
      throw new NotFoundError('Документ не найден')
    }

    await deleteFromS3(docResult.rows[0].path)
    await query('DELETE FROM project_documents WHERE id = $1', [documentId])

    return { success: true }
  }

  async getDocumentContent(projectId, documentId) {
    const docResult = await query(
      'SELECT path, name, mime_type FROM project_documents WHERE id = $1 AND project_id = $2',
      [documentId, projectId]
    )
    if (docResult.rows.length === 0) {
      throw new NotFoundError('Документ не найден')
    }

    const doc = docResult.rows[0]
    const content = await getFromS3(doc.path)

    return {
      content,
      name: doc.name,
      mimeType: doc.mime_type,
    }
  }

  async getRoadmapRows(projectId) {
    const result = await query(
      'SELECT * FROM project_roadmap_rows WHERE project_id = $1 ORDER BY order_index',
      [projectId]
    )
    return result.rows
  }

  async createRoadmapRow(projectId, data) {
    const { title, color } = data
    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(order_index), 0) as max_order FROM project_roadmap_rows WHERE project_id = $1',
      [projectId]
    )
    const orderIndex = maxOrderResult.rows[0].max_order + 1

    const result = await query(
      `INSERT INTO project_roadmap_rows (project_id, title, color, order_index)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [projectId, title, color || '#6366f1', orderIndex]
    )
    return result.rows[0]
  }

  async updateRoadmapRow(projectId, rowId, data) {
    const { title, color, orderIndex } = data
    const updates = []
    const values = []
    let paramIndex = 1

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`)
      values.push(title)
    }
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`)
      values.push(color)
    }
    if (orderIndex !== undefined) {
      updates.push(`order_index = $${paramIndex++}`)
      values.push(orderIndex)
    }

    if (updates.length > 0) {
      values.push(projectId, rowId)
      await query(
        `UPDATE project_roadmap_rows SET ${updates.join(', ')} WHERE project_id = $${paramIndex++} AND id = $${paramIndex}`,
        values
      )
    }

    const result = await query('SELECT * FROM project_roadmap_rows WHERE id = $1', [rowId])
    return result.rows[0]
  }

  async deleteRoadmapRow(projectId, rowId) {
    await query('DELETE FROM project_roadmap_tasks WHERE row_id = $1', [rowId])
    await query('DELETE FROM project_roadmap_rows WHERE id = $1 AND project_id = $2', [rowId, projectId])
    return { success: true }
  }

  async getRoadmapTasks(projectId) {
    const result = await query(
      `SELECT t.*, u.first_name || ' ' || u.last_name as assignee_name
       FROM project_roadmap_tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.project_id = $1
       ORDER BY t.order_index`,
      [projectId]
    )
    return result.rows
  }

  async createRoadmapTask(projectId, data) {
    const { rowId, title, description, startDate, endDate, status, priority, assigneeId } = data
    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(order_index), 0) as max_order FROM project_roadmap_tasks WHERE project_id = $1 AND row_id = $2',
      [projectId, rowId]
    )
    const orderIndex = maxOrderResult.rows[0].max_order + 1

    const result = await query(
      `INSERT INTO project_roadmap_tasks 
       (project_id, row_id, title, description, start_date, end_date, status, priority, assignee_id, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [projectId, rowId, title, description || null, startDate, endDate, status || 'pending', priority || 'medium', assigneeId || null, orderIndex]
    )
    return result.rows[0]
  }

  async updateRoadmapTask(projectId, taskId, data) {
    const allowedFields = ['title', 'description', 'start_date', 'end_date', 'status', 'priority', 'assignee_id', 'row_id', 'order_index']
    const updates = []
    const values = []
    let paramIndex = 1

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramIndex++}`)
        values.push(value)
      }
    }

    if (updates.length > 0) {
      values.push(projectId, taskId)
      await query(
        `UPDATE project_roadmap_tasks SET ${updates.join(', ')} WHERE project_id = $${paramIndex++} AND id = $${paramIndex}`,
        values
      )
    }

    const result = await query('SELECT * FROM project_roadmap_tasks WHERE id = $1', [taskId])
    return result.rows[0]
  }

  async deleteRoadmapTask(projectId, taskId) {
    await query('DELETE FROM project_roadmap_tasks WHERE id = $1 AND project_id = $2', [taskId, projectId])
    return { success: true }
  }
}

export const projectService = new ProjectService()
export default projectService
