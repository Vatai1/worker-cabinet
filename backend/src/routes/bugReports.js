import express from 'express'
import multer from 'multer'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler, ValidationError } from '../middleware/errors.js'
import { query } from '../config/database.js'
import { uploadToS3, deleteFromS3, getPresignedUrl } from '../config/s3.js'
import { notify, notifyBatch } from '../config/notifications.js'
import { inTransaction } from '../config/database.js'
import { requirePermission } from '../lib/permissions.js'

const router = express.Router()
const MAX_IMAGES = 5
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_IMAGES + 1 },
  fileFilter: (req, file, cb) => cb(IMAGE_TYPES.has(file.mimetype) ? null : new ValidationError('Можно прикрепить только изображения PNG, JPEG, GIF или WebP'), IMAGE_TYPES.has(file.mimetype)),
})
const uploadFields = upload.fields([{ name: 'screenshot', maxCount: 1 }, { name: 'images', maxCount: MAX_IMAGES }])

function bugReportUpload(req, res, next) {
  uploadFields(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ValidationError('Изображение не должно превышать 10 МБ'))
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return next(new ValidationError(`Можно прикрепить не больше ${MAX_IMAGES} изображений`))
    next(err instanceof ValidationError ? err : new ValidationError(err.message || 'Не удалось загрузить файл'))
  })
}

const s3KeyFor = (userId, file) => `bug-reports/${Date.now()}-${userId}-${Math.random().toString(36).slice(2, 8)}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`

const MAX_ACTIONS = 100

function parseActions(raw, max = MAX_ACTIONS) {
  try {
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(list)) return null
    return JSON.stringify(list.slice(-max).map((a) => ({
      t: String(a?.t ?? '').slice(0, 40),
      type: String(a?.type ?? '').slice(0, 20),
      text: String(a?.text ?? '').slice(0, 500),
      path: String(a?.path ?? '').slice(0, 300),
    })))
  } catch {
    return null
  }
}

/**
 * @swagger
 * /bug-reports/client-error:
 *   post:
 *     tags: [BugReports]
 *     summary: Ошибка JavaScript из браузера
 *     description: 'Пишется в журнал ошибок (error_log) с module=frontend и последними действиями пользователя (actions, до 30)'
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string }
 *               stack: { type: string }
 *               path: { type: string }
 *               actions: { type: array, items: { type: object } }
 *     responses:
 *       204: { description: Записано }
 */
router.post('/client-error', authenticateToken, asyncHandler(async (req, res) => {
  const { message, stack, path } = req.body || {}
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Укажите message' })
  await query(
    `INSERT INTO error_log (message, stack, path, method, status_code, user_id, user_email, ip, module, actions)
     VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, 'frontend', $7)`,
    [
      message.slice(0, 2000),
      typeof stack === 'string' ? stack.slice(0, 5000) : null,
      typeof path === 'string' ? path.slice(0, 500) : null,
      req.user.id,
      req.user.email || null,
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
      parseActions(req.body.actions, 30),
    ]
  )
  res.status(204).end()
}))

router.post('/', authenticateToken, bugReportUpload, asyncHandler(async (req, res) => {
  const { title, description, page_url, browser_info } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' })

  const screenshot = req.files?.screenshot?.[0]
  let s3Key = null
  if (screenshot) {
    s3Key = s3KeyFor(req.user.id, screenshot)
    await uploadToS3(screenshot, s3Key)
  }
  const imageKeys = []
  for (const file of req.files?.images ?? []) {
    const key = s3KeyFor(req.user.id, file)
    await uploadToS3(file, key)
    imageKeys.push(key)
  }

  const admins = await query("SELECT id FROM users WHERE role IN ('admin', 'superadmin') AND status <> 'inactive'")
  const reporterName = await query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id])
  const name = reporterName.rows[0] ? `${reporterName.rows[0].last_name} ${reporterName.rows[0].first_name}` : 'Пользователь'

  const report = await inTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO bug_reports (user_id, title, description, screenshot_s3_key, image_s3_keys, page_url, browser_info, actions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, title.trim(), description || null, s3Key, imageKeys, page_url || null, browser_info || null, parseActions(req.body.actions)]
    )
    await notifyBatch({
      userIds: admins.rows.map((a) => a.id),
      type: 'bug_report_new',
      data: { reportId: result.rows[0].id, title: title.trim(), author: name, link: '/admin/global' },
      db: client,
    })
    return result.rows[0]
  })

  res.status(201).json(report)
}))

