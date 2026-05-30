import express from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { uploadTemplate as uploadTemplateMiddleware } from '../middleware/upload.js'
import { uploadToS3, getS3FileUrl, deleteFromS3, getPresignedUrl, getFromS3 } from '../config/s3.js'

const router = express.Router()

// ─── TEMPLATE ENDPOINTS (HR/admin) ────────────────────────────────────────────

/**
 * @swagger
 * /onboarding/templates:
 *   get:
 *     tags: [Onboarding]
 *     summary: Получить шаблоны адаптации (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: department_id
 *         schema: { type: integer }
 *       - in: query
 *         name: position
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Список шаблонов
 */
router.get('/templates', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { department_id, position } = req.query
    let sql = `
      SELECT t.*, d.name as department_name
      FROM onboarding_templates t
      LEFT JOIN departments d ON t.department_id = d.id
      WHERE 1=1
    `
    const params = []
    if (department_id) {
      sql += ` AND t.department_id = $${params.length + 1}`
      params.push(department_id)
    }
    if (position) {
      sql += ` AND t.position ILIKE $${params.length + 1}`
      params.push(`%${position}%`)
    }
    sql += ' ORDER BY t.created_at DESC'
    const result = await query(sql, params)
    res.json(result.rows)
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки шаблонов' })
  }
})

/**
 * @swagger
 * /onboarding/templates:
 *   post:
 *     tags: [Onboarding]
 *     summary: Создать шаблон адаптации (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               content_text: { type: string }
 *               department_id: { type: integer }
 *               position: { type: string }
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Шаблон создан
 */
