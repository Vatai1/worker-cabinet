import express from 'express'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

router.use(authenticateToken)
router.use(authorizeRoles('manager', 'hr', 'admin'))

function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
    let rows
    if (['hr', 'admin'].includes(req.user.role)) {
      const result = await query(`
        SELECT t.*, d.name as department_name
        FROM timesheets t
        JOIN departments d ON t.department_id = d.id
        ORDER BY t.year DESC, t.month DESC, d.name
      `)
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
        `, [deptId])
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

    if (timesheet.status === 'submitted' && req.user.role === 'manager') {
    }

    const mm = String(timesheet.month).padStart(2, '0')
    const daysInTs = new Date(timesheet.year, timesheet.month, 0).getDate()
    const rangeStart = `${timesheet.year}-${mm}-01`
    const rangeEnd = `${timesheet.year}-${mm}-${String(daysInTs).padStart(2, '0')}`
    const today = toLocalDateStr(new Date())
    const vacationCodes = ['ОТ', 'ОС', 'ДО']

    for (const e of entries) {
      if (e.date < rangeStart || e.date > rangeEnd) {
        return res.status(400).json({ error: `Дата ${e.date} не входит в диапазон табеля` })
      }
      if (e.date > today) {
        return res.status(400).json({ error: `Нельзя редактировать будущие даты (${e.date})` })
      }

      const existingEntryResult = await query(
        `SELECT code FROM timesheet_entries WHERE timesheet_id = $1 AND employee_id = $2 AND date = $3`,
        [id, e.employee_id, e.date]
      )
      if (existingEntryResult.rows.length > 0) {
        const existingCode = existingEntryResult.rows[0].code
        if (existingCode && vacationCodes.includes(existingCode)) {
          return res.status(403).json({ error: `Нельзя редактировать записи отпуска (${e.date})` })
        }
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

    const result = await query(
      `UPDATE timesheets SET status = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, req.user.id, id]
    )

    if (status === 'submitted' && current === 'draft') {
      await query(
        `UPDATE timesheet_entries SET is_submitted = true WHERE timesheet_id = $1`,
        [id]
      )
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating timesheet status:', error)
    res.status(500).json({ error: 'Ошибка при изменении статуса' })
  }
})

router.post('/:id/submit-today', async (req, res) => {
  const { id } = req.params
  try {
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
    const tsResult = await query(
      `SELECT t.*, d.name as department_name FROM timesheets t
       JOIN departments d ON t.department_id = d.id WHERE t.id = $1`,
      [id]
    )
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })
    const timesheet = tsResult.rows[0]

    const entriesResult = await query(
      `SELECT te.employee_id, te.date, te.code,
              u.first_name, u.last_name
       FROM timesheet_entries te
       JOIN users u ON te.employee_id = u.id
       WHERE te.timesheet_id = $1
       ORDER BY u.last_name, u.first_name, te.date`,
      [id]
    )

    const daysInMonth = new Date(timesheet.year, timesheet.month, 0).getDate()

    const byEmployee = {}
    for (const e of entriesResult.rows) {
      const key = e.employee_id
      if (!byEmployee[key]) {
        byEmployee[key] = { name: `${e.last_name} ${e.first_name}`, days: {} }
      }
      byEmployee[key].days[e.date] = e.code
    }

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
    const tsResult = await query(
      `SELECT t.*, d.name as department_name FROM timesheets t
       JOIN departments d ON t.department_id = d.id WHERE t.id = $1`,
      [id]
    )
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })
    const timesheet = tsResult.rows[0]

    const entriesResult = await query(
      `SELECT te.employee_id, te.date, te.code,
              u.first_name, u.last_name
       FROM timesheet_entries te
       JOIN users u ON te.employee_id = u.id
       WHERE te.timesheet_id = $1
       ORDER BY u.last_name, u.first_name, te.date`,
      [id]
    )

    const daysInMonth = new Date(timesheet.year, timesheet.month, 0).getDate()
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

    const byEmployee = {}
    for (const e of entriesResult.rows) {
      if (!byEmployee[e.employee_id]) {
        byEmployee[e.employee_id] = { name: `${e.last_name} ${e.first_name}`, days: {} }
      }
      byEmployee[e.employee_id].days[e.date] = e.code
    }

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