router.get('/', authenticateToken, requirePermission('bug_reports:manage'), asyncHandler(async (req, res) => {
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

router.get('/stats', authenticateToken, requirePermission('bug_reports:manage'), asyncHandler(async (req, res) => {
  const byStatus = await query(`SELECT status, COUNT(*)::int as count FROM bug_reports GROUP BY status`)
  const byPriority = await query(`SELECT priority, COUNT(*)::int as count FROM bug_reports GROUP BY priority`)
  res.json({ byStatus: byStatus.rows, byPriority: byPriority.rows })
}))

router.patch('/:id', authenticateToken, requirePermission('bug_reports:manage'), asyncHandler(async (req, res) => {
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

  const report = existing.rows[0]
  await inTransaction(async (client) => {
    if (updates.length > 0) {
      updates.push('reviewed_at = NOW()')
      updates.push('reviewed_by = ' + req.user.id)
      updates.push('updated_at = NOW()')
      params.push(id)
      await client.query(`UPDATE bug_reports SET ${updates.join(', ')} WHERE id = $${params.length}`, params)
    }
    if (replyChanged) {
      await notify({
        userId: report.user_id,
        type: 'bug_report_reply',
        data: { reportId: id, title: report.title, subject: `Ответ на баг-репорт: ${report.title}`, message: reply },
        db: client,
      })
    }
    if (status && status !== report.status) {
      await notify({
        userId: report.user_id,
        type: 'bug_report_update',
        data: { reportId: id, title: report.title, status },
        db: client,
      })
    }
  })

  const updated = await query(`SELECT br.*, u.first_name AS reporter_first, u.last_name AS reporter_last, ru.first_name AS reviewer_first, ru.last_name AS reviewer_last, rpu.first_name AS replier_first, rpu.last_name AS replier_last FROM bug_reports br LEFT JOIN users u ON br.user_id = u.id LEFT JOIN users ru ON br.reviewed_by = ru.id LEFT JOIN users rpu ON br.user_reply_by = rpu.id WHERE br.id = $1`, [id])
  const r = updated.rows[0]
  res.json({
    ...r,
    reporter_name: `${r.reporter_last || ''} ${r.reporter_first || ''}`.trim(),
    reviewer_name: r.reviewer_first ? `${r.reviewer_last || ''} ${r.reviewer_first || ''}`.trim() : null,
    replier_name: r.replier_first ? `${r.replier_last || ''} ${r.replier_first || ''}`.trim() : null,
  })
}))

router.delete('/:id', authenticateToken, requirePermission('bug_reports:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const result = await query('SELECT screenshot_s3_key, image_s3_keys FROM bug_reports WHERE id = $1', [id])
  if (result.rows.length === 0) return res.status(404).json({ error: 'Баг-репорт не найден' })
  for (const key of [result.rows[0].screenshot_s3_key, ...(result.rows[0].image_s3_keys ?? [])].filter(Boolean)) {
    await deleteFromS3(key).catch(() => {})
  }
  await query('DELETE FROM bug_reports WHERE id = $1', [id])
  res.json({ deleted: true })
}))

router.get('/:id/screenshot', authenticateToken, requirePermission('bug_reports:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const result = await query('SELECT screenshot_s3_key, image_s3_keys FROM bug_reports WHERE id = $1', [id])
  const row = result.rows[0]
  if (!row || (!row.screenshot_s3_key && !row.image_s3_keys?.length)) {
    return res.status(404).json({ error: 'Скриншот не найден' })
  }
  res.json({
    url: row.screenshot_s3_key ? await getPresignedUrl(row.screenshot_s3_key) : null,
    images: await Promise.all((row.image_s3_keys ?? []).map((key) => getPresignedUrl(key))),
  })
}))

export default router
