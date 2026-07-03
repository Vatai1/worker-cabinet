import express from 'express'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { toLocalDateStr } from '../lib/dateUtils.js'
import { getTimesheetExportData } from '../lib/timesheetExport.js'

const router = express.Router()

const VACATION_TYPE_TO_CODE = {
  annual_paid: 'ОТ',
  additional: 'ОТ',
  veteran: 'ОТ',
  unpaid: 'ОС',
  educational: 'ДО',
}

router.use(authenticateToken)
router.use(authorizeRoles('manager', 'hr', 'admin'))

router.post('/auto-create', authorizeRoles('admin', 'hr'), async (req, res) => {
  const { year, month } = req.body
  const now = new Date()
  const y = year || now.getFullYear()
  const m = month || (now.getMonth() + 1)

  try {
    const depts = await query('SELECT id FROM departments')
    const existing = await query(
      'SELECT department_id FROM timesheets WHERE year = $1 AND month = $2',
      [y, m]
    )
    const existingSet = new Set(existing.rows.map(r => r.department_id))
    const toCreate = depts.rows.filter(d => !existingSet.has(d.id))

    if (toCreate.length === 0) {
      return res.json({ created: 0, message: 'Все табели уже существуют' })
    }

    let created = 0
    const client = await getClient()
    try {
      await client.query('BEGIN')
      for (const dept of toCreate) {
        await client.query(
          'INSERT INTO timesheets (department_id, year, month, created_by) VALUES ($1, $2, $3, $4)',
          [dept.id, y, m, req.user.id]
        )
        created++
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    res.status(201).json({
      created,
      total: depts.rows.length,
      alreadyExisted: existingSet.size,
      message: `Создано ${created} табел${created === 1 ? 'ь' : created < 5 ? 'я' : 'ей'} за ${String(m).padStart(2, '0')}.${y}`
    })
  } catch (error) {
    console.error('Error auto-creating timesheets:', error)
    res.status(500).json({ error: 'Ошибка при создании табелей' })
  }
})

async function getManagerDepartmentId(userId) {
  const byManagerId = await query(
    `SELECT id FROM departments WHERE manager_id = $1 LIMIT 1`,
    [userId]
  )
  if (byManagerId.rows.length > 0) return byManagerId.rows[0].id

  const byDeptId = await query(
    `SELECT department_id FROM users WHERE id = $1 AND role = 'manager' AND department_id IS NOT NULL LIMIT 1`,
    [userId]
  )
  if (byDeptId.rows.length > 0) return byDeptId.rows[0].department_id

  return null
}

async function canAccessDepartment(user, departmentId) {
  if (['hr', 'admin'].includes(user.role)) return true
  const managedDeptId = await getManagerDepartmentId(user.id)
  return managedDeptId !== null && managedDeptId === departmentId
}

async function canAccessTimesheet(user, timesheetId) {
  const result = await query(`SELECT department_id FROM timesheets WHERE id = $1`, [timesheetId])
  if (result.rows.length === 0) return false
  return canAccessDepartment(user, result.rows[0].department_id)
}

/**
 * @swagger
 * /timesheet:
 *   get:
 *     tags: [Timesheet]
 *     summary: Получить список табелей
 *     description: 'Доступно для ролей: manager, hr, admin. Менеджер видит только свой отдел.'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список табелей
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Timesheet' }
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 500))
    const offset = (page - 1) * limit

    let rows
    if (['hr', 'admin'].includes(req.user.role)) {
      const result = await query(`
        SELECT t.*, d.name as department_name
        FROM timesheets t
        JOIN departments d ON t.department_id = d.id
        ORDER BY t.year DESC, t.month DESC, d.name
        LIMIT $1 OFFSET $2
      `, [limit, offset])
      rows = result.rows
    } else {
      const deptId = await getManagerDepartmentId(req.user.id)
      if (!deptId) {
        rows = []
      } else {
        const result = await query(`
          SELECT t.*, d.name as department_name
          FROM timesheets t
          JOIN departments d ON t.department_id = d.id
          WHERE t.department_id = $1
          ORDER BY t.year DESC, t.month DESC
          LIMIT $2 OFFSET $3
        `, [deptId, limit, offset])
        rows = result.rows
      }
    }
    res.json(rows)
  } catch (error) {
    console.error('Error fetching timesheets:', error)
    res.status(500).json({ error: 'Ошибка при получении табелей' })
  }
})

/**
 * @swagger
 * /timesheet:
 *   post:
 *     tags: [Timesheet]
 *     summary: Создать табель
 *     description: 'Доступно для ролей: manager, hr, admin'
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [year, month]
 *             properties:
 *               department_id: { type: integer, description: 'Автоматически для менеджера' }
 *               year: { type: integer }
 *               month: { type: integer }
 *     responses:
 *       201:
 *         description: Табель создан
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Timesheet' }
 */
router.post('/', async (req, res) => {
  let { department_id, year, month } = req.body

  if (!department_id && req.user.role === 'manager') {
    const deptId = await getManagerDepartmentId(req.user.id)
    if (!deptId) {
      return res.status(400).json({ error: 'Вы не являетесь руководителем ни одного отдела' })
    }
    department_id = deptId
  }

  if (!department_id || !year || !month) {
    return res.status(400).json({ error: 'Необходимо указать department_id, year, month' })
  }

  const yearNum = parseInt(year, 10)
  const monthNum = parseInt(month, 10)
  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100 || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return res.status(400).json({ error: 'Некорректный год или месяц' })
  }

  if (!(await canAccessDepartment(req.user, department_id))) {
    return res.status(403).json({ error: 'Нет доступа к данному отделу' })
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')

    const tsResult = await client.query(
      `INSERT INTO timesheets (department_id, year, month, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [department_id, yearNum, monthNum, req.user.id]
    )
    const timesheet = tsResult.rows[0]

    await client.query('COMMIT')
    res.status(201).json(timesheet)
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Табель за этот месяц уже существует' })
    }
    console.error('Error creating timesheet:', error)
    res.status(500).json({ error: 'Ошибка при создании табеля' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /timesheet/{id}:
 *   get:
 *     tags: [Timesheet]
 *     summary: Получить табель с записями и сотрудниками
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Табель с записями
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Timesheet'
 *                 - type: object
 *                   properties:
 *                     entries: { type: array, items: { $ref: '#/components/schemas/TimesheetEntry' } }
 *                     employees: { type: array, items: { $ref: '#/components/schemas/User' } }
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!(await canAccessTimesheet(req.user, id))) {
      return res.status(403).json({ error: 'Нет доступа к этому табелю' })
    }

    const tsResult = await query(
      `SELECT t.*, d.name as department_name
       FROM timesheets t JOIN departments d ON t.department_id = d.id
       WHERE t.id = $1`,
      [id]
    )
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })

    const entriesResult = await query(
      `SELECT te.*, u.first_name, u.last_name
       FROM timesheet_entries te
       JOIN users u ON te.employee_id = u.id
       WHERE te.timesheet_id = $1
       ORDER BY u.last_name, u.first_name, te.date`,
      [id]
    )

    const empResult = await query(
      `SELECT id, first_name, last_name FROM users
       WHERE department_id = $1 AND role IN ('employee', 'manager')
       ORDER BY last_name, first_name`,
      [tsResult.rows[0].department_id]
    )

    const ts = tsResult.rows[0]
    const mm = String(ts.month).padStart(2, '0')
    const daysInTs = new Date(ts.year, ts.month, 0).getDate()
    const rangeStart = `${ts.year}-${mm}-01`
    const rangeEnd = `${ts.year}-${mm}-${String(daysInTs).padStart(2, '0')}`

    const vacations = await query(
      `SELECT vr.user_id, vr.start_date, vr.end_date, vt.code as type_code
       FROM vacation_requests vr
       JOIN vacation_types vt ON vr.vacation_type_id = vt.id
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE rs.code = 'approved'
         AND vr.start_date <= $1
         AND vr.end_date >= $2
         AND vr.user_id = ANY($3)`,
      [rangeEnd, rangeStart, empResult.rows.map(e => e.id)]
    )

    if (vacations.rows.length > 0) {
      const empMap = Object.fromEntries(empResult.rows.map(e => [e.id, e]))
      const entrySet = new Set(entriesResult.rows.map(e => `${e.employee_id}:${e.date}`))
      const vacationEntries = []

      for (const v of vacations.rows) {
        const tsCode = VACATION_TYPE_TO_CODE[v.type_code]
        if (!tsCode || !empMap[v.user_id]) continue

        const start = new Date(Math.max(new Date(v.start_date).getTime(), new Date(rangeStart).getTime()))
        const end = new Date(Math.min(new Date(v.end_date).getTime(), new Date(rangeEnd).getTime()))

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dow = d.getDay()
          if (dow === 0 || dow === 6) continue
          const dateStr = toLocalDateStr(d)
          const key = `${v.user_id}:${dateStr}`
          if (!entrySet.has(key)) {
            vacationEntries.push([id, v.user_id, dateStr, tsCode, true])
            entrySet.add(key)
          }
        }
      }

      if (vacationEntries.length > 0) {
        const client = await getClient()
        try {
          await client.query('BEGIN')
          const placeholders = vacationEntries.map((_, i) => {
            const b = i * 5
            return `($${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5})`
          }).join(', ')
          await client.query(
            `INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code, is_submitted)
             VALUES ${placeholders}
             ON CONFLICT (timesheet_id, employee_id, date) DO NOTHING`,
            vacationEntries.flat()
          )
          await client.query('COMMIT')

          const refreshed = await query(
            `SELECT te.*, u.first_name, u.last_name
             FROM timesheet_entries te
             JOIN users u ON te.employee_id = u.id
             WHERE te.timesheet_id = $1
             ORDER BY u.last_name, u.first_name, te.date`,
            [id]
          )
          entriesResult.rows = refreshed.rows
        } catch (err) {
          await client.query('ROLLBACK')
          console.error('Error inserting vacation entries:', err)
        } finally {
          client.release()
        }
      }
    }

    res.json({ ...tsResult.rows[0], entries: entriesResult.rows, employees: empResult.rows })
  } catch (error) {
    console.error('Error fetching timesheet:', error)
    res.status(500).json({ error: 'Ошибка при получении табеля' })
  }
})

/**
 * @swagger
 * /timesheet/{id}/entries:
 *   put:
 *     tags: [Timesheet]
 *     summary: Сохранить записи табеля
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
 *             required: [entries]
 *             properties:
 *               entries:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/TimesheetEntry' }
 *     responses:
 *       200:
 *         description: Записи сохранены
 */
router.put('/:id/entries', async (req, res) => {
  const { id } = req.params
  const entries = req.body

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Ожидается непустой массив записей' })
  }

  try {
    const tsResult = await query(`SELECT * FROM timesheets WHERE id = $1`, [id])
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })
    const timesheet = tsResult.rows[0]

    if (!(await canAccessDepartment(req.user, timesheet.department_id))) {
      return res.status(403).json({ error: 'Нет доступа к этому табелю' })
    }

    const mm = String(timesheet.month).padStart(2, '0')
    const daysInTs = new Date(timesheet.year, timesheet.month, 0).getDate()
    const rangeStart = `${timesheet.year}-${mm}-01`
    const rangeEnd = `${timesheet.year}-${mm}-${String(daysInTs).padStart(2, '0')}`
    const today = toLocalDateStr(new Date())
    const vacationCodes = ['ОТ', 'ОС', 'ДО']

    const employeeIds = [...new Set(entries.map(e => e.employee_id))]
    const dates = [...new Set(entries.map(e => e.date))]
    const existingResult = await query(
      `SELECT employee_id, date, code FROM timesheet_entries
       WHERE timesheet_id = $1 AND employee_id = ANY($2) AND date = ANY($3)`,
      [id, employeeIds, dates]
    )
    const existingMap = new Map()
    for (const row of existingResult.rows) {
      existingMap.set(`${row.employee_id}_${row.date}`, row.code)
    }

    for (const e of entries) {
      if (e.date < rangeStart || e.date > rangeEnd) {
        return res.status(400).json({ error: `Дата ${e.date} не входит в диапазон табеля` })
      }
      if (e.date > today) {
        return res.status(400).json({ error: `Нельзя редактировать будущие даты (${e.date})` })
      }

      const existingCode = existingMap.get(`${e.employee_id}_${e.date}`)
      if (existingCode && vacationCodes.includes(existingCode)) {
        return res.status(403).json({ error: `Нельзя редактировать записи отпуска (${e.date})` })
      }
    }

    const normalizedEntries = entries.map(e => {
      const dow = new Date(e.date).getDay()
      return { ...e, code: (dow === 0 || dow === 6) ? 'В' : (e.code ?? null) }
    })

    const client = await getClient()
    try {
      await client.query('BEGIN')
      const placeholders = normalizedEntries.map((_, i) => {
        const base = i * 5
        return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5})`
      }).join(', ')
      await client.query(
        `INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code, is_submitted)
         VALUES ${placeholders}
         ON CONFLICT (timesheet_id, employee_id, date) DO UPDATE
           SET code = EXCLUDED.code, is_submitted = false`,
        normalizedEntries.flatMap(e => [id, e.employee_id, e.date, e.code, false])
      )
      await client.query(
        `UPDATE timesheets SET updated_by = $1, updated_at = NOW() WHERE id = $2`,
        [req.user.id, id]
      )
      await client.query('COMMIT')
      res.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Error updating entries:', error)
    res.status(500).json({ error: 'Ошибка при обновлении записей' })
  }
})

