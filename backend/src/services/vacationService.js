import { query, getClient } from '../config/database.js'
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../middleware/errors.js'
import { TelegramService } from './telegramService.js'
import { createNotification } from './notificationService.js'

const VACATION_TYPE_NAMES = {
  annual_paid: 'Ежегодный оплачиваемый',
  unpaid: 'Без сохранения зарплаты',
  educational: 'Учебный',
  maternity: 'Декретный',
  child_care: 'По уходу за ребёнком',
  additional: 'Дополнительный',
  veteran: 'Ветеранский'
}

const VALID_VACATION_TYPES = ['annual_paid', 'unpaid', 'educational', 'maternity', 'child_care', 'additional', 'veteran']

class VacationService {
  async getVacationRequests(options, currentUser) {
    const { userId, status, departmentId, year } = options
    let whereClause = 'WHERE 1=1'
    const params = []

    if (userId) {
      if (parseInt(userId) !== currentUser.id) {
        if (currentUser.role === 'employee') {
          throw new ForbiddenError('Недостаточно прав для просмотра заявок')
        }
        const hasAccess = await query(
          'SELECT 1 FROM users WHERE id = $1 AND manager_id = $2',
          [userId, currentUser.id]
        )
        if (hasAccess.rows.length === 0 && currentUser.role !== 'hr' && currentUser.role !== 'admin') {
          throw new ForbiddenError('Недостаточно прав для просмотра заявок')
        }
      }
      whereClause += ' AND vr.user_id = $' + (params.length + 1)
      params.push(userId)
    } else if (departmentId) {
      if (currentUser.role === 'employee') {
        whereClause += ' AND u.department_id = $' + (params.length + 1) + ' AND rs.code = $' + (params.length + 2)
        params.push(departmentId, 'approved')
      } else {
        whereClause += ' AND u.department_id = $' + (params.length + 1)
        params.push(departmentId)
      }
    } else {
      if (currentUser.role === 'employee') {
        whereClause += ' AND vr.user_id = $' + (params.length + 1)
        params.push(currentUser.id)
      } else if (currentUser.role === 'manager') {
        whereClause += ' AND (vr.user_id = $' + (params.length + 1) + ' OR u.manager_id = $' + (params.length + 1) + ')'
        params.push(currentUser.id)
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
    return result.rows.map(request => ({
      ...request,
      status_code: request.status,
      vacation_type_code: request.vacation_type,
      statusHistory: request.status_history,
    }))
  }

  async getVacationBalance(userId, currentUser) {
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      throw new ForbiddenError('Недостаточно прав для просмотра баланса')
    }

    const result = await query(
      'SELECT * FROM vacation_balances WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      throw new NotFoundError('Баланс отпусков не найден')
    }

    return result.rows[0]
  }

  async createVacationRequest(data, currentUser) {
    const { startDate, endDate, vacationType, comment, hasTravel, travelDestination, referenceDocument } = data

    if (!startDate || !endDate) {
      throw new ValidationError('Даты начала и окончания обязательны')
    }

    if (new Date(endDate) < new Date(startDate)) {
      throw new ValidationError('Дата окончания должна быть позже даты начала')
    }

    if (!vacationType || !VALID_VACATION_TYPES.includes(vacationType)) {
      throw new ValidationError('Некорректный тип отпуска')
    }

    const client = await getClient()
    try {
      await client.query('BEGIN')

      const typeIdResult = await client.query(
        'SELECT id FROM vacation_types WHERE code = $1',
        [vacationType]
      )
      if (typeIdResult.rows.length === 0) {
        throw new ValidationError('Тип отпуска не найден')
      }
      const vacationTypeId = typeIdResult.rows[0].id

      const statusIdResult = await client.query(
        'SELECT id FROM request_statuses WHERE code = $1',
        ['on_approval']
      )
      if (statusIdResult.rows.length === 0) {
        throw new Error('Статус "on_approval" не найден')
      }
      const statusId = statusIdResult.rows[0].id

      const duration = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1

      const insertResult = await client.query(
        `INSERT INTO vacation_requests 
         (user_id, vacation_type_id, status_id, start_date, end_date, duration, comment, has_travel, travel_destination, reference_document)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [currentUser.id, vacationTypeId, statusId, startDate, endDate, duration, comment || null, hasTravel || false, travelDestination || null, referenceDocument || null]
      )

      const requestId = insertResult.rows[0].id

      await client.query(
        `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, comment)
         VALUES ($1, $2, $3, $4)`,
        [requestId, statusId, currentUser.id, 'Заявка создана']
      )

      await client.query('COMMIT')

      const userResult = await query(
        'SELECT first_name, last_name, middle_name FROM users WHERE id = $1',
        [currentUser.id]
      )
      const user = userResult.rows[0]

      const managerResult = await query(
        'SELECT id FROM users WHERE id = (SELECT manager_id FROM users WHERE id = $1)',
        [currentUser.id]
      )

      if (managerResult.rows.length > 0) {
        await createNotification(
          managerResult.rows[0].id,
          'Новая заявка на отпуск',
          `${user.last_name} ${user.first_name} создал(а) заявку на отпуск с ${startDate} по ${endDate}`,
          'vacation_request'
        )

        try {
          await TelegramService.sendVacationNotification(
            managerResult.rows[0].id,
            `${user.last_name} ${user.first_name} создал(а) заявку на отпуск с ${startDate} по ${endDate}`
          )
        } catch (e) {
          console.error('Telegram notification error:', e)
        }
      }

      return { id: requestId, message: 'Заявка на отпуск создана' }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async approveVacationRequest(requestId, currentUser) {
    return this.updateRequestStatus(requestId, 'approved', currentUser, 'Заявка одобрена')
  }

  async rejectVacationRequest(requestId, currentUser, reason) {
    return this.updateRequestStatus(requestId, 'rejected', currentUser, reason || 'Заявка отклонена')
  }

  async cancelVacationRequest(requestId, currentUser) {
    const requestCheck = await query(
      `SELECT vr.*, rs.code as status_code, u.first_name, u.last_name
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       JOIN users u ON vr.user_id = u.id
       WHERE vr.id = $1`,
      [requestId]
    )

    if (requestCheck.rows.length === 0) {
      throw new NotFoundError('Заявка не найдена')
    }

    const request = requestCheck.rows[0]

    if (request.user_id !== currentUser.id) {
      throw new ForbiddenError('Можно отменять только свои заявки')
    }

    if (request.status_code !== 'on_approval') {
      throw new ValidationError('Можно отменять только заявки на согласовании')
    }

    return this.updateRequestStatus(requestId, 'cancelled_by_employee', currentUser, 'Отменено сотрудником')
  }

  async updateRequestStatus(requestId, newStatusCode, currentUser, comment) {
    const client = await getClient()
    try {
      await client.query('BEGIN')

      const requestCheck = await client.query(
        `SELECT vr.*, rs.code as status_code, u.first_name, u.last_name, u.middle_name
         FROM vacation_requests vr
         JOIN request_statuses rs ON vr.status_id = rs.id
         JOIN users u ON vr.user_id = u.id
         WHERE vr.id = $1`,
        [requestId]
      )

      if (requestCheck.rows.length === 0) {
        throw new NotFoundError('Заявка не найдена')
      }

      const request = requestCheck.rows[0]

      const statusResult = await client.query(
        'SELECT id FROM request_statuses WHERE code = $1',
        [newStatusCode]
      )
      if (statusResult.rows.length === 0) {
        throw new Error(`Статус "${newStatusCode}" не найден`)
      }
      const newStatusId = statusResult.rows[0].id

      await client.query(
        'UPDATE vacation_requests SET status_id = $1 WHERE id = $2',
        [newStatusId, requestId]
      )

      await client.query(
        `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, comment)
         VALUES ($1, $2, $3, $4)`,
        [requestId, newStatusId, currentUser.id, comment]
      )

      if (newStatusCode === 'approved') {
        await client.query(
          `UPDATE vacation_balances 
           SET used_days = used_days + $1, available_days = available_days - $1
           WHERE user_id = $2`,
          [request.duration, request.user_id]
        )
      }

      await client.query('COMMIT')

      const notificationUser = request.user_id !== currentUser.id ? request.user_id : null
      if (notificationUser) {
        const statusMessage = newStatusCode === 'approved' ? 'одобрена' : 
                             newStatusCode === 'rejected' ? 'отклонена' : 'отменена'
        await createNotification(
          notificationUser,
          'Статус заявки изменен',
          `Ваша заявка на отпуск ${statusMessage}`,
          'vacation_request'
        )
      }

      return { success: true, message: 'Статус обновлен' }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async getVacationRestrictions(departmentId) {
    const result = await query(
      `SELECT vr.*, u.first_name || ' ' || u.last_name as created_by_name
       FROM vacation_restrictions vr
       JOIN users u ON vr.created_by = u.id
       WHERE vr.department_id = $1
       ORDER BY vr.created_at DESC`,
      [departmentId]
    )
    return result.rows
  }

  async createVacationRestriction(data, currentUser) {
    const { departmentId, type, employeeIds, maxConcurrent, description } = data

    if (!type || !['pair', 'group'].includes(type)) {
      throw new ValidationError('Некорректный тип ограничения')
    }

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length < 2) {
      throw new ValidationError('Необходимо выбрать минимум 2 сотрудников')
    }

    const result = await query(
      `INSERT INTO vacation_restrictions 
       (department_id, type, employee_ids, max_concurrent, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [departmentId, type, JSON.stringify(employeeIds), maxConcurrent || null, description || null, currentUser.id]
    )

    return result.rows[0]
  }

  async deleteVacationRestriction(restrictionId) {
    const result = await query(
      'DELETE FROM vacation_restrictions WHERE id = $1 RETURNING id',
      [restrictionId]
    )
    if (result.rows.length === 0) {
      throw new NotFoundError('Ограничение не найдено')
    }
    return { success: true }
  }

  async getVacationCalendar(departmentId, year) {
    const result = await query(
      `SELECT 
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
       WHERE u.department_id = $1 
       AND EXTRACT(YEAR FROM vr.start_date) = $2
       AND rs.code = 'approved'
       ORDER BY vr.start_date`,
      [departmentId, year]
    )
    return result.rows
  }
}

export const vacationService = new VacationService()
export default vacationService
