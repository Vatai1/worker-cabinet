import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import log from '../utils/logger.js'

const router = express.Router()

// Get all vacation requests (with filters)
router.get('/requests', authenticateToken, async (req, res) => {
  log.api.start(req, 'VACATION', 'GET /requests')
  
  try {
    const { userId, status, departmentId, year } = req.query
    const user = req.user

    log.debug('VACATION', 'Query params', { userId, status, departmentId, year })

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
        // Сотрудник видит свои заявки (любого статуса) + одобренные заявки коллег
        whereClause += ' AND u.department_id = $1 AND (vr.user_id = $2 OR vr.status = $3)'
        params.push(departmentId, user.id, 'approved')
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
    log.db('VACATION', 'Fetched requests', sql, params, req)

    const requests = result.rows.map((request) => ({
      ...request,
      statusHistory: request.status_history,
    }))

    log.api.success(req, 'VACATION', 'GET /requests', 200, { count: requests.length })
    res.json(requests)
  } catch (error) {
    log.api.error(req, 'VACATION', 'GET /requests', error)
    res.status(500).json({ error: 'Failed to fetch vacation requests' })
  }
})

// Get vacation balance for user
router.get('/balance/:userId', authenticateToken, async (req, res) => {
  log.api.start(req, 'VACATION', 'GET /balance/:userId')
  
  try {
    const { userId } = req.params
    const currentUser = req.user

    log.debug('VACATION', 'Balance request', { requestedUserId: userId, currentUserId: currentUser.id, currentRole: currentUser.role })

    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      log.warn('VACATION', 'Access denied', { currentUserId: currentUser.id, requestedUserId: userId })
      return res.status(403).json({ error: 'Forbidden' })
    }

    const result = await query(
      'SELECT * FROM vacation_balances WHERE user_id = $1',
      [userId]
    )
    log.db('VACATION', 'Fetched balance', 'SELECT * FROM vacation_balances WHERE user_id = $1', [userId], req)

    if (result.rows.length === 0) {
      log.info('VACATION', 'Creating new balance for user', { userId })
      const newBalance = await query(
        `INSERT INTO vacation_balances (user_id, total_days, used_days, reserved_days)
         VALUES ($1, 28, 0, 0)
         RETURNING *`,
        [userId]
      )
      log.api.success(req, 'VACATION', 'GET /balance/:userId', 200, newBalance.rows[0])
      return res.json(newBalance.rows[0])
    }

    log.api.success(req, 'VACATION', 'GET /balance/:userId', 200, result.rows[0])
    res.json(result.rows[0])
  } catch (error) {
    log.api.error(req, 'VACATION', 'GET /balance/:userId', error)
    res.status(500).json({ error: 'Failed to fetch vacation balance' })
  }
})