/**
 * @swagger
 * /timesheet/{id}/status:
 *   put:
 *     tags: [Timesheet]
 *     summary: Изменить статус табеля
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [draft, submitted, approved] }
 *     responses:
 *       200:
 *         description: Статус обновлён
 */
router.put('/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  const allowedStatuses = ['draft', 'submitted', 'approved']
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' })
  }

  try {
    const tsResult = await query(`SELECT * FROM timesheets WHERE id = $1`, [id])
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })
    const timesheet = tsResult.rows[0]

    if (!(await canAccessDepartment(req.user, timesheet.department_id))) {
      return res.status(403).json({ error: 'Нет доступа к этому табелю' })
    }

    const current = timesheet.status
    const isHR = ['hr', 'admin'].includes(req.user.role)

    const allowed =
      (req.user.role === 'manager' && current === 'draft' && status === 'submitted') ||
      (isHR && current === 'submitted' && status === 'approved') ||
      (isHR && current === 'approved' && status === 'submitted')

    if (!allowed) {
      return res.status(403).json({ error: `Переход ${current}→${status} недопустим для вашей роли` })
    }

    const client = await getClient()
    let result
    try {
      await client.query('BEGIN')
      result = await client.query(
        `UPDATE timesheets SET status = $1, updated_by = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [status, req.user.id, id]
      )
      if (status === 'submitted' && current === 'draft') {
        await client.query(
          `UPDATE timesheet_entries SET is_submitted = true WHERE timesheet_id = $1`,
          [id]
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating timesheet status:', error)
    res.status(500).json({ error: 'Ошибка при изменении статуса' })
  }
})

/**
 * @swagger
 * /timesheet/{id}/submit-today:
 *   post:
 *     tags: [Timesheet]
 *     summary: Отправить записи за сегодняшний день
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Записи отправлены
 */
router.post('/:id/submit-today', async (req, res) => {
  const { id } = req.params
  try {
    if (!(await canAccessTimesheet(req.user, id))) {
      return res.status(403).json({ error: 'Нет доступа к этому табелю' })
    }
    const tsResult = await query(`SELECT * FROM timesheets WHERE id = $1`, [id])
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })

    const today = toLocalDateStr(new Date())
    const result = await query(
      `UPDATE timesheet_entries SET is_submitted = true WHERE timesheet_id = $1 AND date = $2`,
      [id, today]
    )
    res.json({ success: true, updated: result.rowCount })
  } catch (error) {
    console.error('Error submitting today:', error)
    res.status(500).json({ error: 'Ошибка при отправке' })
  }
})

/**
 * @swagger
 * /timesheet/{id}/export/excel:
 *   get:
 *     tags: [Timesheet]
 *     summary: Экспортировать табель в Excel
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: XLSX файл
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/export/excel', async (req, res) => {
  const { id } = req.params
  try {
    if (!(await canAccessTimesheet(req.user, id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    const data = await getTimesheetExportData(id)
    if (!data) return res.status(404).json({ error: 'Табель не найден' })
    const { timesheet, daysInMonth, byEmployee } = data

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Табель')

    const header = ['Сотрудник']
    for (let d = 1; d <= daysInMonth; d++) header.push(String(d))
    sheet.addRow(header)
    sheet.getRow(1).font = { bold: true }

    for (const emp of Object.values(byEmployee)) {
      const row = [emp.name]
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        row.push(emp.days[date] ?? '')
      }
      sheet.addRow(row)
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${timesheet.year}-${timesheet.month}.xlsx"`)
    await workbook.xlsx.write(res)
  } catch (error) {
    console.error('Error exporting Excel:', error)
    res.status(500).json({ error: 'Ошибка при экспорте Excel' })
  }
})

