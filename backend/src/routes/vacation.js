import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { TelegramService } from '../services/telegramService.js'

const router = express.Router()

// Get all vacation requests (with filters)
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const { userId, status, departmentId, year } = req.query
    const user = req.user

    let whereClause = 'WHERE 1=1'
    const params = []

    // Приоритет: если явно указан userId, используем его (для "Мои заявки")
    if (userId) {
      // Проверка прав доступа к чужим заявкам
      if (parseInt(userId) !== user.id) {
        if (user.role === 'employee') {
          // Сотрудник не может видеть чужие заявки
          return res.status(403).json({ error: 'Forbidden' })
        }
        // Менеджеры/HR/админы могут видеть заявки только своих подчинённых
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
      // Фильтр по отделу (для календаря, списка отдела)
      if (user.role === 'employee') {
        // Сотрудник видит только одобренные заявки отдела
        whereClause += ' AND u.department_id = $1 AND vr.status = $2'
        params.push(departmentId, 'approved')
      } else {
        // Менеджеры/HR/админы видят все заявки отдела
        whereClause += ' AND u.department_id = $' + (params.length + 1)
        params.push(departmentId)
      }
    } else {
      // Без параметров - по правам роли
      if (user.role === 'employee') {
        // Сотрудник видит только свои заявки
        whereClause += ' AND vr.user_id = $1'
        params.push(user.id)
      } else if (user.role === 'manager') {
        // Руководитель видит свои заявки + своих подчинённых
        whereClause += ' AND (vr.user_id = $1 OR u.manager_id = $1)'
        params.push(user.id)
      }
      // HR и админы видят всё (без фильтра)
    }

    // Фильтр по статусу
    if (status) {
      whereClause += ' AND vr.status = $' + (params.length + 1)
      params.push(status)
    }

    // Фильтр по году
    if (year) {
      whereClause += ' AND EXTRACT(YEAR FROM vr.start_date) = $' + (params.length + 1)
      params.push(year)
    }

    const sql = `
      SELECT 
        vr.*,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.department_id,
        d.name as department_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vrsh.id,
              'status', vrsh.status,
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
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN vacation_request_status_history vrsh ON vr.id = vrsh.request_id
      LEFT JOIN users hu ON vrsh.changed_by = hu.id
      ${whereClause}
      GROUP BY vr.id, u.id, d.id
      ORDER BY vr.created_at DESC
    `

    const result = await query(sql, params)

    const requests = result.rows.map((request) => ({
      ...request,
      statusHistory: request.status_history,
    }))

    res.json(requests)
  } catch (error) {
    console.error('Error fetching vacation requests:', error)
    res.status(500).json({ error: 'Failed to fetch vacation requests' })
  }
})

// Get vacation balance for user
router.get('/balance/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const currentUser = req.user

    // Проверка прав доступа
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const result = await query(
      'SELECT * FROM vacation_balances WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      // Создать баланс если не существует
      const newBalance = await query(
        `INSERT INTO vacation_balances (user_id, total_days, used_days, reserved_days)
         VALUES ($1, 28, 0, 0)
         RETURNING *`,
        [userId]
      )
      return res.json(newBalance.rows[0])
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching vacation balance:', error)
    res.status(500).json({ error: 'Failed to fetch vacation balance' })
  }
})