router.post('/templates', authenticateToken, authorizeRoles('hr', 'admin'), uploadTemplateMiddleware.single('file'), async (req, res) => {
  try {
    const { title, content_text, department_id, position } = req.body
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Название обязательно' })
    }
    if (!content_text && !req.file) {
      return res.status(400).json({ error: 'Необходимо указать текст или загрузить файл' })
    }

    const insertResult = await query(
      `INSERT INTO onboarding_templates (title, content_text, department_id, position, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [title.trim(), content_text || null, department_id || null, position || null, req.user.id]
    )
    const id = insertResult.rows[0].id

    let file_key = null
    if (req.file) {
      const ext = req.file.originalname.split('.').pop()
      file_key = `onboarding-templates/${id}/${Date.now()}.${ext}`
      await uploadToS3(req.file, file_key)
      try {
        await query('UPDATE onboarding_templates SET file_key = $1 WHERE id = $2', [file_key, id])
      } catch (updateErr) {
        await deleteFromS3(file_key).catch(() => {})
        await query('DELETE FROM onboarding_templates WHERE id = $1', [id]).catch(() => {})
        throw updateErr
      }
    }

    const result = await query(
      'SELECT t.*, d.name as department_name FROM onboarding_templates t LEFT JOIN departments d ON t.department_id = d.id WHERE t.id = $1',
      [id]
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    res.status(500).json({ error: 'Ошибка создания шаблона' })
  }
})

/**
 * @swagger
 * /onboarding/templates/{id}:
 *   put:
 *     tags: [Onboarding]
 *     summary: Обновить шаблон адаптации (HR/admin)
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
 *             properties:
 *               title: { type: string }
 *               content_text: { type: string }
 *               department_id: { type: integer }
 *               position: { type: string }
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Шаблон обновлён
 */
router.put('/templates/:id', authenticateToken, authorizeRoles('hr', 'admin'), uploadTemplateMiddleware.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const { title, content_text, department_id, position } = req.body

    const existing = await query('SELECT * FROM onboarding_templates WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Шаблон не найден' })
    }
    const template = existing.rows[0]

    let file_key = template.file_key
    if (req.file) {
      const ext = req.file.originalname.split('.').pop()
      const new_file_key = `onboarding-templates/${id}/${Date.now()}.${ext}`
      await uploadToS3(req.file, new_file_key)
      if (template.file_key) {
        await deleteFromS3(template.file_key).catch(() => {})
      }
      file_key = new_file_key
    }

    await query(
      `UPDATE onboarding_templates SET title = $1, content_text = $2, department_id = $3, position = $4, file_key = $5 WHERE id = $6`,
      [
        title?.trim() || template.title,
        content_text !== undefined ? (content_text || null) : template.content_text,
        department_id !== undefined ? (department_id || null) : template.department_id,
        position !== undefined ? (position || null) : template.position,
        file_key,
        id,
      ]
    )

    const result = await query(
      'SELECT t.*, d.name as department_name FROM onboarding_templates t LEFT JOIN departments d ON t.department_id = d.id WHERE t.id = $1',
      [id]
    )
    res.json(result.rows[0])
  } catch (error) {
    res.status(500).json({ error: 'Ошибка обновления шаблона' })
  }
})

/**
 * @swagger
 * /onboarding/templates/{id}:
 *   delete:
 *     tags: [Onboarding]
 *     summary: Удалить шаблон адаптации (HR/admin)
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
router.delete('/templates/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params

    const inUse = await query(
      'SELECT 1 FROM employee_onboarding_documents WHERE template_id = $1 LIMIT 1',
      [id]
    )
    if (inUse.rows.length > 0) {
      return res.status(400).json({ error: 'Шаблон используется в онбординге' })
    }

    const existing = await query('SELECT file_key FROM onboarding_templates WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Шаблон не найден' })
    }
    if (existing.rows[0].file_key) {
      await deleteFromS3(existing.rows[0].file_key)
    }

    await query('DELETE FROM onboarding_templates WHERE id = $1', [id])
    res.json({ success: true })
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Шаблон используется в онбординге' })
    }
    res.status(500).json({ error: 'Ошибка удаления шаблона' })
  }
})

// ─── EMPLOYEE ENDPOINTS ────────────────────────────────────────────────────────

/**
 * @swagger
 * /onboarding/me:
 *   get:
 *     tags: [Onboarding]
 *     summary: Получить адаптацию текущего пользователя
 *     description: 'Доступно для роли: onboarding'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные адаптации
 */
// GET /me — MUST precede /:id
router.get('/me', authenticateToken, authorizeRoles('onboarding'), async (req, res) => {
  try {
    const onboarding = await query(
      `SELECT eo.*, u.first_name, u.last_name, u.position
       FROM employee_onboarding eo
       JOIN users u ON eo.user_id = u.id
       WHERE eo.user_id = $1 AND eo.completed_at IS NULL`,
      [req.user.id]
    )
    if (onboarding.rows.length === 0) {
      return res.status(404).json({ error: 'Онбординг не найден' })
    }
    const ob = onboarding.rows[0]

    const docs = await query(
      `SELECT eod.id, eod.template_id, eod.acknowledged_at,
              ot.title, ot.content_text, ot.file_key
       FROM employee_onboarding_documents eod
       JOIN onboarding_templates ot ON eod.template_id = ot.id
       WHERE eod.onboarding_id = $1
       ORDER BY eod.id`,
      [ob.id]
    )

    const documentsWithUrls = await Promise.all(
      docs.rows.map(async d => {
        const ext = d.file_key?.split('.').pop()?.toLowerCase() || ''
        const mimeType = {
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }[ext] || 'application/octet-stream'

        return {
          id: d.id,
          templateId: d.template_id,
          title: d.title,
          contentText: d.content_text,
          fileKey: d.file_key,
          fileUrl: d.file_key ? await getPresignedUrl(d.file_key) : null,
          mimeType,
          acknowledgedAt: d.acknowledged_at,
        }
      })
    )

    res.json({
      id: ob.id,
      userId: ob.user_id,
      startedAt: ob.started_at,
      firstName: ob.first_name,
      lastName: ob.last_name,
      position: ob.position,
      documents: documentsWithUrls,
    })
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки онбординга' })
  }
})

/**
 * @swagger
 * /onboarding/documents/{id}/access-token:
 *   post:
 *     tags: [Onboarding]
 *     summary: Получить токен доступа к документу
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Токен доступа
 */
router.post('/documents/:id/access-token', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id


    const docResult = await query(
      `SELECT eod.*, eo.user_id
       FROM employee_onboarding_documents eod
       JOIN employee_onboarding eo ON eod.onboarding_id = eo.id
       WHERE eod.id = $1`,
      [id]
    )

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' })
    }

    const doc = docResult.rows[0]

    const isHRorAdmin = ['hr', 'admin'].includes(req.user.role)
    const isOwner = doc.user_id === userId

    if (!isHRorAdmin && !isOwner) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const accessToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 3600000)

    await query(
      `INSERT INTO document_access_tokens (token, document_id, user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [accessToken, id, userId, expiresAt]
    )

    res.json({ accessToken, expiresAt })
  } catch (error) {
    res.status(500).json({ error: 'Ошибка создания токена' })
  }
})

