import express from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errors.js'
import { uploadToS3, deleteFromS3, getFromS3 } from '../config/s3.js'
import multer from 'multer'

const uploadDocTemplate = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Недопустимый тип файла'))
    }
  },
})

const router = express.Router()

/**
 * @swagger
 * /dictionaries/departments:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник отделов (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список отделов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Department' }
 */
router.get('/departments', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT d.id, d.name, d.manager_id, d.description, d.vacation_requests_blocked,
            m.first_name || ' ' || m.last_name as manager_name,
            (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
     FROM departments d
     LEFT JOIN users m ON d.manager_id = m.id
     ORDER BY d.name`
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /dictionaries/departments:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Создать отдел (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               manager_id: { type: integer }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Отдел создан
 *       409:
 *         description: Отдел с таким названием уже существует
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/departments', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { name, manager_id, description } = req.body
  if (!name?.trim()) throw new ValidationError('Название отдела обязательно')

  const existing = await query('SELECT id FROM departments WHERE name = $1', [name.trim()])
  if (existing.rows.length > 0) throw new ConflictError('Отдел с таким названием уже существует')

  const result = await query(
    'INSERT INTO departments (name, manager_id, description) VALUES ($1, $2, $3) RETURNING id, name, manager_id, description',
    [name.trim(), manager_id || null, description?.trim() || null]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/departments/{id}:
 *   put:
 *     tags: [Dictionaries]
 *     summary: Обновить отдел (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               manager_id: { type: integer }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Отдел обновлён
 */
router.put('/departments/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, manager_id, description } = req.body
  if (!name?.trim()) throw new ValidationError('Название отдела обязательно')

  const existing = await query('SELECT id FROM departments WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Отдел не найден')

  const duplicate = await query('SELECT id FROM departments WHERE name = $1 AND id != $2', [name.trim(), id])
  if (duplicate.rows.length > 0) throw new ConflictError('Отдел с таким названием уже существует')

  const result = await query(
    'UPDATE departments SET name = $1, manager_id = $2, description = $3 WHERE id = $4 RETURNING id, name, manager_id, description',
    [name.trim(), manager_id || null, description?.trim() || null, id]
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/departments/{id}:
 *   delete:
 *     tags: [Dictionaries]
 *     summary: Удалить отдел (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Отдел удалён
 */
router.delete('/departments/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query('SELECT id FROM departments WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Отдел не найден')

  const usersInDept = await query('SELECT COUNT(*) as cnt FROM users WHERE department_id = $1', [id])
  if (parseInt(usersInDept.rows[0].cnt) > 0) {
    throw new ConflictError('Нельзя удалить отдел, в котором есть сотрудники')
  }

  await query('DELETE FROM departments WHERE id = $1', [id])
  res.json({ success: true })
}))

/**
 * @swagger
 * /dictionaries/skills:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник навыков (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список навыков
 */
router.get('/skills', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT sd.id, sd.name, sd.created_at,
            (SELECT COUNT(*) FROM user_skills WHERE skill_id = sd.id) as user_count
     FROM skills_dictionary sd
     ORDER BY sd.name`
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /dictionaries/skills:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Создать навык (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Навык создан
 */
router.post('/skills', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название навыка обязательно')

  const existing = await query('SELECT id FROM skills_dictionary WHERE name = $1', [name.trim()])
  if (existing.rows.length > 0) throw new ConflictError('Навык с таким названием уже существует')

  const result = await query(
    'INSERT INTO skills_dictionary (name) VALUES ($1) RETURNING id, name',
    [name.trim()]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/skills/{id}:
 *   put:
 *     tags: [Dictionaries]
 *     summary: Обновить навык (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Навык обновлён
 */
router.put('/skills/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название навыка обязательно')

  const existing = await query('SELECT id FROM skills_dictionary WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Навык не найден')

  const duplicate = await query('SELECT id FROM skills_dictionary WHERE name = $1 AND id != $2', [name.trim(), id])
  if (duplicate.rows.length > 0) throw new ConflictError('Навык с таким названием уже существует')

  const result = await query(
    'UPDATE skills_dictionary SET name = $1 WHERE id = $2 RETURNING id, name',
    [name.trim(), id]
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/skills/{id}:
 *   delete:
 *     tags: [Dictionaries]
 *     summary: Удалить навык (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Навык удалён
 */
router.delete('/skills/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query('SELECT id FROM skills_dictionary WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Навык не найден')

  const usersWithSkill = await query('SELECT COUNT(*) as cnt FROM user_skills WHERE skill_id = $1', [id])
  if (parseInt(usersWithSkill.rows[0].cnt) > 0) {
    throw new ConflictError('Нельзя удалить навык, который привязан к сотрудникам')
  }

  await query('DELETE FROM skills_dictionary WHERE id = $1', [id])
  res.json({ success: true })
}))

/**
 * @swagger
 * /dictionaries/vacation-types:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник типов отпусков (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список типов отпусков
 */
router.get('/vacation-types', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT vt.id, vt.code, vt.name,
            (SELECT COUNT(*) FROM vacation_requests WHERE vacation_type_id = vt.id) as request_count
     FROM vacation_types vt
     ORDER BY vt.name`
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /dictionaries/vacation-types:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Создать тип отпуска (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Тип отпуска создан
 */
router.post('/vacation-types', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { code, name } = req.body
  if (!code?.trim()) throw new ValidationError('Код типа отпуска обязателен')
  if (!name?.trim()) throw new ValidationError('Название типа отпуска обязательно')

  const existingCode = await query('SELECT id FROM vacation_types WHERE code = $1', [code.trim()])
  if (existingCode.rows.length > 0) throw new ConflictError('Тип отпуска с таким кодом уже существует')

  const existingName = await query('SELECT id FROM vacation_types WHERE name = $1', [name.trim()])
  if (existingName.rows.length > 0) throw new ConflictError('Тип отпуска с таким названием уже существует')

  const result = await query(
    'INSERT INTO vacation_types (code, name) VALUES ($1, $2) RETURNING id, code, name',
    [code.trim(), name.trim()]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/vacation-types/{id}:
 *   put:
 *     tags: [Dictionaries]
 *     summary: Обновить тип отпуска (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Тип отпуска обновлён
 */
router.put('/vacation-types/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { code, name } = req.body
  if (!code?.trim()) throw new ValidationError('Код типа отпуска обязателен')
  if (!name?.trim()) throw new ValidationError('Название типа отпуска обязательно')

  const existing = await query('SELECT id FROM vacation_types WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Тип отпуска не найден')

  const dupCode = await query('SELECT id FROM vacation_types WHERE code = $1 AND id != $2', [code.trim(), id])
  if (dupCode.rows.length > 0) throw new ConflictError('Тип отпуска с таким кодом уже существует')

  const dupName = await query('SELECT id FROM vacation_types WHERE name = $1 AND id != $2', [name.trim(), id])
  if (dupName.rows.length > 0) throw new ConflictError('Тип отпуска с таким названием уже существует')

  const result = await query(
    'UPDATE vacation_types SET code = $1, name = $2 WHERE id = $3 RETURNING id, code, name',
    [code.trim(), name.trim(), id]
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/vacation-types/{id}:
 *   delete:
 *     tags: [Dictionaries]
 *     summary: Удалить тип отпуска (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Тип отпуска удалён
 */
router.delete('/vacation-types/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query('SELECT id FROM vacation_types WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Тип отпуска не найден')

  const requestsWithType = await query('SELECT COUNT(*) as cnt FROM vacation_requests WHERE vacation_type_id = $1', [id])
  if (parseInt(requestsWithType.rows[0].cnt) > 0) {
    throw new ConflictError('Нельзя удалить тип отпуска, который используется в заявках')
  }

  await query('DELETE FROM vacation_types WHERE id = $1', [id])
  res.json({ success: true })
}))

/**
 * @swagger
 * /dictionaries/positions:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник должностей (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список должностей
 */
router.get('/positions', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT DISTINCT position as name, COUNT(*) as employee_count
     FROM users
     WHERE position IS NOT NULL AND position != ''
     GROUP BY position
     ORDER BY position`
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /dictionaries/doc-templates:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник шаблонов документов (все роли)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список шаблонов
 */
router.get('/doc-templates', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, name, description, category, purpose, file_key, mime_type, size, created_at, download_count
     FROM document_templates
     ORDER BY name`
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /dictionaries/doc-templates:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Создать шаблон документа (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               purpose: { type: string }
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Шаблон создан
 */
router.post('/doc-templates', authenticateToken, authorizeRoles('hr', 'admin'), uploadDocTemplate.single('file'), asyncHandler(async (req, res) => {
  const { name, description, purpose } = req.body
  if (!name?.trim()) throw new ValidationError('Название шаблона обязательно')

  if (purpose?.trim()) {
    const existing = await query('SELECT id FROM document_templates WHERE purpose = $1', [purpose.trim()])
    if (existing.rows.length > 0) throw new ConflictError('Шаблон с таким назначением уже существует')
  }

  let fileKey = null
  let mimeType = null
  let fileSize = null
  if (req.file) {
    fileKey = `doc-templates/${Date.now()}-${req.file.originalname}`
    await uploadToS3(req.file, fileKey)
    mimeType = req.file.mimetype
    fileSize = req.file.size
  }

  const result = await query(
    `INSERT INTO document_templates (name, description, category, purpose, file_key, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, description, category, purpose, file_key, mime_type, size, created_at, download_count`,
    [name.trim(), description?.trim() || null, 'general', purpose?.trim() || null, fileKey, mimeType, fileSize]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/doc-templates/{id}:
 *   put:
 *     tags: [Dictionaries]
 *     summary: Обновить шаблон документа (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               purpose: { type: string }
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Шаблон обновлён
 */
router.put('/doc-templates/:id', authenticateToken, authorizeRoles('hr', 'admin'), uploadDocTemplate.single('file'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, description, purpose } = req.body
  if (!name?.trim()) throw new ValidationError('Название шаблона обязательно')

  const existing = await query('SELECT id, file_key FROM document_templates WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  if (purpose?.trim()) {
    const duplicate = await query('SELECT id FROM document_templates WHERE purpose = $1 AND id != $2', [purpose.trim(), id])
    if (duplicate.rows.length > 0) throw new ConflictError('Шаблон с таким назначением уже существует')
  }

  let fileKey = existing.rows[0].file_key
  let mimeType = null
  let fileSize = null
  if (req.file) {
    if (fileKey) await deleteFromS3(fileKey).catch(() => {})
    fileKey = `doc-templates/${Date.now()}-${req.file.originalname}`
    await uploadToS3(req.file, fileKey)
    mimeType = req.file.mimetype
    fileSize = req.file.size
  }

  const result = await query(
    `UPDATE document_templates SET name = $1, description = $2, category = $3, purpose = $4, file_key = $5, mime_type = $6, size = $7 WHERE id = $8 RETURNING id, name, description, category, purpose, file_key, mime_type, size, created_at, download_count`,
    [name.trim(), description?.trim() || null, 'general', purpose?.trim() || null, fileKey, mimeType, fileSize, id]
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/doc-templates/{id}:
 *   delete:
 *     tags: [Dictionaries]
 *     summary: Удалить шаблон документа (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Шаблон удалён
 */
router.delete('/doc-templates/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query('SELECT id, file_key FROM document_templates WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  if (existing.rows[0].file_key) {
    await deleteFromS3(existing.rows[0].file_key).catch(() => {})
  }

  await query('DELETE FROM document_templates WHERE id = $1', [id])
  res.json({ success: true })
}))

function getPublicApiUrl() {
  return process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || 'http://host.docker.internal:5000/api'
}

/**
 * @swagger
 * /dictionaries/doc-templates/{id}/preview-token:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить токен предпросмотра шаблона (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Токен и публичный URL
 */
router.get('/doc-templates/:id/preview-token', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const tmpl = await query('SELECT id FROM document_templates WHERE id = $1', [id])
  if (tmpl.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  const token = jwt.sign(
    { templateId: id, userId: String(req.user.id), type: 'template_preview', exp: Math.floor(Date.now() / 1000) + 1800 },
    process.env.JWT_SECRET
  )
  const publicUrl = `${getPublicApiUrl()}/dictionaries/doc-templates/${id}/public/${token}`
  res.json({ token, publicUrl })
}))

/**
 * @swagger
 * /dictionaries/doc-templates/{id}/public/{token}:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Публичный просмотр шаблона документа по JWT-токену
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID шаблона
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: JWT preview-токен
 *     responses:
 *       200:
 *         description: Файл шаблона (binary stream)
 *       401:
 *         description: Недействительный токен
 *       403:
 *         description: Токен не соответствует шаблону
 *       404:
 *         description: Шаблон или файл не найден
 */
router.get('/doc-templates/:id/public/:token', asyncHandler(async (req, res) => {
  const { id, token } = req.params
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' })
  }
  if (decoded.type !== 'template_preview' || String(decoded.templateId) !== String(id)) {
    return res.status(403).json({ error: 'Токен не соответствует шаблону' })
  }

  const result = await query('SELECT name, file_key, mime_type FROM document_templates WHERE id = $1', [id])
  if (result.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  const { name, file_key, mime_type } = result.rows[0]
  if (!file_key) return res.status(404).json({ error: 'Файл не прикреплён' })

  const { Body, ContentType } = await getFromS3(file_key)
  res.setHeader('Content-Type', ContentType || mime_type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`)
  res.setHeader('Cache-Control', 'public, max-age=300')
  Body.pipe(res)
}))

// POST /api/dictionaries/doc-templates/:id/save-from-url — save file from OnlyOffice downloadAs URL
/**
 * @swagger
 * /dictionaries/doc-templates/{id}/save-from-url:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Сохранить файл шаблона из URL (OnlyOffice downloadAs)
 *     description: 'Доступно для ролей: hr, admin'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, description: 'URL файла' }
 *               fileType: { type: string, description: 'Расширение файла' }
 *     responses:
 *       200:
 *         description: Файл сохранён
 *       400:
 *         description: URL не указан
 *       404:
 *         description: Шаблон не найден
 */
router.post('/doc-templates/:id/save-from-url', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { url, fileType } = req.body

  if (!url) return res.status(400).json({ error: 'URL файла обязателен' })

  const tmplResult = await query('SELECT file_key, mime_type FROM document_templates WHERE id = $1', [id])
  if (tmplResult.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  const tmpl = tmplResult.rows[0]

  const response = await fetch(url)
  if (!response.ok) return res.status(502).json({ error: 'Не удалось скачать файл из OnlyOffice' })

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const ext = fileType || tmpl.file_key?.split('.').pop() || 'docx'
  const mimeType = tmpl.mime_type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const newFileKey = `doc-templates/${id}/${Date.now()}.${ext}`

  await uploadToS3({ buffer, mimetype: mimeType }, newFileKey)

  if (tmpl.file_key && tmpl.file_key !== newFileKey) {
    await deleteFromS3(tmpl.file_key).catch(() => {})
  }

  await query('UPDATE document_templates SET file_key = $1 WHERE id = $2', [newFileKey, id])

  res.json({ ok: true })
}))

// POST /api/dictionaries/doc-templates/:id/callback — OnlyOffice save callback
/**
 * @swagger
 * /dictionaries/doc-templates/{id}/callback:
 *   post:
 *     tags: [Dictionaries]
 *     summary: OnlyOffice callback для сохранения документа
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: integer, description: 'Статус (2=ready, 6=force save)' }
 *               url: { type: string, description: 'URL для скачивания' }
 *     responses:
 *       200:
 *         description: Callback обработан
 */
router.post('/doc-templates/:id/callback', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status, url } = req.body

  // status 2 = ready for saving, status 6 = force save
  if (status !== 2 && status !== 6) {
    return res.json({ error: 0 })
  }

  const result = await query(
    'SELECT file_key, mime_type, name FROM document_templates WHERE id = $1',
    [id]
  )
  if (result.rows.length === 0) return res.status(404).json({ error: 1 })

  const tmpl = result.rows[0]

  const response = await fetch(url)
  if (!response.ok) return res.status(502).json({ error: 1 })

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const ext = tmpl.file_key?.split('.').pop() || 'docx'
  const newFileKey = `doc-templates/${id}/${Date.now()}.${ext}`

  await uploadToS3({ buffer, mimetype: tmpl.mime_type || 'application/octet-stream', originalname: tmpl.name }, newFileKey)

  if (tmpl.file_key && tmpl.file_key !== newFileKey) {
    await deleteFromS3(tmpl.file_key).catch(() => {})
  }

  await query(
    'UPDATE document_templates SET file_key = $1 WHERE id = $2',
    [newFileKey, id]
  )

  res.json({ error: 0 })
}))

/**
 * @swagger
 * /dictionaries/managers:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить список руководителей (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список руководителей
 */
router.get('/managers', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, first_name, last_name, middle_name, position
     FROM users
     WHERE role IN ('manager', 'admin')
     ORDER BY last_name, first_name`
  )
  res.json(result.rows)
}))

export default router
