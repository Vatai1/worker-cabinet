import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { uploadTemplate as uploadMiddleware } from '../middleware/upload.js'
import {
  uploadTemplate,
  deleteTemplate,
  getTemplateUrl,
  handleOnlyOfficeCallback,
} from '../services/templateService.js'

const router = express.Router()

// GET /api/templates — list all (any authenticated user)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, category, mime_type as "mimeType",
              size, download_count as "downloadCount", created_at as "createdAt",
              file_key as "fileKey", purpose
       FROM document_templates
       ORDER BY created_at DESC`
    )
    const templates = await Promise.all(
      result.rows.map(async (t) => ({
        ...t,
        url: await getTemplateUrl(t.fileKey),
      }))
    )
    res.json(templates)
  } catch (error) {
    console.error('GET /templates error:', error)
    res.status(500).json({ error: 'Ошибка загрузки шаблонов' })
  }
})

// POST /api/templates — upload (HR/admin only)
router.post(
  '/',
  authenticateToken,
  authorizeRoles('hr', 'admin'),
  uploadMiddleware.single('file'),
  async (req, res) => {
    try {
      const { name, description, category } = req.body
      if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' })
      if (!['hr', 'legal', 'finance', 'general'].includes(category)) {
        return res.status(400).json({ error: 'Недопустимая категория' })
      }
      if (!req.file) return res.status(400).json({ error: 'Файл обязателен' })

      const template = await uploadTemplate(req.file, { name, description, category }, req.user.id)
      res.status(201).json({ ...template, url: await getTemplateUrl(template.file_key) })
    } catch (error) {
      console.error('POST /templates error:', error)
      res.status(500).json({ error: 'Ошибка загрузки шаблона' })
    }
  }
)

// PUT /api/templates/:id — update metadata (HR/admin only)
router.put('/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, category } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' })
    if (!['hr', 'legal', 'finance', 'general'].includes(category)) {
      return res.status(400).json({ error: 'Недопустимая категория' })
    }
    const result = await query(
      `UPDATE document_templates SET name = $1, description = $2, category = $3
       WHERE id = $4 RETURNING *`,
      [name, description || null, category, id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' })
    res.json({ ...result.rows[0], url: await getTemplateUrl(result.rows[0].file_key) })
  } catch (error) {
    console.error('PUT /templates/:id error:', error)
    res.status(500).json({ error: 'Ошибка обновления шаблона' })
  }
})

// DELETE /api/templates/:id (HR/admin only)
router.delete('/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    await deleteTemplate(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /templates/:id error:', error)
    res.status(500).json({ error: 'Ошибка удаления шаблона' })
  }
})

// GET /api/templates/:id/onlyoffice — get S3 URL for OnlyOffice edit (HR/admin only)
router.get('/:id/onlyoffice', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const result = await query(
      'SELECT id, file_key, name, mime_type FROM document_templates WHERE id = $1',
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' })
    const t = result.rows[0]
    res.json({
      url: await getTemplateUrl(t.file_key),
      key: `template-${t.id}-${Date.now()}`,
      name: t.name,
      mimeType: t.mime_type,
    })
  } catch (error) {
    console.error('GET /templates/:id/onlyoffice error:', error)
    res.status(500).json({ error: 'Ошибка получения URL' })
  }
})

// POST /api/templates/:id/onlyoffice/callback — called by OnlyOffice server (no auth)
router.post('/:id/onlyoffice/callback', async (req, res) => {
  try {
    await handleOnlyOfficeCallback(req.params.id, req.body)
    res.json({ error: 0 })
  } catch (error) {
    console.error('OnlyOffice callback error:', error)
    res.json({ error: 1 })
  }
})

// POST /api/templates/:id/download — increment counter + return URL
router.post('/:id/download', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `UPDATE document_templates SET download_count = download_count + 1
       WHERE id = $1 RETURNING file_key`,
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' })
    res.json({ url: await getTemplateUrl(result.rows[0].file_key) })
  } catch (error) {
    console.error('POST /templates/:id/download error:', error)
    res.status(500).json({ error: 'Ошибка' })
  }
})

router.put('/:id/purpose', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  const { id } = req.params
  const { purpose } = req.body
  if (purpose !== 'vacation_statement' && purpose !== null) {
    return res.status(400).json({ error: 'Недопустимое значение purpose' })
  }
  try {
    if (purpose === null) {
      const result = await query(
        `UPDATE document_templates SET purpose = NULL WHERE id = $1 RETURNING *`,
        [id]
      )
      if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' })
      return res.json({ ...result.rows[0], url: await getTemplateUrl(result.rows[0].file_key) })
    }
    await query(`UPDATE document_templates SET purpose = NULL WHERE purpose = $1`, [purpose])
    const result = await query(
      `UPDATE document_templates SET purpose = $1 WHERE id = $2 RETURNING *`,
      [purpose, id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' })
    res.json({ ...result.rows[0], url: await getTemplateUrl(result.rows[0].file_key) })
  } catch (error) {
    console.error('PUT /templates/:id/purpose error:', error)
    res.status(500).json({ error: 'Ошибка обновления шаблона' })
  }
})

export default router