router.options('/documents/:id/file', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  res.status(200).end()
})

/**
 * @swagger
 * /onboarding/documents/{id}/file:
 *   get:
 *     tags: [Onboarding]
 *     summary: Скачать файл документа онбординга по access-токену
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID документа
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: Access token (JWT)
 *     responses:
 *       200:
 *         description: Файл документа (binary stream)
 *       401:
 *         description: Токен отсутствует или недействителен
 *       404:
 *         description: Документ или файл не найден
 */
router.get('/documents/:id/file', async (req, res) => {
  try {
    const { id } = req.params
    const token = req.query.token


    if (!token) {
      return res.status(401).json({ error: 'Token required' })
    }

    const tokenResult = await query(
      `SELECT * FROM document_access_tokens WHERE token = $1 AND document_id = $2 AND expires_at > NOW()`,
      [token, id]
    )

    if (tokenResult.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired token' })
    }

    await query('DELETE FROM document_access_tokens WHERE token = $1', [token])

    const docResult = await query(
      `SELECT eod.*, eo.user_id, ot.file_key, ot.title
       FROM employee_onboarding_documents eod
       JOIN employee_onboarding eo ON eod.onboarding_id = eo.id
       JOIN onboarding_templates ot ON eod.template_id = ot.id
       WHERE eod.id = $1`,
      [id]
    )

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' })
    }

    const doc = docResult.rows[0]

    if (!doc.file_key) {
      return res.status(404).json({ error: 'Файл не найден' })
    }

    const s3Response = await getFromS3(doc.file_key)
    const stream = s3Response.Body

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.title)}.pdf`)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    
    stream.transformToByteArray().then(bytes => {
      res.send(Buffer.from(bytes))
    })
  } catch (error) {
    res.status(500).json({ error: 'Ошибка скачивания файла' })
  }
})

/**
 * @swagger
 * /onboarding/me/documents/{id}/acknowledge:
 *   post:
 *     tags: [Onboarding]
 *     summary: Подтвердить ознакомление с документом
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Документ подтверждён
 */
router.post('/me/documents/:id/acknowledge', authenticateToken, authorizeRoles('onboarding'), async (req, res) => {
  try {
    const { id } = req.params

    const client = await getClient()
    try {
      await client.query('BEGIN')

      const docResult = await client.query(
        `SELECT eod.*, eo.user_id, eo.id as onboarding_id
         FROM employee_onboarding_documents eod
         JOIN employee_onboarding eo ON eod.onboarding_id = eo.id
         WHERE eod.id = $1
         FOR UPDATE`,
        [id]
      )
      if (docResult.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Документ не найден' })
      }
      const doc = docResult.rows[0]

      if (doc.user_id !== req.user.id) {
        await client.query('ROLLBACK')
        return res.status(403).json({ error: 'Forbidden' })
      }
      if (doc.acknowledged_at) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Уже подтверждено' })
      }

      await client.query(
        'UPDATE employee_onboarding_documents SET acknowledged_at = NOW() WHERE id = $1',
        [id]
      )

      const allDocs = await client.query(
        'SELECT acknowledged_at FROM employee_onboarding_documents WHERE onboarding_id = $1',
        [doc.onboarding_id]
      )
      const allAcknowledged = allDocs.rows.every(d => d.acknowledged_at !== null)

      if (allAcknowledged) {
        await client.query(`UPDATE users SET role = 'employee' WHERE id = $1`, [doc.user_id])
        await client.query(
          'UPDATE employee_onboarding SET completed_at = NOW() WHERE id = $1',
          [doc.onboarding_id]
        )

      }

      await client.query('COMMIT')
      res.json({ acknowledged: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка подтверждения документа' })
  }
})

// ─── HR ENDPOINTS ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /onboarding:
 *   get:
 *     tags: [Onboarding]
 *     summary: Получить список адаптаций (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список адаптаций
 */
router.get('/', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT
        eo.id,
        eo.user_id,
        eo.started_at,
        eo.completed_at,
        u.first_name,
        u.last_name,
        u.position,
        d.name as department,
        (SELECT COUNT(*) FROM employee_onboarding_documents WHERE onboarding_id = eo.id) as total_docs,
        (SELECT COUNT(*) FROM employee_onboarding_documents WHERE onboarding_id = eo.id AND acknowledged_at IS NOT NULL) as acknowledged_docs
       FROM employee_onboarding eo
       JOIN users u ON eo.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY eo.started_at DESC`
    )
    res.json(result.rows)
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки онбордингов' })
  }
})