/**
 * @swagger
 * /timesheet/{id}/export/pdf:
 *   get:
 *     tags: [Timesheet]
 *     summary: Экспортировать табель в PDF
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: PDF файл
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/export/pdf', async (req, res) => {
  const { id } = req.params
  try {
    if (!(await canAccessTimesheet(req.user, id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    const data = await getTimesheetExportData(id)
    if (!data) return res.status(404).json({ error: 'Табель не найден' })
    const { timesheet, daysInMonth, byEmployee } = data
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${timesheet.year}-${timesheet.month}.pdf"`)

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' })
    doc.pipe(res)

    doc.fontSize(14).text(
      `Табель учёта рабочего времени — ${timesheet.department_name} — ${monthNames[timesheet.month - 1]} ${timesheet.year}`,
      { align: 'center' }
    )
    doc.moveDown(0.5)

    const colWidth = 20
    const nameWidth = 120
    const rowHeight = 16
    let y = doc.y
    const startX = 30

    doc.fontSize(7).text('Сотрудник', startX, y, { width: nameWidth, continued: false })
    for (let d = 1; d <= daysInMonth; d++) {
      doc.text(String(d), startX + nameWidth + (d - 1) * colWidth, y, { width: colWidth, align: 'center' })
    }
    y += rowHeight

    for (const emp of Object.values(byEmployee)) {
      doc.text(emp.name, startX, y, { width: nameWidth })
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const cx = startX + nameWidth + (d - 1) * colWidth
        doc.text(emp.days[date] ?? '', cx, y, { width: colWidth, align: 'center' })
      }
      y += rowHeight
      if (y > 500) { doc.addPage(); y = 30 }
    }

    doc.end()
  } catch (error) {
    console.error('Error exporting PDF:', error)
    res.status(500).json({ error: 'Ошибка при экспорте PDF' })
  }
})

export default router
