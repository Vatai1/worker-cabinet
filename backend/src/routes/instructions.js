import { Router } from 'express'
import fs from 'node:fs'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import { query } from '../config/database.js'
import { authenticateToken, authorizeGlobalRoles } from '../middleware/auth.js'
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errors.js'
import { uploadStreamToS3, deleteFromS3, getPresignedUrl } from '../config/s3.js'

const router = Router()

const AUDIENCES = ['all', 'manager']
const PLACEMENTS = ['vacation-create', 'vacation-transfer', 'vacation-approve', 'vacation-restrictions']
const VIDEO_MIMES = { 'video/mp4': 'mp4', 'video/webm': 'webm' }
const POSTER_MIMES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_VIDEO_SIZE = 500 * 1024 * 1024
const MAX_POSTER_SIZE = 5 * 1024 * 1024
const URL_TTL_SECONDS = 6 * 60 * 60
const MANAGER_ROLES = ['manager', 'hr', 'admin', 'superadmin']

const uploadInstruction = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `instruction-${randomUUID()}`),
  }),
  limits: { fileSize: MAX_VIDEO_SIZE, files: 2 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video' && VIDEO_MIMES[file.mimetype]) return cb(null, true)
    if (file.fieldname === 'poster' && POSTER_MIMES[file.mimetype]) return cb(null, true)
    cb(new ValidationError(file.fieldname === 'poster' ? 'Обложка должна быть JPEG, PNG или WebP' : 'Видео должно быть в формате MP4 или WebM'))
  },
}).fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }])

function handleUpload(req, res, next) {
  uploadInstruction(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ValidationError('Видео не должно превышать 500 МБ'))
    next(err instanceof ValidationError ? err : new ValidationError(err.message || 'Не удалось загрузить файл'))
  })
}

function removeTempFiles(req) {
  for (const list of Object.values(req.files || {})) {
    for (const f of list) fs.promises.unlink(f.path).catch(() => {})
  }
}

async function readHeader(filePath, length = 12) {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, 0)
    return buf
  } finally {
    await handle.close()
  }
}

