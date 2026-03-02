import express from 'express'
import multer from 'multer'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { uploadToS3, getFromS3, deleteFromS3, getS3FileUrl } from '../config/s3.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      `SELECT 
        ud.*,
        u.first_name AS uploader_first_name,
        u.last_name AS uploader_last_name
       FROM user_documents ud
       LEFT JOIN users u ON ud.uploaded_by = u.id
       WHERE ud.user_id = $1
       ORDER BY ud.created_at DESC`,
      [userId]
    )

    const documents = result.rows.map(doc => ({
      id: doc.id,
      name: doc.name,
      url: `/api/user-documents/${doc.id}/download`,
      size: doc.file_size,
      mimeType: doc.mime_type,
      category: doc.category || 'other',
      uploadedAt: doc.created_at,
      description: doc.description,
      uploader: `${doc.uploader_first_name || ''} ${doc.uploader_last_name || ''}`.trim(),
    }))

    res.json(documents)
  } catch (error) {
    console.error('Error fetching user documents:', error)
    res.status(500).json({ error: 'Failed to fetch user documents' })
  }
})

router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id
    const { category, description } = req.body
    const file = req.file

    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' })
    }

    const s3Key = `user-documents/${userId}/${Date.now()}-${file.originalname}`
    await uploadToS3(file, s3Key)

    const result = await query(
      `INSERT INTO user_documents (user_id, name, file_path, file_size, mime_type, category, description, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, file.originalname, s3Key, file.size, file.mimetype, category || 'other', description, userId]
    )

    const doc = result.rows[0]
    res.status(201).json({
      id: doc.id,
      name: doc.name,
      url: `/api/user-documents/${doc.id}/download`,
      size: doc.file_size,
      mimeType: doc.mime_type,
      category: doc.category,
      uploadedAt: doc.created_at,
      description: doc.description,
    })
  } catch (error) {
    console.error('Error uploading user document:', error)
    res.status(500).json({ error: 'Failed to upload document' })
  }
})

router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const result = await query(
      'SELECT * FROM user_documents WHERE id = $1 AND user_id = $2',
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' })
    }

    const doc = result.rows[0]
    const s3Response = await getFromS3(doc.file_path)
    const stream = s3Response.Body

    res.setHeader('Content-Type', doc.mime_type)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`)
    res.setHeader('Content-Length', doc.file_size)

    stream.transformToByteArray().then(bytes => {
      res.send(Buffer.from(bytes))
    })
  } catch (error) {
    console.error('Error downloading user document:', error)
    res.status(500).json({ error: 'Failed to download document' })
  }
})

router.get('/:id/preview', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const result = await query(
      'SELECT * FROM user_documents WHERE id = $1 AND user_id = $2',
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' })
    }

    const doc = result.rows[0]
    const s3Response = await getFromS3(doc.file_path)
    const stream = s3Response.Body

    res.setHeader('Content-Type', doc.mime_type)
    res.setHeader('Content-Length', doc.file_size)

    stream.transformToByteArray().then(bytes => {
      res.send(Buffer.from(bytes))
    })
  } catch (error) {
    console.error('Error previewing user document:', error)
    res.status(500).json({ error: 'Failed to preview document' })
  }
})

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const result = await query(
      'SELECT * FROM user_documents WHERE id = $1 AND user_id = $2',
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' })
    }

    const doc = result.rows[0]

    await deleteFromS3(doc.file_path)
    await query('DELETE FROM user_documents WHERE id = $1', [id])

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting user document:', error)
    res.status(500).json({ error: 'Failed to delete document' })
  }
})

export default router