// Create vacation request
router.post('/requests', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { startDate, endDate, vacationType, comment, hasTravel, travelDestination, referenceDocument } = req.body
    const userId = req.user.id

    await client.query('BEGIN')

    // Валидация
    // Парсим дату как локальное время (не UTC)
    const parseLocalDate = (dateStr) => {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    }

    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)

    // Форматирование даты для сохранения в базу (используем локальную дату, а не UTC)
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

    // Проверка справки для учебного отпуска
    if (vacationType === 'educational' && !referenceDocument) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Для учебного отпуска необходимо приложить справку' })
    }

    // Расчёт длительности в днях (включая обе границы)
    const duration = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1

    // Добавляем 2 дня при включении проезда
    const finalDuration = hasTravel ? duration + 2 : duration

    // Проверка баланса
    const balanceResult = await client.query(
      'SELECT * FROM vacation_balances WHERE user_id = $1',
      [userId]
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

    // Проверка пересечений (используем отформатированные локальные даты)
    const overlapResult = await client.query(
      `SELECT id FROM vacation_requests 
        WHERE user_id = $1 
        AND status IN ('on_approval', 'approved')
        AND (
          (start_date <= $2 AND end_date >= $2)
          OR (start_date <= $3 AND end_date >= $3)
          OR (start_date >= $2 AND end_date <= $3)
        )`,
      [userId, formatDate(start), formatDate(end)]
    )

    if (overlapResult.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Пересечение с существующей заявкой' })
    }

    // Создание заявки
    const result = await client.query(
      `INSERT INTO vacation_requests 
        (user_id, start_date, end_date, duration, vacation_type, comment, has_travel, travel_destination, reference_document, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'on_approval')
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

    // Резервируем дни (заявка на согласовании)
    await client.query(
      `UPDATE vacation_balances 
       SET reserved_days = reserved_days + $1
       WHERE user_id = $2`,
      [finalDuration, userId]
    )

    // Запись в историю
    await client.query(
      `INSERT INTO vacation_request_status_history
       (request_id, status, changed_by)
       VALUES ($1, 'on_approval', $2)`,
      [request.id, userId]
    )

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
      TelegramService.sendNewRequestNotification(manager, request, employee.rows[0]).catch(console.error)
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

// Update vacation request
router.put('/requests/:id', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { id } = req.params
    const { startDate, endDate, vacationType, comment, hasTravel, referenceDocument } = req.body
    const userId = req.user.id

    await client.query('BEGIN')

    // Проверка прав
    const requestResult = await client.query(
      'SELECT * FROM vacation_requests WHERE id = $1',
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

    // Расчёт новой длительности
    const start = new Date(startDate)
    const end = new Date(endDate)
    const newDuration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

    // Обновление баланса в зависимости от статуса
    if (request.status === 'on_approval') {
      await client.query(
        `UPDATE vacation_balances 
         SET reserved_days = reserved_days - $1 + $2
         WHERE user_id = $3`,
        [request.duration, newDuration, request.user_id]
      )
    } else if (request.status === 'approved') {
      await client.query(
        `UPDATE vacation_balances 
         SET used_days = used_days - $1 + $2
         WHERE user_id = $3`,
        [request.duration, newDuration, request.user_id]
      )
    }

    // Обновление заявки
    const result = await client.query(
      `UPDATE vacation_requests 
       SET start_date = $1, end_date = $2, duration = $3, vacation_type = $4, comment = $5, has_travel = $6, reference_document = $7
       WHERE id = $8
       RETURNING *`,
      [startDate, endDate, newDuration, vacationType, comment, hasTravel || false, referenceDocument || null, id]
    )

    await client.query('COMMIT')

    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error updating vacation request:', error)
    res.status(500).json({ error: 'Failed to update vacation request' })
  } finally {
    client.release()
  }
})

// Approve vacation request
router.post('/requests/:id/approve', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const managerId = req.user.id

    await client.query('BEGIN')

    // Переносим дни из зарезервированных в использованные и обновляем заявку одним запросом
    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
       FROM vacation_balances vb
       WHERE vr.id = $2 AND vr.status = 'on_approval' AND vb.user_id = vr.user_id
       RETURNING 
         vr.*,
         vb.user_id as balance_user_id,
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
       WHERE user_id = $2`,
      [request.duration, request.balance_user_id]
    )

    // Запись в историю
    await client.query(
      `INSERT INTO vacation_request_status_history
       (request_id, status, changed_by, comment)
       VALUES ($1, 'approved', $2, 'Согласовано')`,
      [id, managerId]
    )

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [request.user_id]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationApprovedNotification(user, request).catch(console.error)

    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error approving vacation request:', error)
    res.status(500).json({ error: 'Failed to approve vacation request' })
  } finally {
    client.release()
  }
})

