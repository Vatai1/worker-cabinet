import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { TelegramService } from '../services/telegramService.js'
import { getFromS3 } from '../config/s3.js'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

const router = express.Router()

const VALID_VACATION_TYPES = ['annual_paid', 'unpaid', 'educational', 'maternity', 'child_care', 'additional', 'veteran']

async function vacationDatesByMonth(startDate, endDate) {
  const byMonth = {}
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const endMs = new Date(ey, em - 1, ed).getTime()
  for (let d = new Date(sy, sm - 1, sd); d.getTime() <= endMs; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const key = ds.slice(0, 7)
    if (!byMonth[key]) byMonth[key] = { year: Number(ds.slice(0, 4)), month: Number(ds.slice(5, 7)), dates: [] }
    byMonth[key].dates.push(ds)
  }
  return byMonth
}

async function fillVacationTimesheetEntries(client, userId, startDate, endDate) {
  const deptResult = await client.query(`SELECT department_id FROM users WHERE id = $1`, [userId])
  const deptId = deptResult.rows[0]?.department_id
  if (!deptId) return
  const byMonth = await vacationDatesByMonth(startDate, endDate)
  for (const { year, month, dates } of Object.values(byMonth)) {
    const tsResult = await client.query(
      `SELECT id FROM timesheets WHERE department_id = $1 AND year = $2 AND month = $3 AND status != 'approved'`,
      [deptId, year, month]
    )
    if (tsResult.rows.length === 0) continue
    const tsId = tsResult.rows[0].id
    const placeholders = dates.map((_, i) => `($1, $2, $${i + 3}, 'ОТ')`).join(', ')
    await client.query(
      `INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code)
       VALUES ${placeholders}
       ON CONFLICT (timesheet_id, employee_id, date) DO UPDATE SET code = 'ОТ'`,
      [tsId, userId, ...dates]
    )
  }
}

async function clearVacationTimesheetEntries(client, userId, startDate, endDate) {
  const deptResult = await client.query(`SELECT department_id FROM users WHERE id = $1`, [userId])
  const deptId = deptResult.rows[0]?.department_id
  if (!deptId) return
  const byMonth = await vacationDatesByMonth(startDate, endDate)
  for (const { year, month, dates } of Object.values(byMonth)) {
    const tsResult = await client.query(
      `SELECT id FROM timesheets WHERE department_id = $1 AND year = $2 AND month = $3 AND status != 'approved'`,
      [deptId, year, month]
    )
    if (tsResult.rows.length === 0) continue
    const tsId = tsResult.rows[0].id
    await client.query(
      `DELETE FROM timesheet_entries
       WHERE timesheet_id = $1 AND employee_id = $2 AND date = ANY($3) AND code = 'ОТ'`,
      [tsId, userId, dates]
    )
  }
}

function extractYear(date) {
  if (!date) return new Date().getFullYear()
  if (typeof date === 'string') return parseInt(date.substring(0, 4))
  if (date instanceof Date) return date.getFullYear()
  return new Date(date).getFullYear()
}

/**
 * @swagger
 * /vacation/requests:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить список заявок на отпуск
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, cancelled] }
 *       - in: query
 *         name: departmentId
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Список заявок
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/VacationRequest' }
 */
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const { userId, status, departmentId, year } = req.query
    const user = req.user

    let whereClause = 'WHERE 1=1'
    const params = []

    if (userId) {
      if (parseInt(userId) !== user.id) {
        if (user.role === 'employee') {
          return res.status(403).json({ error: 'Forbidden' })
        }
        const hasAccess = await query(
          'SELECT 1 FROM users WHERE id = $1 AND manager_id = $2',
          [userId, user.id]
        )
        if (hasAccess.rows.length === 0) {
          return res.status(403).json({ error: 'Forbidden' })
        }
      }
      whereClause += ' AND vr.user_id = $' + (params.length + 1)
      params.push(userId)
    } else if (departmentId) {
      if (user.role === 'employee') {
        whereClause += ' AND u.department_id = $' + (params.length + 1) + ' AND rs.code = $' + (params.length + 2)
        params.push(departmentId, 'approved')
      } else {
        whereClause += ' AND u.department_id = $' + (params.length + 1)
        params.push(departmentId)
      }
    } else {
      if (user.role === 'employee') {
        whereClause += ' AND vr.user_id = $' + (params.length + 1)
        params.push(user.id)
      } else if (user.role === 'manager') {
        whereClause += ` AND (vr.user_id = $${params.length + 1} OR u.manager_id = $${params.length + 1} OR u.department_id IN (SELECT id FROM departments WHERE manager_id = $${params.length + 1}))`
        params.push(user.id)
      }
    }

    if (status) {
      whereClause += ' AND rs.code = $' + (params.length + 1)
      params.push(status)
    }

    if (year) {
      whereClause += ' AND EXTRACT(YEAR FROM vr.start_date) = $' + (params.length + 1)
      params.push(year)
    }

    const sql = `
      SELECT
        vr.*,
        rs.code as status,
        rs.name as status_name,
        vt.code as vacation_type,
        vt.name as vacation_type_name,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.department_id,
        d.name as department_name,
        d.manager_id as department_manager_id,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vrsh.id,
              'status', vrsh_rs.code,
              'statusName', vrsh_rs.name,
              'changedAt', vrsh.changed_at,
              'changedBy', vrsh.changed_by,
              'changedByName', hu.last_name || ' ' || hu.first_name,
              'comment', vrsh.comment
            ) ORDER BY vrsh.changed_at
          ) FILTER (WHERE vrsh.id IS NOT NULL),
          '[]'
        ) as status_history
      FROM vacation_requests vr
      JOIN users u ON vr.user_id = u.id
      JOIN request_statuses rs ON vr.status_id = rs.id
      JOIN vacation_types vt ON vr.vacation_type_id = vt.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN vacation_request_status_history vrsh ON vr.id = vrsh.request_id
      LEFT JOIN request_statuses vrsh_rs ON vrsh.status_id = vrsh_rs.id
      LEFT JOIN users hu ON vrsh.changed_by = hu.id
      ${whereClause}
      GROUP BY vr.id, u.id, d.id, rs.id, vt.id
      ORDER BY vr.created_at DESC
    `

    const result = await query(sql, params)

    const requests = result.rows.map((request) => ({
      ...request,
      status_code: request.status,
      vacation_type_code: request.vacation_type,
      statusHistory: request.status_history,
      departmentManagerId: request.department_manager_id,
    }))

    res.json(requests)
  } catch (error) {
    console.error('Error fetching vacation requests:', error)
    res.status(500).json({ error: 'Failed to fetch vacation requests' })
  }
})

