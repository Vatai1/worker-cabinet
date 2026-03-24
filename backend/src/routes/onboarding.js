import express from 'express'
import bcrypt from 'bcryptjs'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { uploadTemplate as uploadTemplateMiddleware } from '../middleware/upload.js'
import { uploadToS3, getS3FileUrl, deleteFromS3 } from '../config/s3.js'

const router = express.Router()

// ─── TEMPLATE ENDPOINTS (HR/admin) ────────────────────────────────────────────

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
    console.error('GET /onboarding/templates error:', error)
    res.status(500).json({ error: 'Ошибка загрузки шаблонов' })
  }
})

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
      await query('UPDATE onboarding_templates SET file_key = $1 WHERE id = $2', [file_key, id])
    }

    const result = await query(
      'SELECT t.*, d.name as department_name FROM onboarding_templates t LEFT JOIN departments d ON t.department_id = d.id WHERE t.id = $1',
      [id]
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('POST /onboarding/templates error:', error)
    res.status(500).json({ error: 'Ошибка создания шаблона' })
  }
})

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
      if (template.file_key) {
        await deleteFromS3(template.file_key)
      }
      const ext = req.file.originalname.split('.').pop()
      file_key = `onboarding-templates/${id}/${Date.now()}.${ext}`
      await uploadToS3(req.file, file_key)
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
    console.error('PUT /onboarding/templates/:id error:', error)
    res.status(500).json({ error: 'Ошибка обновления шаблона' })
  }
})

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
    console.error('DELETE /onboarding/templates/:id error:', error)
    res.status(500).json({ error: 'Ошибка удаления шаблона' })
  }
})

// ─── EMPLOYEE ENDPOINTS ────────────────────────────────────────────────────────

// GET /me — MUST precede /:id
router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'onboarding') {
      return res.status(403).json({ error: 'Forbidden' })
    }

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

    res.json({
      id: ob.id,
      userId: ob.user_id,
      startedAt: ob.started_at,
      firstName: ob.first_name,
      lastName: ob.last_name,
      position: ob.position,
      documents: docs.rows.map(d => ({
        id: d.id,
        templateId: d.template_id,
        title: d.title,
        contentText: d.content_text,
        fileKey: d.file_key,
        fileUrl: d.file_key ? getS3FileUrl(d.file_key) : null,
        acknowledgedAt: d.acknowledged_at,
      })),
    })
  } catch (error) {
    console.error('GET /onboarding/me error:', error)
    res.status(500).json({ error: 'Ошибка загрузки онбординга' })
  }
})

router.post('/me/documents/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'onboarding') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { id } = req.params

    const docResult = await query(
      `SELECT eod.*, eo.user_id, eo.id as onboarding_id
       FROM employee_onboarding_documents eod
       JOIN employee_onboarding eo ON eod.onboarding_id = eo.id
       WHERE eod.id = $1`,
      [id]
    )
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' })
    }
    const doc = docResult.rows[0]

    if (doc.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (doc.acknowledged_at) {
      return res.status(400).json({ error: 'Уже подтверждено' })
    }

    const client = await getClient()
    try {
      await client.query('BEGIN')

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

        const userResult = await client.query(
          'SELECT first_name, last_name FROM users WHERE id = $1',
          [doc.user_id]
        )
        const { first_name, last_name } = userResult.rows[0]

        const hrUsers = await client.query(
          "SELECT id FROM users WHERE role IN ('hr', 'admin')"
        )
        for (const hrUser of hrUsers.rows) {
          await client.query(
            `INSERT INTO notifications (user_id, title, message, type, link)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              hrUser.id,
              'Онбординг завершён',
              `Сотрудник ${first_name} ${last_name} завершил онбординг`,
              'success',
              `/hr/onboarding/${doc.onboarding_id}`,
            ]
          )
        }
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
    console.error('POST /onboarding/me/documents/:id/acknowledge error:', error)
    res.status(500).json({ error: 'Ошибка подтверждения документа' })
  }
})

// ─── HR ENDPOINTS ──────────────────────────────────────────────────────────────

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
    console.error('GET /onboarding error:', error)
    res.status(500).json({ error: 'Ошибка загрузки онбордингов' })
  }
})

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
    console.error('POST /onboarding error:', error)
    if (error.message?.includes('Email уже зарегистрирован')) {
      return res.status(400).json({ error: error.message })
    }
    res.status(500).json({ error: 'Ошибка создания онбординга' })
  }
})

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

    const ob = result.rows[0]
    res.json({
      ...ob,
      documents: docs.rows.map(d => ({
        id: d.id,
        templateId: d.template_id,
        title: d.title,
        contentText: d.content_text,
        fileKey: d.file_key,
        fileUrl: d.file_key ? getS3FileUrl(d.file_key) : null,
        acknowledgedAt: d.acknowledged_at,
      })),
    })
  } catch (error) {
    console.error('GET /onboarding/:id error:', error)
    res.status(500).json({ error: 'Ошибка загрузки онбординга' })
  }
})

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
    console.error('DELETE /onboarding/:id error:', error)
    res.status(500).json({ error: 'Ошибка отмены онбординга' })
  }
})

export default router