// Create vacation request
router.post('/requests', authenticateToken, async (req, res) => {
  log.api.start(req, 'VACATION', 'POST /requests (create)')
  
  let client
  try {
    client = await getClient()
    log.transaction('VACATION', 'Acquired DB client', { hasClient: !!client }, req)
  } catch (e) {
    log.api.error(req, 'VACATION', 'POST /requests - DB connection failed', e, 500)
    return res.status(500).json({ error: 'Database connection failed' })
  }
  
  try {
    const { startDate, endDate, vacationType, comment, hasTravel, travelDestination, referenceDocument } = req.body
    const userId = req.user.id

    log.info('VACATION', 'Creating vacation request', {
      userId,
      userEmail: req.user.email,
      startDate,
      endDate,
      vacationType,
      hasTravel,
      travelDestination,
      hasReferenceDocument: !!referenceDocument,
    })

    await client.query('BEGIN')
    log.transaction('VACATION', 'BEGIN', {}, req)

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
      log.warn('VACATION', 'Validation failed: start date in past', { start, today })
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Нельзя создавать заявку на прошедшую дату' })
    }

    if (end < start) {
      log.warn('VACATION', 'Validation failed: end before start', { start, end })
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' })
    }

    if (vacationType === 'educational' && !referenceDocument) {
      log.warn('VACATION', 'Validation failed: missing reference document for educational vacation')
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Для учебного отпуска необходимо приложить справку' })
    }

    const duration = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1
    const finalDuration = hasTravel ? duration + 2 : duration

    log.debug('VACATION', 'Calculated duration', { duration, finalDuration, hasTravel })

    const balanceResult = await client.query(
      'SELECT * FROM vacation_balances WHERE user_id = $1',
      [userId]
    )

    const balance = balanceResult.rows[0]
    log.debug('VACATION', 'Current balance', { balance })

    if (!balance || balance.available_days < finalDuration) {
      log.warn('VACATION', 'Insufficient balance', { 
        available: balance?.available_days || 0, 
        required: finalDuration 
      })
      await client.query('ROLLBACK')
      return res.status(400).json({ 
        error: 'Недостаточно дней на балансе',
        available: balance?.available_days || 0,
        required: finalDuration
      })
    }

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
      log.warn('VACATION', 'Date overlap detected', { 
        overlappingRequestIds: overlapResult.rows.map(r => r.id) 
      })
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Пересечение с существующей заявкой' })
    }

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
    log.info('VACATION', 'Created vacation request', { requestId: request.id, userId, duration: finalDuration })

    await client.query(
      `UPDATE vacation_balances 
       SET reserved_days = reserved_days + $1
       WHERE user_id = $2`,
      [finalDuration, userId]
    )
    log.debug('VACATION', 'Reserved days updated', { reservedDays: finalDuration, userId })

    await client.query(
      `INSERT INTO vacation_request_status_history 
       (request_id, status, changed_by) 
       VALUES ($1, 'on_approval', $2)`,
      [request.id, userId]
    )

    await client.query('COMMIT')
    log.transaction('VACATION', 'COMMIT', { requestId: request.id }, req)

    log.api.success(req, 'VACATION', 'POST /requests', 201, { requestId: request.id, status: 'on_approval' })
    res.status(201).json(request)
  } catch (error) {
    await client.query('ROLLBACK')
    log.transaction('VACATION', 'ROLLBACK', {}, req)
    log.api.error(req, 'VACATION', 'POST /requests', error)
    res.status(500).json({ error: 'Failed to create vacation request', details: error.message })
  } finally {
    client.release()
  }
})