/**
 * @swagger
 * /onboarding:
 *   post:
 *     tags: [Onboarding]
 *     summary: Создать адаптацию для сотрудника (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [first_name, last_name, email, password, position, template_ids]
 *             properties:
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *               position: { type: string }
 *               department_id: { type: integer }
 *               template_ids: { type: array, items: { type: integer }, description: 'Минимум 1 шаблон' }
 *     responses:
 *       201:
 *         description: Адаптация создана
 */
router.post('/', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { first_name, last_name, email, password, department_id, position, template_ids } = req.body

    if (!first_name || !last_name || !email || !password || !position) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' })
    }
    if (!template_ids || template_ids.length === 0) {
      return res.status(400).json({ error: 'Выберите хотя бы один документ' })
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email уже зарегистрирован' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const client = await getClient()
    try {
      await client.query('BEGIN')

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, position, department_id, hire_date, role)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'onboarding')
         RETURNING id`,
        [email, passwordHash, first_name, last_name, position, department_id || null]
      )
      const userId = userResult.rows[0].id

      await client.query(
        'INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)',
        [userId]
      )

      const onboardingResult = await client.query(
        `INSERT INTO employee_onboarding (user_id, started_by) VALUES ($1, $2) RETURNING id`,
        [userId, req.user.id]
      )
      const onboardingId = onboardingResult.rows[0].id

      for (const templateId of template_ids) {
        await client.query(
          `INSERT INTO employee_onboarding_documents (onboarding_id, template_id) VALUES ($1, $2)`,
          [onboardingId, templateId]
        )
      }

      await client.query('COMMIT')
      res.status(201).json({ id: onboardingId, userId })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    if (error.message?.includes('Email уже зарегистрирован') || error.code === '23505') {
      return res.status(400).json({ error: 'Email уже зарегистрирован' })
    }
    res.status(500).json({ error: 'Ошибка создания онбординга' })
  }
})

/**
 * @swagger
 * /onboarding/{id}:
 *   get:
 *     tags: [Onboarding]
 *     summary: Получить адаптацию по ID (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Данные адаптации
 */
router.get('/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT
        eo.id, eo.user_id, eo.started_at, eo.completed_at,
        u.first_name, u.last_name, u.email, u.position,
        d.name as department
       FROM employee_onboarding eo
       JOIN users u ON eo.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE eo.id = $1`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Онбординг не найден' })
    }

    const docs = await query(
      `SELECT eod.id, eod.template_id, eod.acknowledged_at,
              ot.title, ot.content_text, ot.file_key
       FROM employee_onboarding_documents eod
       JOIN onboarding_templates ot ON eod.template_id = ot.id
       WHERE eod.onboarding_id = $1
       ORDER BY eod.id`,
      [id]
    )

    const documentsWithUrls = await Promise.all(
      docs.rows.map(async d => {
        const ext = d.file_key?.split('.').pop()?.toLowerCase() || ''
        const mimeType = {
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }[ext] || 'application/octet-stream'

        return {
          id: d.id,
          templateId: d.template_id,
          title: d.title,
          contentText: d.content_text,
          fileKey: d.file_key,
          fileUrl: d.file_key ? await getPresignedUrl(d.file_key) : null,
          mimeType,
          acknowledgedAt: d.acknowledged_at,
        }
      })
    )

    const ob = result.rows[0]
    res.json({
      id: ob.id,
      userId: ob.user_id,
      startedAt: ob.started_at,
      completedAt: ob.completed_at,
      firstName: ob.first_name,
      lastName: ob.last_name,
      email: ob.email,
      position: ob.position,
      department: ob.department,
      documents: documentsWithUrls,
    })
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки онбординга' })
  }
})

/**
 * @swagger
 * /onboarding/{id}:
 *   delete:
 *     tags: [Onboarding]
 *     summary: Удалить адаптацию (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Адаптация удалена, роль сброшена на employee
 */
router.delete('/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      'SELECT user_id FROM employee_onboarding WHERE id = $1',
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Онбординг не найден' })
    }
    const userId = result.rows[0].user_id

    const client = await getClient()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE users SET role = 'employee' WHERE id = $1`, [userId])
      await client.query('DELETE FROM employee_onboarding WHERE id = $1', [id])
      await client.query('COMMIT')
      res.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка отмены онбординга' })
  }
})

export default router