// Reject vacation request
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

    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status = 'rejected', rejection_reason = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
       WHERE vr.id = $3 AND vr.status = 'on_approval'
       RETURNING vr.*`,
      [reason, managerId, id]
    )

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found or not pending approval' })
    }

    const request = result.rows[0]

    await client.query(
      `UPDATE vacation_balances 
       SET reserved_days = reserved_days - $1
       WHERE user_id = $2`,
      [request.duration, request.user_id]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
       (request_id, status, changed_by, comment)
       VALUES ($1, 'rejected', $2, $3)`,
      [id, managerId, reason]
    )

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [request.user_id]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationRejectedNotification(user, request).catch(console.error)

    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error rejecting vacation request:', error)
    res.status(500).json({ error: 'Failed to reject vacation request' })
  } finally {
    client.release()
  }
})

// Cancel vacation request (by employee)
router.post('/requests/:id/cancel', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { id } = req.params
    const userId = req.user.id

    await client.query('BEGIN')

    const requestResult = await client.query(
      'SELECT * FROM vacation_requests WHERE id = $1',
      [id]
    )

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found' })
    }

    const request = requestResult.rows[0]

    if (request.user_id !== userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (request.status !== 'on_approval' && request.status !== 'approved') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно отменять только заявки на согласовании или согласованные заявки' })
    }

    // Возврат дней в зависимости от статуса
    if (request.status === 'on_approval') {
      await client.query(
        `UPDATE vacation_balances 
         SET reserved_days = reserved_days - $1
         WHERE user_id = $2`,
        [request.duration, userId]
      )
    } else {
      await client.query(
        `UPDATE vacation_balances 
         SET used_days = used_days - $1
         WHERE user_id = $2`,
        [request.duration, userId]
      )
    }

    // Обновление статуса заявки
    const result = await client.query(
      `UPDATE vacation_requests 
       SET status = 'cancelled_by_employee'
       WHERE id = $1
       RETURNING *`,
      [id]
    )

    // Запись в историю
    await client.query(
      `INSERT INTO vacation_request_status_history
       (request_id, status, changed_by)
       VALUES ($1, 'cancelled_by_employee', $2)`,
      [id, userId]
    )

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationCancelledNotification(user, request).catch(console.error)

    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error cancelling vacation request:', error)
    res.status(500).json({ error: 'Failed to cancel vacation request' })
  } finally {
    client.release()
  }
})

// Cancel vacation request (by manager)
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
       SET status = 'cancelled_by_manager', cancellation_reason = $1
       WHERE vr.id = $2 AND vr.status = 'approved'
       RETURNING vr.*`,
      [reason, id]
    )

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found or not approved' })
    }

    const request = result.rows[0]

    await client.query(
      `UPDATE vacation_balances 
       SET used_days = used_days - $1
       WHERE user_id = $2`,
      [request.duration, request.user_id]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
       (request_id, status, changed_by, comment)
       VALUES ($1, 'cancelled_by_manager', $2, $3)`,
      [id, managerId, reason]
    )

    await client.query('COMMIT')

    const userResult = await client.query(
      'SELECT id, first_name, last_name, telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = $1',
      [request.user_id]
    )
    const user = userResult.rows[0]

    TelegramService.sendVacationCancelledNotification(user, request).catch(console.error)

    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error cancelling vacation request by manager:', error)
    res.status(500).json({ error: 'Failed to cancel vacation request' })
  } finally {
    client.release()
  }
})

// Get department calendar
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
        vr.vacation_type,
        vr.status
      FROM vacation_requests vr
      JOIN users u ON vr.user_id = u.id
      WHERE vr.status = 'approved'
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

// Get vacation restrictions for department
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

// Create vacation restriction
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

// Delete vacation restriction
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

// Check restrictions for dates
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
         WHERE vr.status = 'approved'
         AND vr.user_id != $1
         AND vr.user_id = ANY($2)
         AND (
           (vr.start_date <= $3 AND vr.end_date >= $3)
           OR (vr.start_date <= $4 AND vr.end_date >= $4)
           OR (vr.start_date >= $3 AND vr.end_date <= $4)
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

export default router