// Update vacation request
router.put('/requests/:id', authenticateToken, async (req, res) => {
  log.api.start(req, 'VACATION', 'PUT /requests/:id (update)')
  
  const client = await getClient()
  
  try {
    const { id } = req.params
    const { startDate, endDate, vacationType, comment, hasTravel, referenceDocument } = req.body
    const userId = req.user.id

    log.info('VACATION', 'Updating vacation request', { requestId: id, userId, updates: { startDate, endDate, vacationType, hasTravel } })

    await client.query('BEGIN')
    log.transaction('VACATION', 'BEGIN', { requestId: id }, req)

    const requestResult = await client.query(
      'SELECT * FROM vacation_requests WHERE id = $1',
      [id]
    )

    if (requestResult.rows.length === 0) {
      log.warn('VACATION', 'Request not found', { requestId: id })
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found' })
    }

    const request = requestResult.rows[0]

    if (request.user_id !== userId && req.user.role === 'employee') {
      log.warn('VACATION', 'Access denied for update', { requestId: id, userId, requestUserId: request.user_id })
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (request.status !== 'on_approval') {
      log.warn('VACATION', 'Cannot edit request - wrong status', { requestId: id, status: request.status })
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно редактировать только заявки на согласовании' })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    const newDuration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

    log.debug('VACATION', 'Recalculated duration', { oldDuration: request.duration, newDuration })

    if (request.status === 'on_approval') {
      await client.query(
        `UPDATE vacation_balances 
         SET reserved_days = reserved_days - $1 + $2
         WHERE user_id = $3`,
        [request.duration, newDuration, request.user_id]
      )
      log.debug('VACATION', 'Updated reserved days', { oldDays: request.duration, newDays: newDuration })
    } else if (request.status === 'approved') {
      await client.query(
        `UPDATE vacation_balances 
         SET used_days = used_days - $1 + $2
         WHERE user_id = $3`,
        [request.duration, newDuration, request.user_id]
      )
      log.debug('VACATION', 'Updated used days', { oldDays: request.duration, newDays: newDuration })
    }

    const result = await client.query(
      `UPDATE vacation_requests 
       SET start_date = $1, end_date = $2, duration = $3, vacation_type = $4, comment = $5, has_travel = $6, reference_document = $7
       WHERE id = $8
       RETURNING *`,
      [startDate, endDate, newDuration, vacationType, comment, hasTravel || false, referenceDocument || null, id]
    )

    await client.query('COMMIT')
    log.transaction('VACATION', 'COMMIT', { requestId: id }, req)

    log.api.success(req, 'VACATION', 'PUT /requests/:id', 200, { requestId: id })
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    log.transaction('VACATION', 'ROLLBACK', {}, req)
    log.api.error(req, 'VACATION', 'PUT /requests/:id', error)
    res.status(500).json({ error: 'Failed to update vacation request' })
  } finally {
    client.release()
  }
})

// Approve vacation request
router.post('/requests/:id/approve', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  log.api.start(req, 'VACATION', 'POST /requests/:id/approve')
  
  const client = await getClient()

  try {
    const { id } = req.params
    const managerId = req.user.id

    log.info('VACATION', 'Approving request', { 
      requestId: id, 
      managerId, 
      managerEmail: req.user.email,
      managerRole: req.user.role 
    })

    await client.query('BEGIN')
    log.transaction('VACATION', 'BEGIN', { requestId: id, action: 'approve' }, req)

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
      log.warn('VACATION', 'Request not found or already processed', { requestId: id })
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found or not pending approval' })
    }

    const request = result.rows[0]
    log.debug('VACATION', 'Request approved, updating balance', { 
      requestId: id, 
      duration: request.duration,
      userId: request.balance_user_id 
    })

    await client.query(
      `UPDATE vacation_balances 
       SET reserved_days = reserved_days - $1,
           used_days = used_days + $1
       WHERE user_id = $2`,
      [request.duration, request.balance_user_id]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history 
       (request_id, status, changed_by, comment) 
       VALUES ($1, 'approved', $2, 'Согласовано')`,
      [id, managerId]
    )

    await client.query('COMMIT')
    log.transaction('VACATION', 'COMMIT', { requestId: id, status: 'approved' }, req)

    log.api.success(req, 'VACATION', 'POST /requests/:id/approve', 200, { requestId: id, status: 'approved' })
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    log.transaction('VACATION', 'ROLLBACK', {}, req)
    log.api.error(req, 'VACATION', 'POST /requests/:id/approve', error)
    res.status(500).json({ error: 'Failed to approve vacation request' })
  } finally {
    client.release()
  }
})

// Reject vacation request
router.post('/requests/:id/reject', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  log.api.start(req, 'VACATION', 'POST /requests/:id/reject')
  
  const client = await getClient()

  try {
    const { id } = req.params
    const { reason } = req.body
    const managerId = req.user.id

    log.info('VACATION', 'Rejecting request', { 
      requestId: id, 
      managerId, 
      managerEmail: req.user.email,
      reason: reason?.substring(0, 100) 
    })

    if (!reason || !reason.trim()) {
      log.warn('VACATION', 'Rejection reason missing', { requestId: id })
      return res.status(400).json({ error: 'Reason is required' })
    }

    await client.query('BEGIN')
    log.transaction('VACATION', 'BEGIN', { requestId: id, action: 'reject' }, req)

    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status = 'rejected', rejection_reason = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
       WHERE vr.id = $3 AND vr.status = 'on_approval'
       RETURNING vr.*`,
      [reason, managerId, id]
    )

    if (result.rows.length === 0) {
      log.warn('VACATION', 'Request not found or already processed', { requestId: id })
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found or not pending approval' })
    }

    const request = result.rows[0]
    log.debug('VACATION', 'Request rejected, returning reserved days', { 
      requestId: id, 
      duration: request.duration,
      userId: request.user_id 
    })

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
    log.transaction('VACATION', 'COMMIT', { requestId: id, status: 'rejected' }, req)

    log.api.success(req, 'VACATION', 'POST /requests/:id/reject', 200, { requestId: id, status: 'rejected' })
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    log.transaction('VACATION', 'ROLLBACK', {}, req)
    log.api.error(req, 'VACATION', 'POST /requests/:id/reject', error)
    res.status(500).json({ error: 'Failed to reject vacation request' })
  } finally {
    client.release()
  }
})

