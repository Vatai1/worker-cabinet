import express from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errors.js'
import { uploadToS3, getFromS3, getPresignedUrl } from '../config/s3.js'
import { notifyBatch } from '../config/notifications.js'
import multer from 'multer'

const router = express.Router()

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Допускаются только изображения'))
    }
  },
})

function getPublicApiUrl() {
  return process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || 'http://host.docker.internal:5000/api'
}

/**
 * @swagger
 * /mailings/upload:
 *   post:
 *     tags: [Mailings]
 *     summary: Загрузить изображение для рассылки (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Данные загруженного файла
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file_key:
 *                   type: string
 *                 mime_type:
 *                   type: string
 *                 size:
 *                   type: integer
 */
router.post('/upload', authenticateToken, authorizeRoles('hr', 'admin'), uploadImage.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('Файл не загружен')

  const ext = req.file.originalname?.split('.').pop() || 'bin'
  const fileKey = `mailings/${Date.now()}-${crypto.randomUUID()}.${ext}`
  await uploadToS3(req.file, fileKey)

  res.json({ file_key: fileKey, mime_type: req.file.mimetype, size: req.file.size })
}))

/**
 * @swagger
 * /mailings:
 *   post:
 *     tags: [Mailings]
 *     summary: Создать рассылку (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *               - channel
 *               - recipients
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     file_key:
 *                       type: string
 *                     mime_type:
 *                       type: string
 *                     size:
 *                       type: integer
 *               channel:
 *                 type: string
 *                 enum: [email, site, both]
 *               recipients:
 *                 type: object
 *                 properties:
 *                   userIds:
 *                     type: array
 *                     items:
 *                       type: integer
 *                   positions:
 *                     type: array
 *                     items:
 *                       type: string
 *                   departmentIds:
 *                     type: array
 *                     items:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Рассылка создана
 */
router.post('/', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { title, message, images = [], channel, recipients = {} } = req.body

  if (!title?.trim()) throw new ValidationError('Заголовок обязателен')
  if (!message?.trim()) throw new ValidationError('Сообщение обязательно')

  const validChannels = ['email', 'site', 'both']
  if (!validChannels.includes(channel)) throw new ValidationError('Недопустимый канал доставки')

  const { userIds = [], positions = [], departmentIds = [] } = recipients
  if (userIds.length === 0 && positions.length === 0 && departmentIds.length === 0) {
    throw new ValidationError('Укажите хотя бы один критерий получателей')
  }

  const recipientResult = await query(
    `SELECT DISTINCT u.id FROM users u WHERE u.status = 'active' AND (
      ($1::int[] IS NOT NULL AND $1::int[] != '{}' AND u.id = ANY($1::int[]))
      OR ($2::text[] IS NOT NULL AND $2::text[] != '{}' AND u.position = ANY($2::text[]))
      OR ($3::int[] IS NOT NULL AND $3::int[] != '{}' AND u.department_id = ANY($3::int[]))
    )`,
    [userIds.length > 0 ? userIds : null, positions.length > 0 ? positions : null, departmentIds.length > 0 ? departmentIds : null]
  )

  if (recipientResult.rows.length === 0) {
    throw new ValidationError('Нет получателей по заданным критериям')
  }

  const recipientUserIds = recipientResult.rows.map(r => r.id)

  const token = jwt.sign(
    { type: 'mailing_image', exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    process.env.JWT_SECRET
  )

  const imageUrls = images.map(img => {
    const encodedKey = encodeURIComponent(img.file_key).replace(/%2F/g, '/')
    return `${getPublicApiUrl()}/mailings/images/${encodedKey}/${token}`
  })

  const client = await getClient()
  try {
    await client.query('BEGIN')

    const campaignResult = await client.query(
      `INSERT INTO mailing_campaigns (title, message, images, channel, created_by, recipient_count)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, message, JSON.stringify(images), channel, req.user.id, recipientUserIds.length]
    )
    const campaign = campaignResult.rows[0]

    for (const userId of recipientUserIds) {
      await client.query(
        `INSERT INTO mailing_campaign_recipients (campaign_id, user_id) VALUES ($1, $2)`,
        [campaign.id, userId]
      )
    }

    if (channel === 'email' || channel === 'both') {
      await notifyBatch({ userIds: recipientUserIds, type: 'mailing', channel: 'email', data: { title, message, imageUrls } })
    }
    if (channel === 'site' || channel === 'both') {
      await notifyBatch({ userIds: recipientUserIds, type: 'mailing', channel: 'site', data: { title, message, imageUrls } })
    }

    await client.query('COMMIT')
    res.status(201).json({ campaign, recipientsCount: recipientUserIds.length })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

/**
 * @swagger
 * /mailings:
 *   get:
 *     tags: [Mailings]
 *     summary: Список рассылок (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Массив рассылок
 */
router.get('/', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT mc.id, mc.title, mc.channel, mc.recipient_count, mc.created_at,
            u.first_name, u.last_name
     FROM mailing_campaigns mc
     LEFT JOIN users u ON mc.created_by = u.id
     ORDER BY mc.created_at DESC
     LIMIT 50`
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /mailings/{id}:
 *   get:
 *     tags: [Mailings]
 *     summary: Детали рассылки с получателями (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Рассылка и список получателей
 *       404:
 *         description: Рассылка не найдена
 */
router.get('/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const campaignResult = await query(
    `SELECT mc.*,
            u.first_name as creator_first_name, u.last_name as creator_last_name
     FROM mailing_campaigns mc
     LEFT JOIN users u ON mc.created_by = u.id
     WHERE mc.id = $1`,
    [req.params.id]
  )
  if (campaignResult.rows.length === 0) throw new NotFoundError('Рассылка не найдена')

  const recipientsResult = await query(
    `SELECT mcr.status, mcr.error, mcr.created_at,
            u.first_name, u.last_name, u.email, u.position
     FROM mailing_campaign_recipients mcr
     JOIN users u ON mcr.user_id = u.id
     WHERE mcr.campaign_id = $1
     ORDER BY u.last_name, u.first_name`,
    [req.params.id]
  )

  const sentCount = recipientsResult.rows.filter(r => r.status === 'sent').length
  const failedCount = recipientsResult.rows.filter(r => r.status === 'failed').length

  res.json({
    ...campaignResult.rows[0],
    recipients: recipientsResult.rows,
    sentCount,
    failedCount,
  })
}))

/**
 * @swagger
 * /mailings/images/{fileKey}/{token}:
 *   get:
 *     tags: [Mailings]
 *     summary: Публичный доступ к изображению рассылки по JWT-токену
 *     parameters:
 *       - in: path
 *         name: fileKey
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Изображение (binary)
 *       401:
 *         description: Недействительный токен
 *       404:
 *         description: Файл не найден
 */
router.get('/images/:fileKey/:token', asyncHandler(async (req, res) => {
  let decoded
  try {
    decoded = jwt.verify(req.params.token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' })
  }
  if (decoded.type !== 'mailing_image') {
    return res.status(403).json({ error: 'Неверный тип токена' })
  }

  const fileKey = decodeURIComponent(req.params.fileKey)
  if (!fileKey.startsWith('mailings/')) {
    return res.status(403).json({ error: 'Неверный путь к файлу' })
  }

  try {
    const { Body, ContentType } = await getFromS3(fileKey)
    res.setHeader('Content-Type', ContentType || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=604800')
    Body.pipe(res)
  } catch {
    res.status(404).json({ error: 'Файл не найден' })
  }
}))

export default router