async function verifySignature(file) {
  const head = await readHeader(file.path)
  if (file.mimetype === 'video/mp4') return head.subarray(4, 8).toString('ascii') === 'ftyp'
  if (file.mimetype === 'video/webm') return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
  if (file.mimetype === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
  if (file.mimetype === 'image/png') return head[0] === 0x89 && head.subarray(1, 4).toString('ascii') === 'PNG'
  if (file.mimetype === 'image/webp') return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

async function storeFile(file, prefix, ext) {
  if (!(await verifySignature(file))) {
    throw new ValidationError('Содержимое файла не соответствует его формату')
  }
  const key = `instructions/${prefix}-${randomUUID()}.${ext}`
  await uploadStreamToS3(fs.createReadStream(file.path), key, file.mimetype, file.size)
  return key
}

function parseFields(body, { partial }) {
  const fields = {}
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim()
    if (!title) throw new ValidationError('Укажите название инструкции')
    if (title.length > 255) throw new ValidationError('Название не должно превышать 255 символов')
    fields.title = title
  }
  if (body.description !== undefined) fields.description = String(body.description).trim() || null
  if (!partial || body.audience !== undefined) {
    const audience = body.audience || 'all'
    if (!AUDIENCES.includes(audience)) throw new ValidationError('Некорректная аудитория')
    fields.audience = audience
  }
  if (body.placement !== undefined) {
    const placement = String(body.placement || '').trim() || null
    if (placement && !PLACEMENTS.includes(placement)) throw new ValidationError('Некорректное место показа')
    fields.placement = placement
  }
  if (body.sortOrder !== undefined) {
    const order = parseInt(body.sortOrder)
    if (Number.isNaN(order)) throw new ValidationError('Порядок должен быть числом')
    fields.sort_order = order
  }
  if (body.isActive !== undefined) fields.is_active = body.isActive === true || body.isActive === 'true'
  return fields
}

async function toDto(row, { admin = false } = {}) {
  const [src, poster] = await Promise.all([
    getPresignedUrl(row.video_key, URL_TTL_SECONDS),
    row.poster_key ? getPresignedUrl(row.poster_key, URL_TTL_SECONDS) : Promise.resolve(null),
  ])
  const dto = {
    id: row.id,
    title: row.title,
    description: row.description,
    audience: row.audience,
    placement: row.placement,
    sortOrder: row.sort_order,
    src,
    poster,
  }
  if (admin) {
    Object.assign(dto, {
      isActive: row.is_active,
      videoSize: row.video_size === null ? null : Number(row.video_size),
      videoMime: row.video_mime,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }
  return dto
}

function parseId(raw) {
  const id = parseInt(raw)
  if (Number.isNaN(id)) throw new NotFoundError('Инструкция не найдена')
  return id
}

function seesManagerVideos(req) {
  return MANAGER_ROLES.includes(req.user.role) || MANAGER_ROLES.includes(req.org?.org_role)
}

/**
 * @swagger
 * /instructions:
 *   get:
 *     tags: [Instructions]
 *     summary: Активные видеоинструкции для текущего пользователя
 *     description: 'Работник получает инструкции с audience=all; manager/hr/admin/superadmin — ещё и audience=manager. src и poster — временные ссылки (6 часов)'
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Массив { id, title, description, audience, placement, sortOrder, src, poster }'
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const audiences = seesManagerVideos(req) ? AUDIENCES : ['all']
  const result = await query(
    `SELECT * FROM instruction_videos WHERE is_active = true AND audience = ANY($1) ORDER BY sort_order, id`,
    [audiences]
  )
  res.json(await Promise.all(result.rows.map((row) => toDto(row))))
}))

/**
 * @swagger
 * /instructions/admin:
 *   get:
 *     tags: [Instructions]
 *     summary: Все видеоинструкции, включая скрытые (суперадмин)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Массив инструкций с полями isActive, videoSize, videoMime, createdAt, updatedAt'
 *       403:
 *         description: Только для суперадмина
 */
router.get('/admin', authenticateToken, authorizeGlobalRoles('superadmin'), asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM instruction_videos ORDER BY sort_order, id')
  res.json(await Promise.all(result.rows.map((row) => toDto(row, { admin: true }))))
}))

/**
 * @swagger
 * /instructions/admin:
 *   post:
 *     tags: [Instructions]
 *     summary: Загрузить видеоинструкцию (суперадмин)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, video]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               audience: { type: string, enum: [all, manager] }
 *               placement: { type: string, enum: [vacation-create, vacation-transfer, vacation-approve, vacation-restrictions] }
 *               sortOrder: { type: integer }
 *               isActive: { type: boolean }
 *               video: { type: string, format: binary, description: 'MP4 или WebM, до 500 МБ' }
 *               poster: { type: string, format: binary, description: 'JPEG, PNG или WebP, до 5 МБ' }
 *     responses:
 *       201:
 *         description: Инструкция создана
 *       400:
 *         description: Ошибка валидации
 */
router.post('/admin', authenticateToken, authorizeGlobalRoles('superadmin'), handleUpload, asyncHandler(async (req, res) => {
  const uploaded = []
  try {
    const fields = parseFields(req.body, { partial: false })
    const video = req.files?.video?.[0]
    const poster = req.files?.poster?.[0]
    if (!video) throw new ValidationError('Прикрепите видеофайл')
    if (poster && poster.size > MAX_POSTER_SIZE) throw new ValidationError('Обложка не должна превышать 5 МБ')

    const videoKey = await storeFile(video, 'video', VIDEO_MIMES[video.mimetype])
    uploaded.push(videoKey)
    const posterKey = poster ? await storeFile(poster, 'poster', POSTER_MIMES[poster.mimetype]) : null
    if (posterKey) uploaded.push(posterKey)

    const result = await query(
      `INSERT INTO instruction_videos (title, description, audience, placement, sort_order, is_active, video_key, video_mime, video_size, poster_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [fields.title, fields.description ?? null, fields.audience, fields.placement ?? null, fields.sort_order ?? 0,
        fields.is_active ?? true, videoKey, video.mimetype, video.size, posterKey, req.user.id]
    )
    res.status(201).json(await toDto(result.rows[0], { admin: true }))
  } catch (error) {
    await Promise.all(uploaded.map((key) => deleteFromS3(key).catch(() => {})))
    throw error
  } finally {
    removeTempFiles(req)
  }
}))

/**
 * @swagger
 * /instructions/admin/{id}:
 *   put:
 *     tags: [Instructions]
 *     summary: Изменить видеоинструкцию (суперадмин)
 *     description: 'Все поля необязательны; новый video или poster заменяет старый файл. removePoster=true удаляет обложку'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Инструкция обновлена
 *       404:
 *         description: Инструкция не найдена
 */
router.put('/admin/:id', authenticateToken, authorizeGlobalRoles('superadmin'), handleUpload, asyncHandler(async (req, res) => {
  const uploaded = []
  try {
    const existing = await query('SELECT * FROM instruction_videos WHERE id = $1', [parseId(req.params.id)])
    if (existing.rows.length === 0) throw new NotFoundError('Инструкция не найдена')
    const current = existing.rows[0]

    const fields = parseFields(req.body, { partial: true })
    const video = req.files?.video?.[0]
    const poster = req.files?.poster?.[0]
    if (poster && poster.size > MAX_POSTER_SIZE) throw new ValidationError('Обложка не должна превышать 5 МБ')

    const obsolete = []
    if (video) {
      fields.video_key = await storeFile(video, 'video', VIDEO_MIMES[video.mimetype])
      uploaded.push(fields.video_key)
      fields.video_mime = video.mimetype
      fields.video_size = video.size
      obsolete.push(current.video_key)
    }
    if (poster) {
      fields.poster_key = await storeFile(poster, 'poster', POSTER_MIMES[poster.mimetype])
      uploaded.push(fields.poster_key)
      if (current.poster_key) obsolete.push(current.poster_key)
    } else if (req.body.removePoster === 'true' && current.poster_key) {
      fields.poster_key = null
      obsolete.push(current.poster_key)
    }

    const keys = Object.keys(fields)
    let row = current
    if (keys.length > 0) {
      const sets = keys.map((k, i) => `${k} = $${i + 1}`)
      const result = await query(
        `UPDATE instruction_videos SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
        [...keys.map((k) => fields[k]), current.id]
      )
      row = result.rows[0]
    }
    await Promise.all(obsolete.map((key) => deleteFromS3(key).catch(() => {})))
    res.json(await toDto(row, { admin: true }))
  } catch (error) {
    await Promise.all(uploaded.map((key) => deleteFromS3(key).catch(() => {})))
    throw error
  } finally {
    removeTempFiles(req)
  }
}))

/**
 * @swagger
 * /instructions/admin/{id}:
 *   delete:
 *     tags: [Instructions]
 *     summary: Удалить видеоинструкцию вместе с файлами (суперадмин)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Инструкция удалена
 *       404:
 *         description: Инструкция не найдена
 */
router.delete('/admin/:id', authenticateToken, authorizeGlobalRoles('superadmin'), asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM instruction_videos WHERE id = $1 RETURNING video_key, poster_key', [parseId(req.params.id)])
  if (result.rows.length === 0) throw new NotFoundError('Инструкция не найдена')
  const { video_key: videoKey, poster_key: posterKey } = result.rows[0]
  await Promise.all([videoKey, posterKey].filter(Boolean).map((key) => deleteFromS3(key).catch(() => {})))
  res.json({ success: true })
}))

export default router