/**
 * @swagger
 * /vacation/balance/{userId}:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить баланс отпусков
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Баланс отпусков
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationBalance' }
 */
router.get('/balance/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const { year } = req.query
    const currentUser = req.user
    const targetYear = year ? parseInt(year) : new Date().getFullYear()

    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const result = await query(
      'SELECT * FROM vacation_balances WHERE user_id = $1 AND year = $2',
      [userId, targetYear]
    )

    if (result.rows.length === 0) {
      const newBalance = await query(
        `INSERT INTO vacation_balances (user_id, total_days, used_days, reserved_days, year)
         VALUES ($1, 47, 0, 0, $2)
         RETURNING *`,
        [userId, targetYear]
      )
      return res.json(newBalance.rows[0])
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching vacation balance:', error)
    res.status(500).json({ error: 'Failed to fetch vacation balance' })
  }
})

/**
 * @swagger
 * /vacation/requests:
 *   post:
 *     tags: [Vacation]
 *     summary: Создать заявку на отпуск
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startDate, endDate, vacationType]
 *             properties:
 *               startDate: { type: string, format: date, example: '2026-06-01' }
 *               endDate: { type: string, format: date, example: '2026-06-14' }
 *               vacationType: { $ref: '#/components/schemas/VacationType' }
 *               comment: { type: string }
 *               hasTravel: { type: boolean, default: false }
 *               travelDestination: { type: string }
 *               referenceDocument: { type: string }
 *     responses:
 *       201:
 *         description: Заявка создана
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationRequest' }
 *       400:
 *         description: Ошибка валидации
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/requests', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { startDate, endDate, vacationType, comment, hasTravel, travelDestination, referenceDocument } = req.body
    const userId = req.user.id

    const blockCheck = await query(
      `SELECT d.vacation_requests_blocked FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = $1`,
      [userId]
    )
    if (blockCheck.rows.length > 0 && blockCheck.rows[0].vacation_requests_blocked) {
      return res.status(403).json({ error: 'Подача заявок на отпуск для вашего отдела временно заблокирована HR' })
    }

    await client.query('BEGIN')

    const parseLocalDate = (dateStr) => {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    }

    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)

    const formatDate = (date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (start < today) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Нельзя создавать заявку на прошедшую дату' })
    }

    if (end < start) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' })
    }

    if (!VALID_VACATION_TYPES.includes(vacationType)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Неверный тип отпуска' })
    }

    if (vacationType === 'educational' && !referenceDocument) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Для учебного отпуска необходимо приложить справку' })
    }

    const duration = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1
    const finalDuration = hasTravel ? duration + 2 : duration
    const requestYear = start.getFullYear()

    const balanceResult = await client.query(
      'SELECT * FROM vacation_balances WHERE user_id = $1 AND year = $2',
      [userId, requestYear]
    )

    const balance = balanceResult.rows[0]
    if (!balance || balance.available_days < finalDuration) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: 'Недостаточно дней на балансе',
        available: balance?.available_days || 0,
        required: finalDuration
      })
    }

    const overlapResult = await client.query(
      `SELECT vr.id FROM vacation_requests vr
        JOIN request_statuses rs ON vr.status_id = rs.id
        WHERE vr.user_id = $1
        AND rs.code IN ('on_approval', 'approved')
        AND (
          (vr.start_date <= $2 AND vr.end_date >= $2)
          OR (vr.start_date <= $3 AND vr.end_date >= $3)
          OR (vr.start_date >= $2 AND vr.end_date <= $3)
        )`,
      [userId, formatDate(start), formatDate(end)]
    )

    if (overlapResult.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Пересечение с существующей заявкой' })
    }

    const result = await client.query(
      `INSERT INTO vacation_requests 
        (user_id, start_date, end_date, duration, vacation_type_id, comment, has_travel, travel_destination, reference_document, status_id)
        VALUES ($1, $2, $3, $4, (SELECT id FROM vacation_types WHERE code = $5), $6, $7, $8, $9, (SELECT id FROM request_statuses WHERE code = 'on_approval'))
        RETURNING *`,
      [
        userId,
        formatDate(start),
        formatDate(end),
        finalDuration,
        vacationType,
        comment,
        hasTravel || false,
        travelDestination || null,
        referenceDocument || null
      ]
    )

    const request = result.rows[0]

    await client.query(
      `UPDATE vacation_balances 
       SET reserved_days = reserved_days + $1
       WHERE user_id = $2 AND year = $3`,
      [finalDuration, userId, requestYear]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'on_approval'), $2)`,
      [request.id, userId]
    )

    await fillVacationTimesheetEntries(client, userId, request.start_date, request.end_date)

    await client.query('COMMIT')

    const managerResult = await client.query(
      `SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id =
       (SELECT manager_id FROM users WHERE id = $1)`,
      [userId]
    )
    const manager = managerResult.rows[0]
    const employee = await client.query(
      'SELECT id, first_name, last_name, position FROM users WHERE id = $1',
      [userId]
    )

    if (manager) {
      TelegramService.sendNewRequestNotification(
        {
          firstName: manager.first_name,
          lastName: manager.last_name,
          telegram_chat_id: manager.telegram_chat_id,
          telegram_notifications_enabled: manager.telegram_notifications_enabled
        },
        {
          start_date: request.start_date,
          end_date: request.end_date,
          duration: request.duration,
          vacation_type: request.vacation_type,
          has_travel: request.has_travel,
          comment: request.comment
        },
        {
          firstName: employee.rows[0].first_name,
          lastName: employee.rows[0].last_name,
          position: employee.rows[0].position
        }
      ).catch(console.error)
    }

    res.status(201).json(request)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error creating vacation request:', error)
    res.status(500).json({ error: 'Failed to create vacation request' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}:
 *   put:
 *     tags: [Vacation]
 *     summary: Редактировать заявку на отпуск
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
 *             properties:
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               vacationType: { $ref: '#/components/schemas/VacationType' }
 *               comment: { type: string }
 *               hasTravel: { type: boolean }
 *               referenceDocument: { type: string }
 *     responses:
 *       200:
 *         description: Заявка обновлена
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationRequest' }
 */