// Cancel vacation request (by employee)
router.post('/requests/:id/cancel', authenticateToken, async (req, res) => {
  log.api.start(req, 'VACATION', 'POST /requests/:id/cancel (by employee)')
  
  const client = await getClient()
  
  try {
    const { id } = req.params
    const userId = req.user.id

    log.info('VACATION', 'Cancelling request by employee', { 
      requestId: id, 
      userId,
      userEmail: req.user.email
    })

    await client.query('BEGIN')
    log.transaction('VACATION', 'BEGIN', { requestId: id, action: 'cancel' }, req)

    const requestResult = await client.query(
      'SELECT * FROM vacation_requests WHERE id = $1',
      [id]
    )

    if (requestResult.rows.length === 0) {
      log.warn('VACATION', 'Request not found', { requestId: id })
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found' })
    }

    const request = requestResult.rows[0]

    if (request.user_id !== userId) {
      log.warn('VACATION', 'Access denied - not owner', { requestId: id, userId, requestUserId: request.user_id })
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (request.status !== 'on_approval' && request.status !== 'approved') {
      log.warn('VACATION', 'Cannot cancel - wrong status', { requestId: id, status: request.status })
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно отменять только заявки на согласовании или согласованные заявки' })
    }

    log.debug('VACATION', 'Returning days to balance', { 
      requestId: id, 
      status: request.status, 
      duration: request.duration 
    })

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

    const result = await client.query(
      `UPDATE vacation_requests 
       SET status = 'cancelled_by_employee'
       WHERE id = $1
       RETURNING *`,
      [id]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history 
       (request_id, status, changed_by) 
       VALUES ($1, 'cancelled_by_employee', $2)`,
      [id, userId]
    )

    await client.query('COMMIT')
    log.transaction('VACATION', 'COMMIT', { requestId: id, status: 'cancelled_by_employee' }, req)

    log.api.success(req, 'VACATION', 'POST /requests/:id/cancel', 200, { requestId: id, status: 'cancelled_by_employee' })
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    log.transaction('VACATION', 'ROLLBACK', {}, req)
    log.api.error(req, 'VACATION', 'POST /requests/:id/cancel', error)
    res.status(500).json({ error: 'Failed to cancel vacation request' })
  } finally {
    client.release()
  }
})

// Cancel vacation request (by manager)
router.post('/requests/:id/cancel-by-manager', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  log.api.start(req, 'VACATION', 'POST /requests/:id/cancel-by-manager')
  
  const client = await getClient()

  try {
    const { id } = req.params
    const { reason } = req.body
    const managerId = req.user.id

    log.info('VACATION', 'Cancelling request by manager', { 
      requestId: id, 
      managerId, 
      managerEmail: req.user.email,
      managerRole: req.user.role,
      reason: reason?.substring(0, 100)
    })

    if (!reason || !reason.trim()) {
      log.warn('VACATION', 'Cancellation reason missing', { requestId: id })
      return res.status(400).json({ error: 'Reason is required' })
    }

    await client.query('BEGIN')
    log.transaction('VACATION', 'BEGIN', { requestId: id, action: 'cancel-by-manager' }, req)

    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status = 'cancelled_by_manager', cancellation_reason = $1
       WHERE vr.id = $2 AND vr.status = 'approved'
       RETURNING vr.*`,
      [reason, id]
    )

    if (result.rows.length === 0) {
      log.warn('VACATION', 'Request not found or not approved', { requestId: id })
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Request not found or not approved' })
    }

    const request = result.rows[0]
    log.debug('VACATION', 'Returning used days to balance', { 
      requestId: id, 
      duration: request.duration,
      userId: request.user_id 
    })

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
    log.transaction('VACATION', 'COMMIT', { requestId: id, status: 'cancelled_by_manager' }, req)

    log.api.success(req, 'VACATION', 'POST /requests/:id/cancel-by-manager', 200, { requestId: id, status: 'cancelled_by_manager' })
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    log.transaction('VACATION', 'ROLLBACK', {}, req)
    log.api.error(req, 'VACATION', 'POST /requests/:id/cancel-by-manager', error)
    res.status(500).json({ error: 'Failed to cancel vacation request' })
  } finally {
    client.release()
  }
})

// Get department calendar
router.get('/calendar', authenticateToken, async (req, res) => {
  log.api.start(req, 'VACATION', 'GET /calendar')
  
  try {
    const { departmentId, year } = req.query

    log.debug('VACATION', 'Calendar request params', { departmentId, year })

    if (!year) {
      log.warn('VACATION', 'Missing year parameter')
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
    log.db('VACATION', 'Fetched calendar items', sql, params, req)

    log.api.success(req, 'VACATION', 'GET /calendar', 200, { count: result.rows.length, year, departmentId })
    res.json(result.rows)
  } catch (error) {
    log.api.error(req, 'VACATION', 'GET /calendar', error)
    res.status(500).json({ error: 'Failed to fetch vacation calendar' })
  }
})

// Get vacation restrictions for department
router.get('/restrictions', authenticateToken, async (req, res) => {
  log.api.start(req, 'VACATION', 'GET /restrictions')
  
  try {
    const { departmentId } = req.query
    const user = req.user

    log.debug('VACATION', 'Restrictions request', { departmentId, userRole: user.role })

    if (!departmentId) {
      log.warn('VACATION', 'Missing departmentId parameter')
      return res.status(400).json({ error: 'departmentId parameter is required' })
    }

    if (user.role === 'employee') {
      log.warn('VACATION', 'Access denied for employee', { userId: user.id, departmentId })
      return res.status(403).json({ error: 'Forbidden' })
    }

    const result = await query(
      `SELECT * FROM vacation_restrictions
       WHERE department_id = $1
       ORDER BY created_at DESC`,
      [departmentId]
    )
    log.db('VACATION', 'Fetched restrictions', 'SELECT * FROM vacation_restrictions WHERE department_id = $1', [departmentId], req)

    log.api.success(req, 'VACATION', 'GET /restrictions', 200, { count: result.rows.length, departmentId })
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
    log.api.error(req, 'VACATION', 'GET /restrictions', error)
    res.status(500).json({ error: 'Failed to fetch vacation restrictions' })
  }
})

// Create vacation restriction
router.post('/restrictions', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  log.api.start(req, 'VACATION', 'POST /restrictions (create)')
  
  try {
    const { departmentId, type, employeeIds, maxConcurrent, description } = req.body
    const userId = req.user.id

    log.info('VACATION', 'Creating restriction', { 
      departmentId, 
      type, 
      employeeCount: employeeIds?.length, 
      maxConcurrent,
      createdBy: userId 
    })

    if (!departmentId || !type || !employeeIds || employeeIds.length === 0) {
      log.warn('VACATION', 'Missing required fields', { departmentId, type, employeeIds })
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (type === 'pair' && employeeIds.length !== 2) {
      log.warn('VACATION', 'Invalid pair restriction', { employeeCount: employeeIds.length })
      return res.status(400).json({ error: 'Pair restrictions must have exactly 2 employees' })
    }

    if (type === 'group' && employeeIds.length < 2) {
      log.warn('VACATION', 'Invalid group restriction', { employeeCount: employeeIds.length })
      return res.status(400).json({ error: 'Group restrictions must have at least 2 employees' })
    }

    if (type === 'group' && !maxConcurrent) {
      log.warn('VACATION', 'Missing maxConcurrent for group restriction')
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
    log.info('VACATION', 'Restriction created', { restrictionId: restriction.id, type, departmentId })

    log.api.success(req, 'VACATION', 'POST /restrictions', 201, { restrictionId: restriction.id })
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
    log.api.error(req, 'VACATION', 'POST /restrictions', error)
    res.status(500).json({ error: 'Failed to create vacation restriction' })
  }
})

router.delete('/restrictions/:id', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  log.api.start(req, 'VACATION', 'DELETE /restrictions/:id')
  
  try {
    const { id } = req.params

    log.info('VACATION', 'Deleting restriction', { restrictionId: id, deletedBy: req.user.id })

    await query('DELETE FROM vacation_restrictions WHERE id = $1', [id])
    log.db('VACATION', 'Deleted restriction', 'DELETE FROM vacation_restrictions WHERE id = $1', [id], req)

    log.api.success(req, 'VACATION', 'DELETE /restrictions/:id', 200, { restrictionId: id })
    res.json({ success: true })
  } catch (error) {
    log.api.error(req, 'VACATION', 'DELETE /restrictions/:id', error)
    res.status(500).json({ error: 'Failed to delete vacation restriction' })
  }
})

router.post('/check-restrictions', authenticateToken, async (req, res) => {
  log.api.start(req, 'VACATION', 'POST /check-restrictions')
  
  try {
    const { userId, startDate, endDate } = req.body

    log.info('VACATION', 'Checking restrictions', { userId, startDate, endDate })

    if (!userId || !startDate || !endDate) {
      log.warn('VACATION', 'Missing required fields for restriction check')
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const userResult = await query('SELECT department_id FROM users WHERE id = $1', [userId])

    if (userResult.rows.length === 0) {
      log.warn('VACATION', 'User not found for restriction check', { userId })
      return res.status(404).json({ error: 'User not found' })
    }

    const departmentId = userResult.rows[0].department_id
    log.debug('VACATION', 'User department', { userId, departmentId })

    const restrictionsResult = await query(
      `SELECT * FROM vacation_restrictions
       WHERE department_id = $1
       AND $2 = ANY(employee_ids)`,
      [departmentId, userId]
    )

    log.debug('VACATION', 'Found restrictions for user', { count: restrictionsResult.rows.length })

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
        log.debug('VACATION', 'Found overlapping requests', { 
          restrictionId: restriction.id, 
          restrictionType: restriction.restriction_type,
          overlappingCount: overlappingRequests.length 
        })
        
        if (restriction.restriction_type === 'pair') {
          const conflictingEmployee = overlappingRequests[0]
          log.info('VACATION', 'Pair restriction violation', { 
            restrictionId: restriction.id,
            conflictingEmployee: `${conflictingEmployee.last_name} ${conflictingEmployee.first_name}`,
            dates: `${conflictingEmployee.start_date} - ${conflictingEmployee.end_date}`
          })
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
            log.info('VACATION', 'Group restriction violation', { 
              restrictionId: restriction.id,
              maxConcurrent: restriction.max_concurrent,
              concurrentVacations,
              conflictingEmployees
            })
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

    log.api.success(req, 'VACATION', 'POST /check-restrictions', 200, { warningsCount: warnings.length })
    res.json(warnings)
  } catch (error) {
    log.api.error(req, 'VACATION', 'POST /check-restrictions', error)
    res.status(500).json({ error: 'Failed to check vacation restrictions' })
  }
})

export default router
