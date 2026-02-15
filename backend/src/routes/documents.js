import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// GET /api/documents — list all documents from user's projects
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      `SELECT
         d.*,
         p.name AS project_name,
         p.id AS project_id,
         u.first_name AS uploader_first_name,
         u.last_name  AS uploader_last_name
       FROM project_documents d
       JOIN company_projects p ON d.project_id = p.id
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.project_id IN (
         SELECT project_id FROM company_project_members WHERE user_id = $1
         UNION
         SELECT id FROM company_projects WHERE created_by = $1
       )
       ORDER BY d.created_at DESC`,
      [userId]
    )

    const documents = result.rows.map(doc => ({
      id: doc.id,
      name: doc.name,
      url: `/api/projects/${doc.project_id}/documents/${doc.id}/preview`,
      size: doc.file_size,
      mimeType: doc.mime_type,
      projectId: doc.project_id,
      projectName: doc.project_name,
      uploader: `${doc.uploader_first_name || ''} ${doc.uploader_last_name || ''}`.trim(),
      uploadedAt: doc.created_at,
      description: doc.description,
      tags: doc.tags,
    }))

    res.json(documents)
  } catch (error) {
    console.error('Error fetching documents:', error)
    res.status(500).json({ error: 'Failed to fetch documents' })
  }
})

export default router