router.put('/requests/:id', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { id } = req.params
    const { startDate, endDate, vacationType, comment, hasTravel, referenceDocument } = req.body
    const userId = req.user.id

    if (!VALID_VACATION_TYPES.includes(vacationType)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Неверный тип отпуска' })
    }

    await client.query('BEGIN')

    const requestResult = await client.query(
      `SELECT vr.*, rs.code as status
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.id = $1`,
      [id]
    )

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found' })
    }

    const request = requestResult.rows[0]

    if (request.user_id !== userId && req.user.role === 'employee') {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (request.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно редактировать только заявки на согласовании' })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    const newDuration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

    if (request.status === 'on_approval') {
      const origYear = extractYear(request.start_date)
      await client.query(
        `UPDATE vacation_balances
         SET reserved_days = reserved_days - $1 + $2
         WHERE user_id = $3 AND year = $4`,
        [request.duration, newDuration, request.user_id, origYear]
      )
    } else if (request.status === 'approved') {
      const origYear = extractYear(request.start_date)
      await client.query(
        `UPDATE vacation_balances
         SET used_days = used_days - $1 + $2
         WHERE user_id = $3 AND year = $4`,
        [request.duration, newDuration, request.user_id, origYear]
      )
    }

    const result = await client.query(
      `UPDATE vacation_requests
       SET start_date = $1, end_date = $2, duration = $3, vacation_type_id = (SELECT id FROM vacation_types WHERE code = $4), comment = $5, has_travel = $6, reference_document = $7
       WHERE id = $8
       RETURNING *`,
      [startDate, endDate, newDuration, vacationType, comment, hasTravel || false, referenceDocument || null, id]
    )

    await client.query('COMMIT')

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    res.json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error updating vacation request:', error)
    res.status(500).json({ error: 'Failed to update vacation request' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/approve:
 *   post:
 *     tags: [Vacation]
 *     summary: Одобрить заявку на отпуск
 *     description: 'Доступно для ролей: manager, hr, admin'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Заявка одобрена
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationRequest' }
 *       403:
 *         description: Доступ запрещён
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/requests/:id/approve', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const managerId = req.user.id

    await client.query('BEGIN')

    const deptCheck = await client.query(
      `SELECT d.manager_id 
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    if (deptCheck.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found' })
    }

    const deptManagerId = deptCheck.rows[0].manager_id
    if (deptManagerId !== managerId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Только руководитель отдела может согласовывать заявки' })
    }

    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'approved'), reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
       FROM vacation_balances vb
       WHERE vr.id = $2 AND vr.status_id = (SELECT id FROM request_statuses WHERE code = 'on_approval') AND vb.user_id = vr.user_id AND vb.year = EXTRACT(YEAR FROM vr.start_date)
       RETURNING
         vr.*,
         vb.user_id as balance_user_id,
         vb.year as balance_year,
         vr.duration
       `,
      [managerId, id]
    )

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found or not pending approval' })
    }

    const request = result.rows[0]

    await client.query(
      `UPDATE vacation_balances
       SET reserved_days = reserved_days - $1,
           used_days = used_days + $1
       WHERE user_id = $2 AND year = $3`,
      [request.duration, request.balance_user_id, request.balance_year]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'approved'), $2, 'Согласовано')`,
      [id, managerId]
    )

    await fillVacationTimesheetEntries(client, request.user_id, request.start_date, request.end_date)

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [request.user_id]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationApprovedNotification(
      {
        firstName: user.first_name,
        lastName: user.last_name,
        telegram_chat_id: user.telegram_chat_id,
        telegram_notifications_enabled: user.telegram_notifications_enabled
      },
      {
        start_date: request.start_date,
        end_date: request.end_date,
        duration: request.duration,
        vacation_type: request.vacation_type,
        has_travel: request.has_travel
      }
    ).catch(console.error)

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    res.json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error approving vacation request:', error)
    res.status(500).json({ error: 'Failed to approve vacation request' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/reject:
 *   post:
 *     tags: [Vacation]
 *     summary: Отклонить заявку на отпуск
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Заявка отклонена
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationRequest' }
 */
router.post('/requests/:id/reject', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const { reason } = req.body
    const managerId = req.user.id

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason is required' })
    }

    await client.query('BEGIN')

    const deptCheck = await client.query(
      `SELECT d.manager_id 
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    if (deptCheck.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found' })
    }

    const deptManagerId = deptCheck.rows[0].manager_id
    if (deptManagerId !== managerId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Только руководитель отдела может отклонять заявки' })
    }

    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'rejected'), rejection_reason = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
       WHERE vr.id = $3 AND vr.status_id = (SELECT id FROM request_statuses WHERE code = 'on_approval')
       RETURNING vr.*`,
      [reason, managerId, id]
    )

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found or not pending approval' })
    }

    const request = result.rows[0]
    const requestYear = extractYear(request.start_date)

    await client.query(
      `UPDATE vacation_balances
        SET reserved_days = reserved_days - $1
        WHERE user_id = $2 AND year = $3`,
       [request.duration, request.user_id, requestYear]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'rejected'), $2, $3)`,
      [id, managerId, reason]
    )

    await clearVacationTimesheetEntries(client, request.user_id, request.start_date, request.end_date)

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [request.user_id]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationRejectedNotification(
      {
        firstName: user.first_name,
        lastName: user.last_name,
        telegram_chat_id: user.telegram_chat_id,
        telegram_notifications_enabled: user.telegram_notifications_enabled
      },
      {
        start_date: request.start_date,
        end_date: request.end_date,
        duration: request.duration,
        rejection_reason: request.rejection_reason
      }
    ).catch(console.error)

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    res.json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error rejecting vacation request:', error)
    res.status(500).json({ error: 'Failed to reject vacation request' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/cancel:
 *   post:
 *     tags: [Vacation]
 *     summary: Отменить заявку (сотрудник)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Заявка отменена
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationRequest' }
 */
router.post('/requests/:id/cancel', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { id } = req.params
    const userId = req.user.id

    await client.query('BEGIN')

    const requestResult = await client.query(
      `SELECT vr.*, rs.code as status
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.id = $1`,
      [id]
    )

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found' })
    }

    const request = requestResult.rows[0]
    const requestYear = extractYear(request.start_date)

    if (request.user_id !== userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (request.status !== 'on_approval' && request.status !== 'approved') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно отменять только заявки на согласовании или согласованные заявки' })
    }

    if (request.status === 'on_approval') {
      await client.query(
        `UPDATE vacation_balances
         SET reserved_days = reserved_days - $1
         WHERE user_id = $2 AND year = $3`,
        [request.duration, userId, requestYear]
      )
    } else {
      await client.query(
        `UPDATE vacation_balances
         SET used_days = used_days - $1
         WHERE user_id = $2 AND year = $3`,
        [request.duration, userId, requestYear]
      )
    }

    const result = await client.query(
      `UPDATE vacation_requests
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee')
       WHERE id = $1
       RETURNING *`,
      [id]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee'), $2)`,
      [id, userId]
    )

    if (request.status === 'approved') {
      await clearVacationTimesheetEntries(client, userId, request.start_date, request.end_date)
    }

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationCancelledNotification(
      {
        firstName: user.first_name,
        lastName: user.last_name,
        telegram_chat_id: user.telegram_chat_id,
        telegram_notifications_enabled: user.telegram_notifications_enabled
      },
      {
        start_date: request.start_date,
        end_date: request.end_date,
        duration: request.duration,
        status: 'cancelled_by_employee'
      }
    ).catch(console.error)

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    res.json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error cancelling vacation request:', error)
    res.status(500).json({ error: 'Failed to cancel vacation request' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/cancel-by-manager:
 *   post:
 *     tags: [Vacation]
 *     summary: Отменить заявку (руководитель)
 *     description: 'Доступно для ролей: manager, hr, admin'
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Заявка отменена руководителем
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationRequest' }
 */
router.post('/requests/:id/cancel-by-manager', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const { reason } = req.body
    const managerId = req.user.id

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason is required' })
    }

    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'cancelled_by_manager'), cancellation_reason = $1
       WHERE vr.id = $2 AND vr.status_id = (SELECT id FROM request_statuses WHERE code = 'approved')
       RETURNING vr.*`,
      [reason, id]
    )

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found or not approved' })
    }

    const request = result.rows[0]
    const requestYear = extractYear(request.start_date)

    await client.query(
      `UPDATE vacation_balances
       SET used_days = used_days - $1
       WHERE user_id = $2 AND year = $3`,
      [request.duration, request.user_id, requestYear]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'cancelled_by_manager'), $2, $3)`,
      [id, managerId, reason]
    )

    await clearVacationTimesheetEntries(client, request.user_id, request.start_date, request.end_date)

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [request.user_id]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationCancelledNotification(
      {
        firstName: user.first_name,
        lastName: user.last_name,
        telegram_chat_id: user.telegram_chat_id,
        telegram_notifications_enabled: user.telegram_notifications_enabled
      },
      {
        start_date: request.start_date,
        end_date: request.end_date,
        duration: request.duration,
        status: 'cancelled_by_manager'
      }
    ).catch(console.error)

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    res.json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error cancelling vacation request by manager:', error)
    res.status(500).json({ error: 'Failed to cancel vacation request' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/calendar:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить производственный календарь отпусков
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Календарь отпусков
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   request_id: { type: integer }
 *                   user_id: { type: integer }
 *                   first_name: { type: string }
 *                   last_name: { type: string }
 *                   position: { type: string }
 *                   start_date: { type: string, format: date }
 *                   end_date: { type: string, format: date }
 *                   vacation_type: { type: string }
 *                   status: { type: string }
 */
router.get('/calendar', authenticateToken, async (req, res) => {
  try {
    const { departmentId, year } = req.query

    if (!year) {
      return res.status(400).json({ error: 'Year parameter is required' })
    }

    let sql = `
      SELECT
        vr.id as request_id,
        vr.user_id,
        u.first_name,
        u.last_name,
        u.position,
        vr.start_date,
        vr.end_date,
        vt.code as vacation_type,
        rs.code as status
      FROM vacation_requests vr
      JOIN users u ON vr.user_id = u.id
      JOIN vacation_types vt ON vr.vacation_type_id = vt.id
      JOIN request_statuses rs ON vr.status_id = rs.id
      WHERE rs.code = 'approved'
      AND EXTRACT(YEAR FROM vr.start_date) = $1
    `

    const params = [year]

    if (departmentId) {
      sql += ' AND u.department_id = $2'
      params.push(departmentId)
    }

    sql += ' ORDER BY vr.start_date'

    const result = await query(sql, params)
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching vacation calendar:', error)
    res.status(500).json({ error: 'Failed to fetch vacation calendar' })
  }
})

/**
 * @swagger
 * /vacation/restrictions:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить ограничения на отпуска
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Список ограничений
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   departmentId: { type: integer }
 *                   type: { type: string, enum: [pair, group] }
 *                   employeeIds: { type: array, items: { type: integer } }
 *                   maxConcurrent: { type: integer }
 *                   description: { type: string }
 */
router.get('/restrictions', authenticateToken, async (req, res) => {
  try {
    const { departmentId } = req.query
    const user = req.user

    if (!departmentId) {
      return res.status(400).json({ error: 'departmentId parameter is required' })
    }

    if (user.role === 'employee') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const result = await query(
      `SELECT * FROM vacation_restrictions
       WHERE department_id = $1
       ORDER BY created_at DESC`,
      [departmentId]
    )

    res.json(result.rows.map(r => ({
      ...r,
      id: r.id.toString(),
      departmentId: r.department_id.toString(),
      type: r.restriction_type,
      employeeIds: r.employee_ids.map((id) => id.toString()),
      maxConcurrent: r.max_concurrent,
      createdAt: r.created_at,
      createdBy: r.created_by?.toString(),
    })))
  } catch (error) {
    console.error('Error fetching vacation restrictions:', error)
    res.status(500).json({ error: 'Failed to fetch vacation restrictions' })
  }
})

/**
 * @swagger
 * /vacation/restrictions:
 *   post:
 *     tags: [Vacation]
 *     summary: Создать ограничение на отпуска
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [departmentId, type]
 *             properties:
 *               departmentId: { type: integer }
 *               type: { type: string, enum: [pair, group] }
 *               employeeIds: { type: array, items: { type: integer } }
 *               maxConcurrent: { type: integer }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Ограничение создано
 */
router.post('/restrictions', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  try {
    const { departmentId, type, employeeIds, maxConcurrent, description } = req.body
    const userId = req.user.id

    if (!departmentId || !type || !employeeIds || employeeIds.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (type === 'pair' && employeeIds.length !== 2) {
      return res.status(400).json({ error: 'Pair restrictions must have exactly 2 employees' })
    }

    if (type === 'group' && employeeIds.length < 2) {
      return res.status(400).json({ error: 'Group restrictions must have at least 2 employees' })
    }

    if (type === 'group' && !maxConcurrent) {
      return res.status(400).json({ error: 'Max concurrent is required for group restrictions' })
    }

    const result = await query(
      `INSERT INTO vacation_restrictions
        (department_id, restriction_type, employee_ids, max_concurrent, description, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
      [departmentId, type, employeeIds, maxConcurrent || null, description || null, userId]
    )

    const restriction = result.rows[0]

    res.status(201).json({
      id: restriction.id.toString(),
      departmentId: restriction.department_id.toString(),
      type: restriction.restriction_type,
      employeeIds: restriction.employee_ids.map((id) => id.toString()),
      maxConcurrent: restriction.max_concurrent,
      description: restriction.description,
      createdAt: restriction.created_at,
      createdBy: restriction.created_by?.toString(),
    })
  } catch (error) {
    console.error('Error creating vacation restriction:', error)
    res.status(500).json({ error: 'Failed to create vacation restriction' })
  }
})

/**
 * @swagger
 * /vacation/restrictions/{id}:
 *   delete:
 *     tags: [Vacation]
 *     summary: Удалить ограничение
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ограничение удалено
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 */
router.delete('/restrictions/:id', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params

    await query('DELETE FROM vacation_restrictions WHERE id = $1', [id])

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting vacation restriction:', error)
    res.status(500).json({ error: 'Failed to delete vacation restriction' })
  }
})

/**
 * @swagger
 * /vacation/check-restrictions:
 *   post:
 *     tags: [Vacation]
 *     summary: Проверить ограничения для дат отпуска
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, startDate, endDate]
 *             properties:
 *               userId: { type: integer }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Результат проверки
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   field: { type: string }
 *                   message: { type: string }
 *                   details: { type: object }
 */
router.post('/check-restrictions', authenticateToken, async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.body
    console.log('[Backend check-restrictions] Called with:', { userId, startDate, endDate })

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const userResult = await query('SELECT department_id FROM users WHERE id = $1', [userId])

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const departmentId = userResult.rows[0].department_id

    const restrictionsResult = await query(
      `SELECT * FROM vacation_restrictions
       WHERE department_id = $1
       AND $2 = ANY(employee_ids)`,
      [departmentId, userId]
    )

    console.log('[Backend check-restrictions] Found restrictions:', restrictionsResult.rows.length)

    const warnings = []

    for (const restriction of restrictionsResult.rows) {
      const employeeIds = restriction.employee_ids.map((id) => id.toString())

      const overlappingRequestsResult = await query(
        `SELECT vr.*, u.first_name, u.last_name
         FROM vacation_requests vr
         JOIN users u ON vr.user_id = u.id
         JOIN request_statuses rs ON vr.status_id = rs.id
         WHERE rs.code = 'approved'
         AND vr.user_id != $1
         AND vr.user_id = ANY($2)
         AND (
           (vr.start_date <= $3 AND vr.end_date >= $3)
           OR (vr.start_date <= $4 AND vr.end_date >= $4)
           OR (vr.start_date >= $3 AND vr.end_date <= $3)
         )`,
        [userId, employeeIds, startDate, endDate]
      )

      const overlappingRequests = overlappingRequestsResult.rows

      if (overlappingRequests.length > 0) {
        if (restriction.restriction_type === 'pair') {
          const conflictingEmployee = overlappingRequests[0]
          warnings.push({
            field: 'restriction',
            message: `Пересечение с отпуском сотрудника: ${conflictingEmployee.last_name} ${conflictingEmployee.first_name}`,
            details: {
              restrictionId: restriction.id.toString(),
              restrictionType: restriction.restriction_type,
              conflictingEmployee: {
                id: conflictingEmployee.user_id.toString(),
                name: `${conflictingEmployee.last_name} ${conflictingEmployee.first_name}`,
                dates: `${conflictingEmployee.start_date} - ${conflictingEmployee.end_date}`,
              },
            },
          })
        } else if (restriction.restriction_type === 'group' && restriction.max_concurrent) {
          const concurrentVacations = overlappingRequests.length + 1
          if (concurrentVacations > restriction.max_concurrent) {
            const conflictingEmployees = overlappingRequests.map(r => `${r.last_name} ${r.first_name}`).join(', ')
            warnings.push({
              field: 'restriction',
              message: `Превышен лимит одновременно находящихся в отпуске сотрудников (${concurrentVacations} из ${restriction.max_concurrent})`,
              details: {
                restrictionId: restriction.id.toString(),
                restrictionType: restriction.restriction_type,
                maxConcurrent: restriction.max_concurrent,
                concurrentVacations,
                conflictingEmployees,
              },
            })
          }
        }
      }
    }

    res.json(warnings)
  } catch (error) {
    console.error('Error checking vacation restrictions:', error)
    res.status(500).json({ error: 'Failed to check vacation restrictions' })
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/transfer:
 *   post:
 *     tags: [Vacation]
 *     summary: Создать запрос на перенос отпуска
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
 *             required: [newStartDate, newEndDate, reason]
 *             properties:
 *               newStartDate: { type: string, format: date }
 *               newEndDate: { type: string, format: date }
 *               reason: { type: string }
 *               note: { type: string }
 *     responses:
 *       201:
 *         description: Запрос на перенос создан
 */
router.post('/requests/:id/transfer', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { id } = req.params
    const { newStartDate, newEndDate, reason, note } = req.body
    const userId = req.user.id

    if (!newStartDate || !newEndDate || !reason?.trim()) {
      return res.status(400).json({ error: 'Необходимо указать новые даты и причину переноса' })
    }

    await client.query('BEGIN')

    const requestResult = await client.query(
      `SELECT vr.*, rs.code as status
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.id = $1`,
      [id]
    )

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Заявка не найдена' })
    }

    const originalRequest = requestResult.rows[0]
    const originalYear = extractYear(originalRequest.start_date)

    if (originalRequest.user_id !== userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (originalRequest.status !== 'approved') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно переносить только согласованные заявки' })
    }

    const parseLocalDate = (dateStr) => {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    }

    const newStart = parseLocalDate(newStartDate)
    const newEnd = parseLocalDate(newEndDate)
    const newYear = newStart.getFullYear()

    if (newYear !== originalYear) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Перенос возможен только в пределах одного года' })
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (newStart < today) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Нельзя переносить на прошедшую дату' })
    }

    if (newEnd < newStart) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' })
    }

    const newDuration = Math.floor((newEnd - newStart) / (1000 * 60 * 60 * 24)) + 1

    const overlapResult = await client.query(
      `SELECT vr.id FROM vacation_requests vr
        JOIN request_statuses rs ON vr.status_id = rs.id
        WHERE vr.user_id = $1
        AND vr.id != $2
        AND rs.code IN ('on_approval', 'approved')
        AND (
          (vr.start_date <= $3 AND vr.end_date >= $3)
          OR (vr.start_date <= $4 AND vr.end_date >= $4)
          OR (vr.start_date >= $3 AND vr.end_date <= $4)
        )`,
      [userId, id, newStartDate, newEndDate]
    )

    if (overlapResult.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Пересечение с существующей заявкой' })
    }

    const balanceResult = await client.query(
      'SELECT * FROM vacation_balances WHERE user_id = $1 AND year = $2',
      [userId, originalYear]
    )
    const balance = balanceResult.rows[0]

    const durationDiff = newDuration - originalRequest.duration

    if (durationDiff > 0 && balance.available_days < durationDiff) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: 'Недостаточно дней на балансе',
        available: balance?.available_days || 0,
        required: durationDiff
      })
    }

    const newRequestResult = await client.query(
      `INSERT INTO vacation_requests
        (user_id, start_date, end_date, duration, vacation_type_id, comment, has_travel, travel_destination,
         reference_document, status_id, transferred_from_id, transfer_note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                (SELECT id FROM request_statuses WHERE code = 'on_approval'), $10, $11)
        RETURNING *`,
      [
        userId,
        newStartDate,
        newEndDate,
        newDuration,
        originalRequest.vacation_type_id,
        reason,
        originalRequest.has_travel,
        originalRequest.travel_destination,
        originalRequest.reference_document,
        id,
        note || null
      ]
    )

    const newRequest = newRequestResult.rows[0]

    await client.query(
      `UPDATE vacation_requests
       SET transfer_requested_at = CURRENT_TIMESTAMP,
           transfer_reason = $1
       WHERE id = $2`,
      [reason, id]
    )

    if (durationDiff !== 0) {
      await client.query(
        `UPDATE vacation_balances
         SET used_days = used_days + $1,
             reserved_days = reserved_days + $2
         WHERE user_id = $3 AND year = $4`,
        [-originalRequest.duration, newDuration, userId, originalYear]
      )
    } else {
      await client.query(
        `UPDATE vacation_balances
         SET used_days = used_days - $1,
             reserved_days = reserved_days + $1
         WHERE user_id = $2 AND year = $3`,
        [originalRequest.duration, userId, originalYear]
      )
    }

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'on_approval'), $2, $3)`,
      [newRequest.id, userId, `Перенос из заявки #${id}: ${reason}`]
    )

    await fillVacationTimesheetEntries(client, userId, newRequest.start_date, newRequest.end_date)

    await client.query('COMMIT')

    const managerResult = await client.query(
      `SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id =
       (SELECT manager_id FROM users WHERE id = $1)`,
      [userId]
    )
    const manager = managerResult.rows[0]
    const employeeResult = await client.query(
      'SELECT id, first_name, last_name, position FROM users WHERE id = $1',
      [userId]
    )
    const employee = employeeResult.rows[0]

    if (manager) {
      TelegramService.sendNewRequestNotification(
        {
          firstName: manager.first_name,
          lastName: manager.last_name,
          telegram_chat_id: manager.telegram_chat_id,
          telegram_notifications_enabled: manager.telegram_notifications_enabled
        },
        {
          start_date: newRequest.start_date,
          end_date: newRequest.end_date,
          duration: newRequest.duration,
          vacation_type: originalRequest.vacation_type,
          has_travel: newRequest.has_travel,
          comment: `Перенос из заявки #${id}: ${reason}`
        },
        {
          firstName: employee.first_name,
          lastName: employee.last_name,
          position: employee.position
        }
       ).catch(console.error)
    }

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [newRequest.id]
    )

    res.status(201).json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error requesting vacation transfer:', error)
    res.status(500).json({ error: 'Failed to request vacation transfer' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/transfer/approve:
 *   post:
 *     tags: [Vacation]
 *     summary: Одобрить перенос отпуска
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Перенос одобрен
 */
router.post('/requests/:id/transfer/approve', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const managerId = req.user.id

    await client.query('BEGIN')

    const newRequestResult = await client.query(
      `SELECT vr.*, rs.code as status, d.manager_id
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1 AND vr.transferred_from_id IS NOT NULL`,
      [id]
    )

    if (newRequestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Запрос на перенос не найден' })
    }

    const newRequest = newRequestResult.rows[0]

    if (newRequest.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно одобрить только заявку на согласовании' })
    }

    if (newRequest.manager_id !== managerId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Только руководитель отдела может согласовывать заявки' })
    }

    const originalRequestResult = await client.query(
      `SELECT * FROM vacation_requests WHERE id = $1`,
      [newRequest.transferred_from_id]
    )

    if (originalRequestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Исходная заявка не найдена' })
    }

    const originalRequest = originalRequestResult.rows[0]

    await client.query(
      `UPDATE vacation_requests
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee'),
           cancellation_reason = 'Перенесён на другие даты (заявка #' + $1 + ')'
       WHERE id = $2`,
      [id, originalRequest.id]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee'), $2, $3)`,
      [originalRequest.id, managerId, `Перенесён на другие даты (заявка #${id})`]
    )

    await client.query(
      `UPDATE vacation_requests vr
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'approved'),
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $1
       WHERE vr.id = $2`,
      [managerId, id]
    )

    await client.query(
      `UPDATE vacation_balances
       SET reserved_days = reserved_days - $1,
           used_days = used_days + $1
       WHERE user_id = $2 AND year = EXTRACT(YEAR FROM $3::date)`,
      [newRequest.duration, newRequest.user_id, newRequest.start_date]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'approved'), $2, 'Перенос одобрен')`,
      [id, managerId]
    )

    await clearVacationTimesheetEntries(client, originalRequest.user_id, originalRequest.start_date, originalRequest.end_date)
    await fillVacationTimesheetEntries(client, newRequest.user_id, newRequest.start_date, newRequest.end_date)

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [newRequest.user_id]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationApprovedNotification(
      {
        firstName: user.first_name,
        lastName: user.last_name,
        telegram_chat_id: user.telegram_chat_id,
        telegram_notifications_enabled: user.telegram_notifications_enabled
      },
      {
        start_date: newRequest.start_date,
        end_date: newRequest.end_date,
        duration: newRequest.duration,
        vacation_type: newRequest.vacation_type,
        has_travel: newRequest.has_travel
      }
         ).catch(console.error)

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    res.json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error approving vacation transfer:', error)
    res.status(500).json({ error: 'Failed to approve vacation transfer' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/transfer/reject:
 *   post:
 *     tags: [Vacation]
 *     summary: Отклонить перенос отпуска
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Перенос отклонён
 */
router.post('/requests/:id/transfer/reject', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const { reason } = req.body
    const managerId = req.user.id

    if (!reason?.trim()) {
      return res.status(400).json({ error: 'Необходимо указать причину отклонения' })
    }

    await client.query('BEGIN')

    const newRequestResult = await client.query(
      `SELECT vr.*, rs.code as status, d.manager_id
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1 AND vr.transferred_from_id IS NOT NULL`,
      [id]
    )

    if (newRequestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Запрос на перенос не найден' })
    }

    const newRequest = newRequestResult.rows[0]

    if (newRequest.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно отклонить только заявку на согласовании' })
    }

    if (newRequest.manager_id !== managerId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Только руководитель отдела может отклонять заявки' })
    }

    const originalRequestResult = await client.query(
      `SELECT * FROM vacation_requests WHERE id = $1`,
      [newRequest.transferred_from_id]
    )
    const originalRequest = originalRequestResult.rows[0]

    await client.query(
      `UPDATE vacation_requests vr
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'rejected'),
           rejection_reason = $1,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $2
       WHERE vr.id = $3`,
      [reason, managerId, id]
    )

    await client.query(
      `UPDATE vacation_balances
       SET reserved_days = reserved_days - $1,
           used_days = used_days + $1
       WHERE user_id = $2 AND year = EXTRACT(YEAR FROM $3::date)`,
      [newRequest.duration, newRequest.user_id, newRequest.start_date]
    )

    await client.query(
      `UPDATE vacation_requests
       SET transfer_requested_at = NULL,
           transfer_reason = NULL
       WHERE id = $1`,
      [originalRequest.id]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'rejected'), $2, $3)`,
      [id, managerId, reason]
    )

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [newRequest.user_id]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationRejectedNotification(
      {
        firstName: user.first_name,
        lastName: user.last_name,
        telegram_chat_id: user.telegram_chat_id,
        telegram_notifications_enabled: user.telegram_notifications_enabled
      },
      {
        start_date: newRequest.start_date,
        end_date: newRequest.end_date,
        duration: newRequest.duration,
        rejection_reason: reason
      }
         ).catch(console.error)

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    res.json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error rejecting vacation transfer:', error)
    res.status(500).json({ error: 'Failed to reject vacation transfer' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/transfer/cancel:
 *   post:
 *     tags: [Vacation]
 *     summary: Отменить запрос на перенос
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Запрос на перенос отменён
 */
router.post('/requests/:id/transfer/cancel', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { id } = req.params
    const userId = req.user.id

    await client.query('BEGIN')

    const newRequestResult = await client.query(
      `SELECT vr.*, rs.code as status
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.id = $1 AND vr.transferred_from_id IS NOT NULL`,
      [id]
    )

    if (newRequestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Запрос на перенос не найден' })
    }

    const newRequest = newRequestResult.rows[0]

    if (newRequest.user_id !== userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (newRequest.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно отменить только заявку на согласовании' })
    }

    const originalRequestResult = await client.query(
      `SELECT * FROM vacation_requests WHERE id = $1`,
      [newRequest.transferred_from_id]
    )
    const originalRequest = originalRequestResult.rows[0]

    await client.query(
      `UPDATE vacation_requests
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee')
       WHERE id = $1`,
      [id]
    )

    await client.query(
      `UPDATE vacation_balances
       SET reserved_days = reserved_days - $1,
           used_days = used_days + $1
       WHERE user_id = $2 AND year = EXTRACT(YEAR FROM $3::date)`,
      [newRequest.duration, userId, newRequest.start_date]
    )

    await client.query(
      `UPDATE vacation_requests
       SET transfer_requested_at = NULL,
           transfer_reason = NULL
       WHERE id = $1`,
      [originalRequest.id]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'rejected'), $2, $3)`,
      [id, userId, 'Отменено сотрудником']
    )

    await clearVacationTimesheetEntries(client, newRequest.user_id, newRequest.start_date, newRequest.end_date)

    await client.query('COMMIT')

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )

    res.json(fullResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error cancelling vacation transfer:', error)
    res.status(500).json({ error: 'Failed to cancel vacation transfer' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/my-transferable:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить переносимые отпуска текущего пользователя
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список переносимых отпусков
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   start_date: { type: string, format: date }
 *                   end_date: { type: string, format: date }
 *                   duration: { type: integer }
 *                   vacation_type_name: { type: string }
 */
// GET /api/vacation/my-transferable — approved upcoming vacations that can be transferred
router.get('/my-transferable', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const result = await query(
      `SELECT vr.id, vr.start_date, vr.end_date, vr.duration, vt.name as vacation_type_name
       FROM vacation_requests vr
       JOIN vacation_types vt ON vr.vacation_type_id = vt.id
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.user_id = $1
         AND rs.code = 'approved'
         AND vr.start_date >= CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM vacation_requests tr
           JOIN request_statuses trs ON tr.status_id = trs.id
           WHERE tr.transferred_from_id = vr.id
             AND trs.code NOT IN ('rejected', 'cancelled_by_employee', 'cancelled_by_manager')
         )
       ORDER BY vr.start_date`,
      [userId]
    )
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching transferable vacations:', error)
    res.status(500).json({ error: 'Ошибка загрузки данных' })
  }
})

/**
 * @swagger
 * /vacation/my-transfer-requests:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить запросы на перенос текущего пользователя
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список запросов на перенос
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
// GET /api/vacation/my-transfer-requests — my transfer requests with original + new data
router.get('/my-transfer-requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const result = await query(
      `SELECT
         nr.id,
         nr.start_date as new_start,
         nr.end_date as new_end,
         nr.duration as new_days,
         nr.transfer_note as note,
         orig.id as original_id,
         orig.start_date as original_start,
         orig.end_date as original_end,
         orig.duration as original_days,
         rs.code as status
       FROM vacation_requests nr
       JOIN vacation_requests orig ON nr.transferred_from_id = orig.id
       JOIN request_statuses rs ON nr.status_id = rs.id
       WHERE nr.user_id = $1
       ORDER BY nr.created_at DESC`,
      [userId]
    )
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching transfer requests:', error)
    res.status(500).json({ error: 'Ошибка загрузки данных' })
  }
})

/**
 * @swagger
 * /vacation/generate-application:
 *   post:
 *     tags: [Vacation]
 *     summary: Сгенерировать заявление на отпуск (DOCX)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [year]
 *             properties:
 *               year: { type: integer }
 *               templateId: { type: integer }
 *     responses:
 *       200:
 *         description: DOCX файл
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema:
 *               type: string
 *               format: binary
 */
// POST /api/vacation/generate-application
// Body: { year, templateId }
router.post('/generate-application', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { year, templateId } = req.body

    if (!year || !templateId) {
      return res.status(400).json({ error: 'Необходимо указать год и шаблон' })
    }

    const [userResult, tmplResult, vacResult] = await Promise.all([
      query(
        `SELECT u.first_name, u.last_name, u.middle_name, u.position, d.name as department_name
         FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = $1`,
        [userId]
      ),
      query(
        `SELECT name, file_key, mime_type FROM document_templates WHERE id = $1 AND purpose = 'vacation_template'`,
        [templateId]
      ),
      query(
        `SELECT vr.start_date, vr.end_date, vr.duration, vt.name as vacation_type_name, rs.code as status
         FROM vacation_requests vr
         JOIN vacation_types vt ON vr.vacation_type_id = vt.id
         JOIN request_statuses rs ON vr.status_id = rs.id
         WHERE vr.user_id = $1 AND EXTRACT(YEAR FROM vr.start_date) = $2
         ORDER BY vr.start_date`,
        [userId, year]
      ),
    ])

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' })
    if (tmplResult.rows.length === 0) return res.status(404).json({ error: 'Шаблон не найден' })

    const u = userResult.rows[0]
    const tmpl = tmplResult.rows[0]

    if (!tmpl.file_key) return res.status(400).json({ error: 'Файл шаблона не прикреплён' })

    const fullName = [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ')
    const initials = [u.first_name?.[0], u.middle_name?.[0]].filter(Boolean).map(c => c + '.').join('')
    const shortName = [u.last_name, initials].filter(Boolean).join(' ')

    const formatDate = (d) => {
      if (!d) return ''
      const dt = new Date(d)
      return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    const vacations = vacResult.rows.map((v, i) => ({
      num: String(i + 1),
      type: v.vacation_type_name,
      start: formatDate(v.start_date),
      end: formatDate(v.end_date),
      days: String(v.duration),
      status: { on_approval: 'На согласовании', approved: 'Согласовано', rejected: 'Отклонено', cancelled_by_employee: 'Отменено', cancelled_by_manager: 'Отменено' }[v.status] || v.status,
    }))

    const today = new Date()
    const data = {
      full_name: fullName,
      short_name: shortName,
      last_name: u.last_name || '',
      first_name: u.first_name || '',
      middle_name: u.middle_name || '',
      position: u.position || '',
      department: u.department_name || '',
      year: String(year),
      date_today: formatDate(today),
      vacations,
      vacations_count: String(vacations.length),
      total_days: String(vacations.reduce((s, v) => s + Number(v.days), 0)),
    }

    const s3Response = await getFromS3(tmpl.file_key)
    const buffer = Buffer.from(await s3Response.Body.transformToByteArray())

    const zip = new PizZip(buffer)
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
    doc.render(data)
    const output = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const filename = encodeURIComponent(`Заявление_${u.last_name}_${year}.docx`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
    res.send(output)
  } catch (error) {
    console.error('Error generating vacation application:', error)
    res.status(500).json({ error: 'Ошибка генерации документа' })
  }
})

/**
 * @swagger
 * /vacation/generate-transfer-application:
 *   post:
 *     tags: [Vacation]
 *     summary: Сгенерировать заявление на перенос отпуска (DOCX)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [templateId, transferIds]
 *             properties:
 *               templateId: { type: integer }
 *               transferIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: DOCX файл
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema:
 *               type: string
 *               format: binary
 */
// POST /api/vacation/generate-transfer-application
// Body: { templateId, transferIds: number[] }
router.post('/generate-transfer-application', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { templateId, transferIds } = req.body

    if (!templateId || !Array.isArray(transferIds) || transferIds.length === 0) {
      return res.status(400).json({ error: 'Необходимо указать шаблон и переносы' })
    }

    const [userResult, tmplResult, transfersResult] = await Promise.all([
      query(
        `SELECT u.first_name, u.last_name, u.middle_name, u.position, d.name as department_name
         FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = $1`,
        [userId]
      ),
      query(
        `SELECT name, file_key FROM document_templates WHERE id = $1 AND purpose = 'vacation_transfer_template'`,
        [templateId]
      ),
      query(
        `SELECT nr.id, nr.start_date as new_start, nr.duration as new_days, nr.transfer_note as note,
                orig.start_date as original_start, orig.duration as original_days,
                rs.code as status
         FROM vacation_requests nr
         JOIN vacation_requests orig ON nr.transferred_from_id = orig.id
         JOIN request_statuses rs ON nr.status_id = rs.id
         WHERE nr.id = ANY($1) AND nr.user_id = $2 AND rs.code = 'approved'
         ORDER BY orig.start_date`,
        [transferIds, userId]
      ),
    ])

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' })
    if (tmplResult.rows.length === 0) return res.status(404).json({ error: 'Шаблон не найден' })
    if (transfersResult.rows.length === 0) return res.status(400).json({ error: 'Нет подтверждённых переносов' })

    const u = userResult.rows[0]
    const tmpl = tmplResult.rows[0]

    if (!tmpl.file_key) return res.status(400).json({ error: 'Файл шаблона не прикреплён' })

    const fullName = [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ')
    const initials = [u.first_name?.[0], u.middle_name?.[0]].filter(Boolean).map(c => c + '.').join('')
    const shortName = [u.last_name, initials].filter(Boolean).join(' ')

    const formatDate = (d) => {
      if (!d) return ''
      const dt = new Date(d)
      return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    const today = new Date()
    const data = {
      full_name: fullName,
      short_name: shortName,
      last_name: u.last_name || '',
      first_name: u.first_name || '',
      middle_name: u.middle_name || '',
      position: u.position || '',
      department: u.department_name || '',
      date_today: formatDate(today),
      year: String(today.getFullYear()),
      transfers: transfersResult.rows.map(t => {
        const delta = t.new_days - t.original_days
        return {
          original_start: formatDate(t.original_start),
          original_days: String(t.original_days),
          new_start: formatDate(t.new_start),
          new_days: String(t.new_days),
          delta_direction: delta >= 0 ? 'увеличив' : 'сократив',
          delta_days: String(Math.abs(delta)),
          note: t.note ? ` ${t.note}` : '',
        }
      }),
    }

    const s3Response = await getFromS3(tmpl.file_key)
    const buffer = Buffer.from(await s3Response.Body.transformToByteArray())

    const zip = new PizZip(buffer)
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
    doc.render(data)
    const output = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const filename = encodeURIComponent(`Заявление_перенос_${u.last_name}.docx`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
    res.send(output)
  } catch (error) {
    console.error('Error generating transfer application:', error)
    res.status(500).json({ error: 'Ошибка генерации документа' })
  }
})

export default router
