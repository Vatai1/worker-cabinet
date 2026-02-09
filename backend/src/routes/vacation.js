import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

// Get all vacation requests (with filters)
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const { userId, status, departmentId, year } = req.query
    const user = req.user

    let whereClause = 'WHERE 1=1'
    const params = []

    // Фильтр по правам доступа
    if (user.role === 'employee') {
      whereClause += ' AND vr.user_id = $1'
      params.push(user.id)
    } else if (user.role === 'manager' || user.role === 'hr' || user.role === 'admin') {
      if (departmentId) {
        whereClause += ' AND u.department_id = $' + (params.length + 1)
        params.push(departmentId)
      } else if (user.role === 'manager') {
        // Руководитель видит своих подчинённых
        whereClause += ' AND u.manager_id = $' + (params.length + 1)
        params.push(user.id)
      }
    } else if (userId) {
      whereClause += ' AND vr.user_id = $' + (params.length + 1)
      params.push(userId)
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
        d.name as department_name
      FROM vacation_requests vr
      JOIN users u ON vr.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      ${whereClause}
      ORDER BY vr.created_at DESC
    `

    const result = await query(sql, params)

    // Get status history for each request
    const requests = await Promise.all(
      result.rows.map(async (request) => {
        const historyResult = await query(
          'SELECT * FROM vacation_request_status_history WHERE request_id = $1 ORDER BY changed_at',
          [request.id]
        )
        return {
          ...request,
          statusHistory: historyResult.rows,
        }
      })
    )

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
  const client = await query.getClient()
  
  try {
    const { startDate, endDate, vacationType, comment, hasTravel } = req.body
    const userId = req.user.id

    await client.query('BEGIN')

    // Валидация
    const start = new Date(startDate)
    const end = new Date(endDate)
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

    // Расчёт длительности
    const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

    // Проверка баланса
    const balanceResult = await client.query(
      'SELECT * FROM vacation_balances WHERE user_id = $1',
      [userId]
    )

    const balance = balanceResult.rows[0]
    if (!balance || balance.availableDays < duration) {
      await client.query('ROLLBACK')
      return res.status(400).json({ 
        error: 'Недостаточно дней на балансе',
        available: balance?.availableDays || 0,
        required: duration
      })
    }

    // Проверка пересечений
    const overlapResult = await client.query(
      `SELECT id FROM vacation_requests 
       WHERE user_id = $1 
       AND status IN ('on_approval', 'approved')
       AND (
         (start_date <= $2 AND end_date >= $2)
         OR (start_date <= $3 AND end_date >= $3)
         OR (start_date >= $2 AND end_date <= $3)
       )`,
      [userId, startDate, endDate]
    )

    if (overlapResult.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Пересечение с существующей заявкой' })
    }

    // Создание заявки
    const result = await client.query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, comment, has_travel, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'on_approval')
       RETURNING *`,
      [userId, startDate, endDate, duration, vacationType, comment, hasTravel || false]
    )

    const request = result.rows[0]

    // Резервирование дней
    await client.query(
      'UPDATE vacation_balances SET reserved_days = reserved_days + $1 WHERE user_id = $2',
      [duration, userId]
    )

    // Запись в историю
    await client.query(
      `INSERT INTO vacation_request_status_history 
       (request_id, status, changed_by) 
       VALUES ($1, 'on_approval', $2)`,
      [request.id, userId]
    )

    await client.query('COMMIT')

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
  const client = await query.getClient()
  
  try {
    const { id } = req.params
    const { startDate, endDate, vacationType, comment, hasTravel } = req.body
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

    // Обновление баланса
    await client.query(
      'UPDATE vacation_balances SET reserved_days = reserved_days - $1 + $2 WHERE user_id = $3',
      [request.duration, newDuration, request.user_id]
    )

    // Обновление заявки
    const result = await client.query(
      `UPDATE vacation_requests 
       SET start_date = $1, end_date = $2, duration = $3, vacation_type = $4, comment = $5, has_travel = $6
       WHERE id = $7
       RETURNING *`,
      [startDate, endDate, newDuration, vacationType, comment, hasTravel || false, id]
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
  const client = await query.getClient()
  
  try {
    const { id } = req.params
    const managerId = req.user.id

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

    if (request.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Request is not pending approval' })
    }

    // Обновление баланса - списываем резервированные дни
    await client.query(
      `UPDATE vacation_balances 
       SET used_days = used_days + $1,
           reserved_days = reserved_days - $1,
           available_days = available_days - $1
       WHERE user_id = $2`,
      [request.duration, request.user_id]
    )

    // Обновление статуса заявки
    const result = await client.query(
      `UPDATE vacation_requests 
       SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
       WHERE id = $2
       RETURNING *`,
      [managerId, id]
    )

    // Запись в историю
    await client.query(
      `INSERT INTO vacation_request_status_history 
       (request_id, status, changed_by, comment) 
       VALUES ($1, 'approved', $2, 'Согласовано')`,
      [id, managerId]
    )

    await client.query('COMMIT')

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
  const client = await query.getClient()
  
  try {
    const { id } = req.params
    const { reason } = req.body
    const managerId = req.user.id

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason is required' })
    }

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

    if (request.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Request is not pending approval' })
    }

    // Возврат дней на баланс
    await client.query(
      `UPDATE vacation_balances 
       SET reserved_days = reserved_days - $1,
           available_days = available_days + $1
       WHERE user_id = $2`,
      [request.duration, request.user_id]
    )

    // Обновление статуса заявки
    const result = await client.query(
      `UPDATE vacation_requests 
       SET status = 'rejected', rejection_reason = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
       WHERE id = $3
       RETURNING *`,
      [reason, managerId, id]
    )

    // Запись в историю
    await client.query(
      `INSERT INTO vacation_request_status_history 
       (request_id, status, changed_by, comment) 
       VALUES ($1, 'rejected', $2, $3)`,
      [id, managerId, reason]
    )

    await client.query('COMMIT')

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
  const client = await query.getClient()
  
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

    if (request.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Can only cancel pending requests' })
    }

    // Возврат дней на баланс
    await client.query(
      `UPDATE vacation_balances 
       SET reserved_days = reserved_days - $1,
           available_days = available_days + $1
       WHERE user_id = $2`,
      [request.duration, userId]
    )

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

    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error cancelling vacation request:', error)
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

export default router
