import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { TelegramService } from '../services/telegramService.js'
import { createNotification } from '../services/notificationService.js'

const router = express.Router()

async function getStatusIdByCode(code) {
  const result = await query('SELECT id FROM request_statuses WHERE code = $1', [code])
  return result.rows[0]?.id
}

async function getVacationTypeIdByCode(code) {
  const result = await query('SELECT id FROM vacation_types WHERE code = $1', [code])
  return result.rows[0]?.id
}

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
      const approvedStatusId = await getStatusIdByCode('approved')
      // Фильтр по отделу (для календаря, списка отдела)
      if (user.role === 'employee') {
        // Сотрудник видит только одобренные заявки отдела
        whereClause += ' AND u.department_id = $1 AND vr.status_id = $2'
        params.push(departmentId, approvedStatusId)
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
      const statusId = await getStatusIdByCode(status)
      if (statusId) {
        whereClause += ' AND vr.status_id = $' + (params.length + 1)
        params.push(statusId)
      }
    }

    // Фильтр по году
    if (year) {
      whereClause += ' AND EXTRACT(YEAR FROM vr.start_date) = $' + (params.length + 1)
      params.push(year)
    }

    const sql = `
      SELECT
        vr.*,
        rs.code as status_code,
        rs.name as status_name,
        vt.code as vacation_type_code,
        vt.name as vacation_type_name,
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
              'status', rhs.code,
              'statusName', rhs.name,
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
      LEFT JOIN request_statuses rs ON vr.status_id = rs.id
      LEFT JOIN vacation_types vt ON vr.vacation_type_id = vt.id
      LEFT JOIN vacation_request_status_history vrsh ON vr.id = vrsh.request_id
      LEFT JOIN request_statuses rhs ON vrsh.status_id = rhs.id
      LEFT JOIN users hu ON vrsh.changed_by = hu.id
      ${whereClause}
      GROUP BY vr.id, u.id, d.id, rs.id, vt.id
      ORDER BY vr.created_at DESC
    `

    const result = await query(sql, params)

    const requests = result.rows.map((request) => ({
      ...request,
      status: request.status_code,
      vacationType: request.vacation_type_code,
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

    const vacationTypeId = await getVacationTypeIdByCode(vacationType)
    if (!vacationTypeId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Неверный тип отпуска' })
    }

    const onApprovalStatusId = await getStatusIdByCode('on_approval')

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

    const approvedStatusId = await getStatusIdByCode('approved')

    // Проверка пересечений (используем отформатированные локальные даты)
    const overlapResult = await client.query(
      `SELECT id FROM vacation_requests
        WHERE user_id = $1
        AND status_id IN ($2, $3)
        AND (
          (start_date <= $4 AND end_date >= $4)
          OR (start_date <= $5 AND end_date >= $5)
          OR (start_date >= $4 AND end_date <= $5)
        )`,
      [userId, onApprovalStatusId, approvedStatusId, formatDate(start), formatDate(end)]
    )

    if (overlapResult.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Пересечение с существующей заявкой' })
    }

    // Создание заявки
    const result = await client.query(
      `INSERT INTO vacation_requests 
        (user_id, start_date, end_date, duration, vacation_type_id, comment, has_travel, travel_destination, reference_document, status_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
      [
        userId,
        formatDate(start),
        formatDate(end),
        finalDuration,
        vacationTypeId,
        comment,
        hasTravel || false,
        travelDestination || null,
        referenceDocument || null,
        onApprovalStatusId
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
        (request_id, status_id, changed_by)
        VALUES ($1, $2, $3)`,
      [request.id, onApprovalStatusId, userId]
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
      TelegramService.sendNewRequestNotification(
        {
          firstName: manager.first_name,
          lastName: manager.last_name,
          telegram_chat_id: manager.telegram_chat_id,
          telegram_notifications_enabled: manager.telegram_notifications_enabled
        },
        {
          startDate: request.start_date,
          endDate: request.end_date,
          comment: request.comment
        },
        {
          firstName: employee.rows[0].first_name,
          lastName: employee.rows[0].last_name,
          position: employee.rows[0].position
        }
      ).catch(console.error)

      createNotification(
        manager.id,
        'Новая заявка на отпуск',
        `${employee.rows[0].last_name} ${employee.rows[0].first_name} подал(а) заявку на отпуск с ${request.start_date} по ${request.end_date}`,
        'info'
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

// Update vacation request
router.put('/requests/:id', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { id } = req.params
    const { startDate, endDate, vacationType, comment, hasTravel, referenceDocument } = req.body
    const userId = req.user.id

    const vacationTypeId = await getVacationTypeIdByCode(vacationType)
    if (!vacationTypeId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Неверный тип отпуска' })
    }

    const onApprovalStatusId = await getStatusIdByCode('on_approval')
    const approvedStatusId = await getStatusIdByCode('approved')

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

    if (request.status_id !== onApprovalStatusId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно редактировать только заявки на согласовании' })
    }

    // Расчёт новой длительности
    const start = new Date(startDate)
    const end = new Date(endDate)
    const newDuration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

    // Обновление баланса в зависимости от статуса
    if (request.status_id === onApprovalStatusId) {
      await client.query(
        `UPDATE vacation_balances
         SET reserved_days = reserved_days - $1 + $2
         WHERE user_id = $3`,
        [request.duration, newDuration, request.user_id]
      )
    } else if (request.status_id === approvedStatusId) {
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
       SET start_date = $1, end_date = $2, duration = $3, vacation_type_id = $4, comment = $5, has_travel = $6, reference_document = $7
       WHERE id = $8
       RETURNING *`,
      [startDate, endDate, newDuration, vacationTypeId, comment, hasTravel || false, referenceDocument || null, id]
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

    const onApprovalStatusId = await getStatusIdByCode('on_approval')
    const approvedStatusId = await getStatusIdByCode('approved')

    await client.query('BEGIN')

    // Переносим дни из зарезервированных в использованные и обновляем заявку одним запросом
    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status_id = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
       FROM vacation_balances vb
       WHERE vr.id = $3 AND vr.status_id = $4 AND vb.user_id = vr.user_id
       RETURNING
         vr.*,
         vb.user_id as balance_user_id,
         vr.duration
       `,
      [approvedStatusId, managerId, id, onApprovalStatusId]
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
        (request_id, status_id, changed_by, comment)
        VALUES ($1, $2, $3, 'Согласовано')`,
      [id, approvedStatusId, managerId]
    )

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
        startDate: request.start_date,
        endDate: request.end_date,
        comment: request.comment
      }
    ).catch(console.error)

    createNotification(
      user.id,
      'Отпуск одобрен',
      `Ваша заявка на отпуск с ${request.start_date} по ${request.end_date} одобрена`,
      'success'
    ).catch(console.error)

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

    const onApprovalStatusId = await getStatusIdByCode('on_approval')
    const rejectedStatusId = await getStatusIdByCode('rejected')

    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status_id = $1, rejection_reason = $2, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $3
       WHERE vr.id = $4 AND vr.status_id = $5
       RETURNING vr.*`,
      [rejectedStatusId, reason, managerId, id, onApprovalStatusId]
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
        (request_id, status_id, changed_by, comment)
        VALUES ($1, $2, $3, $4)`,
      [id, rejectedStatusId, managerId, reason]
    )

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
        startDate: request.start_date,
        endDate: request.end_date,
        rejectionReason: request.rejection_reason
      }
    ).catch(console.error)

    createNotification(
      user.id,
      'Отпуск отклонен',
      `Ваша заявка на отпуск с ${request.start_date} по ${request.end_date} отклонена. Причина: ${request.rejection_reason}`,
      'error'
    ).catch(console.error)

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

    const onApprovalStatusId = await getStatusIdByCode('on_approval')
    const approvedStatusId = await getStatusIdByCode('approved')
    const cancelledByEmployeeStatusId = await getStatusIdByCode('cancelled_by_employee')

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

    if (request.status_id !== onApprovalStatusId && request.status_id !== approvedStatusId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно отменять только заявки на согласовании или согласованные заявки' })
    }

    // Возврат дней в зависимости от статуса
    if (request.status_id === onApprovalStatusId) {
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
       SET status_id = $1
       WHERE id = $2
       RETURNING *`,
      [cancelledByEmployeeStatusId, id]
    )

    // Запись в историю
    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by)
        VALUES ($1, $2, $3)`,
      [id, cancelledByEmployeeStatusId, userId]
    )

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
        startDate: request.start_date,
        endDate: request.end_date
      }
    ).catch(console.error)

    createNotification(
      userId,
      'Заявка на отпуск отменена',
      `Ваша заявка на отпуск с ${request.start_date} по ${request.end_date} отменена`,
      'warning'
    ).catch(console.error)

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

    const approvedStatusId = await getStatusIdByCode('approved')
    const cancelledByManagerStatusId = await getStatusIdByCode('cancelled_by_manager')

    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE vacation_requests vr
       SET status_id = $1, cancellation_reason = $2
       WHERE vr.id = $3 AND vr.status_id = $4
       RETURNING vr.*`,
      [cancelledByManagerStatusId, reason, id, approvedStatusId]
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
        (request_id, status_id, changed_by, comment)
        VALUES ($1, $2, $3, $4)`,
      [id, cancelledByManagerStatusId, managerId, reason]
    )

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
        startDate: request.start_date,
        endDate: request.end_date
      }
    ).catch(console.error)

    createNotification(
      user.id,
      'Заявка на отпуск отменена руководителем',
      `Ваша заявка на отпуск с ${request.start_date} по ${request.end_date} была отменена руководителем. Причина: ${reason}`,
      'warning'
    ).catch(console.error)

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

    const approvedStatusId = await getStatusIdByCode('approved')

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
      WHERE vr.status_id = $1
      AND EXTRACT(YEAR FROM vr.start_date) = $2
    `

    const params = [approvedStatusId, year]

    if (departmentId) {
      sql += ' AND u.department_id = $3'
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
    const approvedStatusId = await getStatusIdByCode('approved')

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
         WHERE vr.status_id = $1
         AND vr.user_id != $2
         AND vr.user_id = ANY($3)
         AND (
           (vr.start_date <= $4 AND vr.end_date >= $4)
           OR (vr.start_date <= $5 AND vr.end_date >= $5)
           OR (vr.start_date >= $4 AND vr.end_date <= $4)
         )`,
        [approvedStatusId, userId, employeeIds, startDate, endDate]
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
