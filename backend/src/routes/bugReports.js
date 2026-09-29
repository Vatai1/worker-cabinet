import express from 'express'
import multer from 'multer'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { query } from '../config/database.js'
import { uploadToS3, deleteFromS3, getPresignedUrl } from '../config/s3.js'
import { notify } from '../config/notifications.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.post('/', authenticateToken, upload.single('screenshot'), asyncHandler(async (req, res) => {
  const { title, description, page_url, browser_info } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' })

  let s3Key = null
  if (req.file) {
    s3Key = `bug-reports/${Date.now()}-${req.user.id}-${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`
    await uploadToS3(req.file, s3Key)
  }

  const result = await query(
    `INSERT INTO bug_reports (user_id, title, description, screenshot_s3_key, page_url, browser_info)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.user.id, title.trim(), description || null, s3Key, page_url || null, browser_info || null]
  )

  const report = result.rows[0]
  const admins = await query("SELECT id FROM users WHERE role IN ('admin', 'superadmin')")
  const reporterName = await query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id])
  const name = reporterName.rows[0] ? `${reporterName.rows[0].last_name} ${reporterName.rows[0].first_name}` : 'Пользователь'

  for (const admin of admins.rows) {
    notify({
      userId: admin.id,
      type: 'bug_report_new',
      data: { reportId: report.id, title: title.trim(), author: name, link: '/admin/global' }
    }).catch(() => {})
  }

  res.status(201).json(report)
}))

router.get('/', authenticateToken, authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const { status, priority, search } = req.query
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
  const offset = (page - 1) * limit

  let where = 'WHERE 1=1'
  const params = []
  if (status) { params.push(status); where += ` AND br.status = $${params.length}` }
  if (priority) { params.push(priority); where += ` AND br.priority = $${params.length}` }
  if (search) { params.push(`%${search}%`); where += ` AND (br.title ILIKE $${params.length} OR br.description ILIKE $${params.length})` }

  const countResult = await query(`SELECT COUNT(*) FROM bug_reports br ${where}`, params)
  const total = parseInt(countResult.rows[0].count)

  params.push(limit, offset)
  const result = await query(
    `SELECT br.*, 
       u.first_name AS reporter_first, u.last_name AS reporter_last,
       ru.first_name AS reviewer_first, ru.last_name AS reviewer_last,
       rpu.first_name AS replier_first, rpu.last_name AS replier_last
     FROM bug_reports br
     LEFT JOIN users u ON br.user_id = u.id
     LEFT JOIN users ru ON br.reviewed_by = ru.id
     LEFT JOIN users rpu ON br.user_reply_by = rpu.id
     ${where}
     ORDER BY br.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )

  res.json({
    data: result.rows.map(r => ({
      ...r,
      reporter_name: `${r.reporter_last || ''} ${r.reporter_first || ''}`.trim(),
      reviewer_name: r.reviewer_first ? `${r.reviewer_last || ''} ${r.reviewer_first || ''}`.trim() : null,
      replier_name: r.replier_first ? `${r.replier_last || ''} ${r.replier_first || ''}`.trim() : null,
    })),
    total, page, limit
  })
}))

router.get('/stats', authenticateToken, authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const byStatus = await query(`SELECT status, COUNT(*)::int as count FROM bug_reports GROUP BY status`)
  const byPriority = await query(`SELECT priority, COUNT(*)::int as count FROM bug_reports GROUP BY priority`)
  res.json({ byStatus: byStatus.rows, byPriority: byPriority.rows })
}))

router.patch('/:id', authenticateToken, authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status, priority, admin_comment, user_reply } = req.body

  const existing = await query('SELECT * FROM bug_reports WHERE id = $1', [id])
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Баг-репорт не найден' })

  const updates = []
  const params = []
  if (status) { params.push(status); updates.push(`status = $${params.length}`) }
  if (priority) { params.push(priority); updates.push(`priority = $${params.length}`) }
  if (admin_comment !== undefined) { params.push(admin_comment); updates.push(`admin_comment = $${params.length}`) }
  const reply = typeof user_reply === 'string' ? user_reply.trim() : ''
  if (user_reply !== undefined && typeof user_reply !== 'string') return res.status(400).json({ error: 'Некорректный ответ' })
  if (reply.length > 5000) return res.status(400).json({ error: 'Ответ слишком длинный' })
  const replyChanged = reply !== '' && reply !== (existing.rows[0].user_reply || '')
  if (replyChanged) {
    params.push(reply)
    updates.push(`user_reply = $${params.length}`)
    updates.push('user_reply_at = NOW()')
    params.push(req.user.id)
    updates.push(`user_reply_by = $${params.length}`)
  }

  if (updates.length > 0) {
    updates.push('reviewed_at = NOW()')
    updates.push('reviewed_by = ' + req.user.id)
    updates.push('updated_at = NOW()')
    params.push(id)
    await query(`UPDATE bug_reports SET ${updates.join(', ')} WHERE id = $${params.length}`, params)
  }

  const report = existing.rows[0]
  if (replyChanged) {
    notify({
      userId: report.user_id,
      type: 'bug_report_reply',
      data: { reportId: id, title: report.title, subject: `Ответ на баг-репорт: ${report.title}`, message: reply },
    }).catch(() => {})
  }
  if (status && status !== report.status) {
    notify({
      userId: report.user_id,
      type: 'bug_report_update',
      data: { reportId: id, title: report.title, status, link: '/dashboard' }
    }).catch(() => {})
  }

  const updated = await query(`SELECT br.*, u.first_name AS reporter_first, u.last_name AS reporter_last, ru.first_name AS reviewer_first, ru.last_name AS reviewer_last, rpu.first_name AS replier_first, rpu.last_name AS replier_last FROM bug_reports br LEFT JOIN users u ON br.user_id = u.id LEFT JOIN users ru ON br.reviewed_by = ru.id LEFT JOIN users rpu ON br.user_reply_by = rpu.id WHERE br.id = $1`, [id])
  const r = updated.rows[0]
  res.json({
    ...r,
    reporter_name: `${r.reporter_last || ''} ${r.reporter_first || ''}`.trim(),
    reviewer_name: r.reviewer_first ? `${r.reviewer_last || ''} ${r.reviewer_first || ''}`.trim() : null,
    replier_name: r.replier_first ? `${r.replier_last || ''} ${r.replier_first || ''}`.trim() : null,
  })
}))

router.delete('/:id', authenticateToken, authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const result = await query('SELECT screenshot_s3_key FROM bug_reports WHERE id = $1', [id])
  if (result.rows.length === 0) return res.status(404).json({ error: 'Баг-репорт не найден' })
  if (result.rows[0].screenshot_s3_key) {
    await deleteFromS3(result.rows[0].screenshot_s3_key).catch(() => {})
  }
  await query('DELETE FROM bug_reports WHERE id = $1', [id])
  res.json({ deleted: true })
}))

router.get('/:id/screenshot', authenticateToken, authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const result = await query('SELECT screenshot_s3_key FROM bug_reports WHERE id = $1', [id])
  if (result.rows.length === 0 || !result.rows[0].screenshot_s3_key) {
    return res.status(404).json({ error: 'Скриншот не найден' })
  }
  const url = await getPresignedUrl(result.rows[0].screenshot_s3_key)
  res.json({ url })
}))

export default router
