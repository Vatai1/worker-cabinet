import express from 'express'
import { timesheetDepartments, auditTimesheet } from '../lib/timesheetAccess.js'
import { timesheetFeatures } from './timesheetFeatures.js'
import { query, inTransaction } from '../config/database.js'
import { notify } from '../config/notifications.js'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../middleware/errors.js'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'
import { excludeTest, testScopeAware } from '../utils/testScope.js'
import { toLocalDateStr } from '../lib/dateUtils.js'
import { automaticTimesheetCode, getTimesheetData, getTimesheetEmployees, getTimesheetMarks, timesheetDates } from '../lib/timesheetData.js'
import { createTimesheetWorkbook, getTimesheetExportData, writeTimesheetPdf } from '../lib/timesheetExport.js'
import { requirePermission, hasPermission } from '../lib/permissions.js'
import { MANUAL_CODES, MINUTE_CODES } from '../lib/timesheetCodes.js'
import { VACATION_TIMESHEET_CODES } from '../lib/vacationTypes.js'

const router = express.Router()

router.use(authenticateToken, requirePermission('timesheet:view'), asyncHandler(async (req, res, next) => {
  req.canManageTimesheets = await hasPermission(req, 'timesheet:manage')
  next()
}))

function period(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new ValidationError('Некорректный год или месяц')
  }
  return [y, m]
}

async function getManagerDepartments(req, db = { query }) {
  const orgId = currentOrgId(req)
  let rows = await timesheetDepartments(req.user.id, orgId, db)
  if (!testScopeAware(req)) {
    const allowed = await db.query('SELECT id FROM departments WHERE id = ANY($1) AND NOT is_test', [rows.map(d => d.id)])
    rows = rows.filter(d => allowed.rows.some(item => item.id === d.id))
  }
  if (rows.length > 0 || req.canManageTimesheets) return rows

  const fallback = await db.query(
    `SELECT d.id, d.name FROM users u
     JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = $2 AND uo.is_active
     JOIN departments d ON d.id = COALESCE(uo.department_id, u.department_id) AND d.organization_id = uo.org_id
     WHERE u.id = $1 AND (u.role = 'manager' OR uo.org_role = 'manager') ${excludeTest(req, 'd')}`,
    [req.user.id, orgId]
  )
  return fallback.rows
}

async function loadTimesheet(req, db, { lock = false, forDepartmentHead = false } = {}) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new NotFoundError('Табель не найден')
  const { rows } = await db.query(
    `SELECT t.*, d.name AS department_name, d.manager_id
     FROM timesheets t JOIN departments d ON d.id = t.department_id AND d.organization_id = t.organization_id
     WHERE t.id = $1 AND ($2::int IS NULL OR t.organization_id = $2) ${excludeTest(req, 'd')}
     ${lock ? 'FOR UPDATE OF t' : ''}`,
    [id, currentOrgId(req)]
  )
  const sheet = rows[0]
  if (!sheet) throw new NotFoundError('Табель не найден')
  if (forDepartmentHead && req.canManageTimesheets && (!currentOrgId(req) || !(await getManagerDepartments(req, db)).some(d => d.id === sheet.department_id))) {
    throw new ForbiddenError('Табель ведёт начальник этого подразделения')
  }
  if (!req.canManageTimesheets && !(await getManagerDepartments(req, db)).some(d => d.id === sheet.department_id)) {
    throw new ForbiddenError('Нет доступа к этому табелю')
  }
  return sheet
}

async function loadDay(db, sheet, date) {
  const { rows } = await db.query('SELECT * FROM timesheet_days WHERE timesheet_id = $1 AND date = $2', [sheet.id, date])
  return rows[0]
}

async function getRoster(db, sheet, day, req) {
  if (day?.employee_ids.length) {
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.middle_name, COALESCE(s.hourly, false) AS hourly
       FROM users u LEFT JOIN timesheet_employee_settings s ON s.user_id = u.id AND s.organization_id = $3
       WHERE u.id = ANY($1) AND ($2 OR NOT u.is_test)`,
      [day.employee_ids, testScopeAware(req), sheet.organization_id]
    )
    return rows
  }
  return getTimesheetEmployees(db, sheet, testScopeAware(req))
}

function groupEntries(entries, allowedDates) {
  if (!Array.isArray(entries)) throw new ValidationError('Ожидается массив отметок')
  const byDate = new Map()
  for (const entry of entries) {
    if (!allowedDates.includes(entry?.date)) throw new ValidationError('Дата отметки не входит в выбранный период')
    if (!Number.isInteger(entry.employee_id) || entry.employee_id <= 0 || entry.employee_id > 2147483647) {
      throw new ValidationError('Некорректный работник в отметке')
    }
    if (entry.code !== null && !MANUAL_CODES.includes(entry.code)) throw new ValidationError('Недопустимый код посещаемости')
    if (!byDate.has(entry.date)) byDate.set(entry.date, new Map())
    const marks = byDate.get(entry.date)
    if (marks.has(entry.employee_id)) throw new ValidationError('Отметка работника за эту дату указана дважды')
    if (entry.minutes != null && (!Number.isInteger(entry.minutes) || entry.minutes < 0 || entry.minutes > 1440 || !MINUTE_CODES.includes(entry.code))) {
      throw new ValidationError('Время должно быть целым числом минут от 0 до 1440 и указываться только для отметки с учётом времени')
    }
    marks.set(entry.employee_id, { code: entry.code, minutes: entry.minutes ?? null })
  }
  return byDate
}

function checkEdits(edits, roster, date, calendar) {
  const ids = new Set(roster.map(e => e.id))
  for (const [id, mark] of edits) {
    if (!ids.has(id)) throw new ForbiddenError('Работник не входит в состав отдела для этой даты')
    if (calendar.vacations.has(`${id}:${date}`)) throw new ConflictError('Отметка согласованного отпуска устанавливается автоматически')
    if (calendar.nonWorkingDays.includes(date) && mark.code !== 'РП' && mark.code !== null) {
      throw new ValidationError('В нерабочий день можно указать только работу в выходной или праздничный день (РП)')
    }
  }
}

async function saveMarks(db, sheet, date, marks, submitted, actorId) {
  await db.query("SELECT set_config('app.timesheet_actor', $1, true)", [String(actorId)])
  await db.query(
    `INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code, minutes, is_submitted, organization_id, is_automatic)
     SELECT $1, employee_id, $2, code, minutes, $3, $4, is_automatic
     FROM unnest($5::int[], $6::text[], $7::int[], $8::boolean[]) AS marks(employee_id, code, minutes, is_automatic)
     ON CONFLICT (timesheet_id, employee_id, date) DO UPDATE
     SET code = EXCLUDED.code, minutes = EXCLUDED.minutes, is_submitted = EXCLUDED.is_submitted, organization_id = EXCLUDED.organization_id, is_automatic = EXCLUDED.is_automatic`,
    [sheet.id, date, submitted, sheet.organization_id, [...marks.keys()], [...marks.values()].map(m => m.code), [...marks.values()].map(m => m.minutes), [...marks.values()].map(m => m.is_automatic ?? false)]
  )
}

function ensureWritable(sheet, day) {
  if (sheet.status !== 'draft' || (day && day.status !== 'returned')) {
    throw new ConflictError('Табель за эту дату уже отправлен и закрыт для редактирования')
  }
}

/**
 * @swagger
 * /timesheet/auto-create:
 *   post:
 *     tags: [Timesheet]
 *     summary: Создать месячные табели для отделов организации
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               year: { type: integer }
 *               month: { type: integer }
 *     responses:
 *       200: { description: Все табели уже существуют }
 *       201: { description: Табели созданы }
 *       400: { description: Некорректный год или месяц }
 *       403: { description: Нет доступа }
 */
router.post('/auto-create', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
  const now = new Date()
  const [year, month] = period(req.body?.year ?? now.getFullYear(), req.body?.month ?? now.getMonth() + 1)
  const { rows } = await query(...orgScopedQuery(`SELECT id, organization_id FROM departments WHERE 1=1 ${excludeTest(req, 'departments')}`, [], req))
  const { rowCount: created } = await query(
    `INSERT INTO timesheets (department_id, year, month, created_by, organization_id, document_date)
     SELECT id, $2, $3, $4, organization_id, $5 FROM departments WHERE id = ANY($1)
     ON CONFLICT (department_id, year, month, version) DO NOTHING`,
    [rows.map(d => d.id), year, month, req.user.id, toLocalDateStr(now)]
  )
  res.status(created ? 201 : 200).json({
    created,
    total: rows.length,
    alreadyExisted: rows.length - created,
    message: created ? `Создано табелей: ${created}` : 'Все табели уже существуют',
  })
}))

/**
 * @swagger
 * /timesheet/my-departments:
 *   get:
 *     tags: [Timesheet]
 *     summary: Отделы текущего руководителя в активной организации
 *     description: Включает назначенные отделы пользователя с правом согласования табелей.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: '[{ id, name }]' }
 */
router.get('/my-departments', asyncHandler(async (req, res) => {
  res.json(await getManagerDepartments(req))
}))

/**
 * @swagger
 * /timesheet:
 *   get:
 *     tags: [Timesheet]
 *     summary: Получить список месячных табелей
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: year, schema: { type: integer } }
 *       - { in: query, name: month, schema: { type: integer } }
 *       - { in: query, name: departmentId, schema: { type: integer } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 500 } }
 *     responses:
 *       200:
 *         description: Список табелей
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Timesheet' }
 *       400: { description: Некорректный фильтр }
 */
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 500))
  const scopedDepartments = req.canManageTimesheets ? null : (await getManagerDepartments(req)).map(d => d.id)
  const filters = [req.query.year, req.query.month, req.query.departmentId].map(value => value === undefined ? null : Number(value))
  if (filters.some(value => value !== null && (!Number.isInteger(value) || value < 1 || value > 2147483647))) {
    throw new ValidationError('Некорректный фильтр табелей')
  }
  const { rows } = await query(
    `SELECT t.*, d.name AS department_name FROM timesheets t
     JOIN departments d ON d.id = t.department_id AND d.organization_id = t.organization_id
     WHERE ($1::int IS NULL OR t.organization_id = $1) AND ($2::int[] IS NULL OR t.department_id = ANY($2))
       AND ($3::int IS NULL OR t.year = $3) AND ($4::int IS NULL OR t.month = $4)
       AND ($5::int IS NULL OR t.department_id = $5) ${excludeTest(req, 'd')}
     ORDER BY t.year DESC, t.month DESC, d.name, t.version DESC LIMIT $6 OFFSET $7`,
    [currentOrgId(req), scopedDepartments, ...filters, limit, (page - 1) * limit]
  )
  res.json(rows)
}))

/**
 * @swagger
 * /timesheet:
 *   post:
 *     tags: [Timesheet]
 *     summary: Создать месячный табель
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [year, month]
 *             properties:
 *               department_id: { type: integer }
 *               year: { type: integer }
 *               month: { type: integer }
 *     responses:
 *       201: { description: Табель создан }
 *       400: { description: Не указан отдел или период }
 *       403: { description: Нет доступа к отделу }
 *       409: { description: Табель за этот месяц уже существует }
 */
router.post('/', asyncHandler(async (req, res) => {
  const [year, month] = period(req.body?.year, req.body?.month)
  const isHR = req.canManageTimesheets
  const departments = isHR ? [] : await getManagerDepartments(req)
  const departmentId = Number(req.body?.department_id ?? (departments.length === 1 ? departments[0].id : undefined))
  if (!Number.isInteger(departmentId) || departmentId < 1 || departmentId > 2147483647) {
    throw new ValidationError(departments.length > 1 ? 'Вы руководите несколькими отделами. Укажите отдел' : 'Укажите отдел')
  }
  if (!isHR && !departments.some(d => d.id === departmentId)) throw new ForbiddenError('Нет доступа к этому отделу')
  const { rows: owners } = await query(
    `SELECT organization_id FROM departments d
     WHERE d.id = $1 AND ($2::int IS NULL OR d.organization_id = $2) ${excludeTest(req, 'd')}`,
    [departmentId, currentOrgId(req)]
  )
  if (!owners.length) throw new ForbiddenError('Нет доступа к этому отделу')
  const { rows } = await query(
    `INSERT INTO timesheets (department_id, year, month, created_by, organization_id, document_date)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (department_id, year, month, version) DO NOTHING RETURNING *`,
    [departmentId, year, month, req.user.id, owners[0].organization_id, toLocalDateStr(new Date())]
  )
  if (!rows.length) throw new ConflictError('Табель за этот месяц уже существует')
  res.status(201).json(rows[0])
}))

/**
 * @swagger
 * /timesheet/days/submitted:
 *   get:
 *     tags: [Timesheet]
 *     summary: Получить дневные табели на проверке по отделам
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Список отправленных дат с идентификатором табеля и отделом }
 *       403: { description: Нет права согласования табелей }
 */
router.get('/days/submitted', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT td.date, td.revision, t.id AS timesheet_id, t.department_id, t.year, t.month, t.version, t.number, t.period, d.name AS department_name
     FROM timesheet_days td JOIN timesheets t ON t.id = td.timesheet_id
     JOIN departments d ON d.id = t.department_id AND d.organization_id = t.organization_id
     WHERE td.status = 'submitted' AND ($1::int IS NULL OR t.organization_id = $1) ${excludeTest(req, 'd')}
     ORDER BY td.date DESC, d.name, t.id`,
    [currentOrgId(req)]
  )
  res.json(rows)
}))

/**
 * @swagger
 * /timesheet/report:
 *   get:
 *     tags: [Timesheet]
 *     summary: Получить отметки работников активного учреждения за день
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: date, required: true, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Работники и их отметки. Пустая отметка означает отсутствие данных.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   department: { type: string, nullable: true }
 *                   code: { type: string, nullable: true }
 *       400: { description: Некорректная дата или не выбрано учреждение }
 *       403: { description: Нет права согласования табелей }
 */
router.get('/report', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
  const orgId = currentOrgId(req)
  if (!orgId) throw new ValidationError('Выберите учреждение')
  const { date } = req.query
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date) : null
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < '2000-01-01' || date > '2100-12-31') {
    throw new ValidationError('Некорректная дата отчёта')
  }

  const rows = await inTransaction(async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const result = await db.query(
      `SELECT u.id, CONCAT_WS(' ', u.last_name, u.first_name, u.middle_name) AS name, d.name AS department,
              te.code, te.is_automatic, t.status = 'draft' AND (td.status IS NULL OR td.status = 'returned')
                AND (COALESCE(cardinality(td.employee_ids), 0) = 0 OR u.id = ANY(td.employee_ids)) AS open_day
       FROM user_organizations uo JOIN users u ON u.id = uo.user_id
       LEFT JOIN departments d ON d.id = COALESCE(uo.department_id, u.department_id) AND d.organization_id = uo.org_id ${excludeTest(req, 'd')}
       LEFT JOIN LATERAL (SELECT ts.* FROM timesheets ts WHERE ts.department_id = d.id AND ts.organization_id = uo.org_id
         AND ts.year = EXTRACT(YEAR FROM $2::date) AND ts.month = EXTRACT(MONTH FROM $2::date)
         AND (ts.period = 'month' OR EXTRACT(DAY FROM $2::date) <= 15) ORDER BY ts.version DESC LIMIT 1) t ON true
       LEFT JOIN timesheet_days td ON td.timesheet_id = t.id AND td.date = $2
       LEFT JOIN timesheet_entries te ON te.timesheet_id = t.id AND te.organization_id = uo.org_id AND te.date = $2
         AND te.employee_id = u.id AND (COALESCE(cardinality(td.employee_ids), 0) = 0 OR u.id = ANY(td.employee_ids))
       WHERE uo.org_id = $1 AND uo.is_active AND u.status <> 'inactive' ${excludeTest(req, 'u')}
       ORDER BY u.last_name, u.first_name, u.middle_name, u.id`,
      [orgId, date]
    )
    const openIds = result.rows.filter(row => row.open_day).map(row => row.id)
    const marks = openIds.length ? await getTimesheetMarks(db, { organization_id: orgId }, [date], openIds) : null
    return result.rows.map(({ id, name, department, code, is_automatic, open_day }) => ({
      id, name, department,
      code: open_day && marks
        ? automaticTimesheetCode(marks, id, date, code) ?? (is_automatic || VACATION_TIMESHEET_CODES.includes(code) ? null : code)
        : code,
    }))
  })
  res.json(rows)
}))

/**
 * @swagger
 * /timesheet/{id}:
 *   get:
 *     tags: [Timesheet]
 *     summary: Получить месячный табель, отметки и состояния дней
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Табель с работниками, отметками, состояниями дней и календарём
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Timesheet'
 *                 - type: object
 *                   properties:
 *                     today: { type: string, format: date }
 *                     currentEmployeeIds: { type: array, items: { type: integer } }
 *                     nonWorkingDays: { type: array, items: { type: string, format: date } }
 *                     entries: { type: array, items: { $ref: '#/components/schemas/TimesheetEntry' } }
 *                     employees: { type: array, items: { $ref: '#/components/schemas/User' } }
 *                     days: { type: array, items: { $ref: '#/components/schemas/TimesheetDay' } }
 *                     transfers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           employee_id: { type: integer }
 *                           start_date: { type: string, format: date }
 *                           end_date: { type: string, format: date }
 *                           label: { type: string }
 *       403: { description: Нет доступа к табелю }
 *       404: { description: Табель не найден }
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const result = await inTransaction(async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const sheet = await loadTimesheet(req, db)
    return { ...sheet, ...await getTimesheetData(sheet, testScopeAware(req), db), today: toLocalDateStr(new Date()) }
  })
  res.json(result)
}))

/**
 * @swagger
 * /timesheet/{id}/entries:
 *   put:
 *     tags: [Timesheet]
 *     summary: Сохранить отметки посещаемости в открытых днях своего отдела
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             minItems: 1
 *             items: { $ref: '#/components/schemas/TimesheetEntry' }
 *     responses:
 *       200: { description: Отметки сохранены }
 *       400: { description: Некорректные отметки или дата }
 *       403: { description: Нет доступа к табелю или работнику }
 *       404: { description: Табель не найден }
 *       409: { description: День закрыт или отметку установил отпуск }
 */
router.put('/:id/entries', asyncHandler(async (req, res) => {
  await inTransaction(async db => {
    const sheet = await loadTimesheet(req, db, { lock: true, forDepartmentHead: true })
    const groups = groupEntries(req.body, timesheetDates(sheet))
    if (!groups.size) throw new ValidationError('Нет отметок для сохранения')
    const today = toLocalDateStr(new Date())
    for (const [date, edits] of groups) {
      if (date > today) throw new ValidationError('Нельзя заполнять будущие даты')
      const day = await loadDay(db, sheet, date)
      ensureWritable(sheet, day)
      const roster = await getRoster(db, sheet, day, req)
      checkEdits(edits, roster, date, await getTimesheetMarks(db, sheet, [date], roster.map(e => e.id)))
      await saveMarks(db, sheet, date, edits, false, req.user.id)
    }
    await db.query('UPDATE timesheets SET updated_by = $1, updated_at = NOW() WHERE id = $2', [req.user.id, sheet.id])
  })
  res.json({ success: true })
}))

/**
 * @swagger
 * /timesheet/{id}/status:
 *   put:
 *     tags: [Timesheet]
 *     summary: Изменить состояние исторического месячного табеля без дневных отправок
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
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
 *       200: { description: Статус обновлён }
 *       400: { description: Некорректный статус }
 *       403: { description: Переход статуса недоступен }
 *       404: { description: Табель не найден }
 *       409: { description: Табель согласуется по дням }
 */
router.put('/:id/status', asyncHandler(async (req, res) => {
  const status = req.body?.status
  if (!['draft', 'submitted', 'approved'].includes(status)) throw new ValidationError('Недопустимый статус')
  const isHR = req.canManageTimesheets
  const result = await inTransaction(async db => {
    const sheet = await loadTimesheet(req, db, { lock: true })
    const current = sheet.status
    const allowed = (!isHR && current === 'draft' && status === 'submitted') ||
      (isHR && current === 'submitted' && status === 'approved') ||
      (isHR && current === 'approved' && status === 'submitted')
    if (!allowed) throw new ForbiddenError('Переход статуса недоступен для вашей роли')
    const { rowCount } = await db.query('SELECT 1 FROM timesheet_days WHERE timesheet_id = $1 LIMIT 1', [sheet.id])
    if (rowCount || (current === 'draft' && timesheetDates(sheet).at(-1) >= toLocalDateStr(new Date()))) {
      throw new ConflictError('Этот табель согласуется по дням')
    }
    const { rows } = await db.query(
      'UPDATE timesheets SET status = $1, updated_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [status, req.user.id, sheet.id]
    )
    if (current === 'draft') {
      await db.query('UPDATE timesheet_entries SET is_submitted = true WHERE timesheet_id = $1 AND organization_id = $2', [sheet.id, sheet.organization_id])
    }
    return rows[0]
  })
  res.json(result)
}))

async function submitDay(req, res) {
  const result = await inTransaction(async db => {
    const sheet = await loadTimesheet(req, db, { lock: true, forDepartmentHead: true })
    const today = toLocalDateStr(new Date())
    const date = req.params.date ?? today
    if (!timesheetDates(sheet).includes(date)) throw new ValidationError('Дата не входит в период табеля')
    const day = await loadDay(db, sheet, date)
    ensureWritable(sheet, day)
    if (date > today) throw new ValidationError('Нельзя отправлять будущие даты')
    if (date !== today && day?.status !== 'returned') throw new ValidationError('Можно отправить сегодняшний день или день, возвращённый на доработку')

    const edits = groupEntries(req.body?.entries ?? [], [date]).get(date) ?? new Map()
    const roster = await getRoster(db, sheet, day, req)
    if (!roster.length) throw new ValidationError('В отделе нет работников для отправки табеля')
    const ids = roster.map(e => e.id)
    const calendar = await getTimesheetMarks(db, sheet, [date], ids)
    checkEdits(edits, roster, date, calendar)
    const { rows } = await db.query(
      `SELECT employee_id, code, minutes, is_automatic FROM timesheet_entries
       WHERE timesheet_id = $1 AND date = $2 AND organization_id = $3 AND employee_id = ANY($4)`,
      [sheet.id, date, sheet.organization_id, ids]
    )
    const marks = new Map(rows.filter(row => !row.is_automatic && MANUAL_CODES.includes(row.code)).map(row => [row.employee_id, { code: row.code, minutes: row.minutes }]))
    for (const [id, mark] of edits) marks.set(id, mark)
    for (const id of ids) {
      const automatic = automaticTimesheetCode(calendar, id, date, marks.get(id)?.code)
      if (automatic) marks.set(id, { code: automatic, minutes: null, is_automatic: true })
    }
    const missing = roster.filter(e => !marks.get(e.id)?.code)
    if (missing.length) {
      const names = missing.slice(0, 5).map(e => [e.last_name, e.first_name, e.middle_name].filter(Boolean).join(' '))
      throw new ValidationError(`Заполните отметки за ${date}. Не заполнено: ${missing.length} (${names.join(', ')})`)
    }

    const withoutHours = roster.filter(e => e.hourly && MINUTE_CODES.includes(marks.get(e.id)?.code) && !marks.get(e.id)?.minutes)
    if (withoutHours.length) throw new ValidationError('Заполните часы явки для работников с почасовым учётом')
    await saveMarks(db, sheet, date, marks, true, req.user.id)
    await auditTimesheet(db, sheet, req.user.id, 'Отправка', { date })
    const { rows: submitted } = await db.query(
      `INSERT INTO timesheet_days (timesheet_id, date, status, employee_ids, submitted_by)
       VALUES ($1, $2, 'submitted', $3, $4)
       ON CONFLICT (timesheet_id, date) DO UPDATE
       SET status = 'submitted', revision = timesheet_days.revision + 1,
           employee_ids = EXCLUDED.employee_ids, submitted_by = EXCLUDED.submitted_by, reason = NULL
       RETURNING date, status, revision`,
      [sheet.id, date, ids, req.user.id]
    )
    await db.query('UPDATE timesheets SET updated_by = $1, updated_at = NOW() WHERE id = $2', [req.user.id, sheet.id])
    return { ...submitted[0], success: true, updated: ids.length }
  })
  res.json(result)
}

/**
 * @swagger
 * /timesheet/{id}/submit-today:
 *   post:
 *     tags: [Timesheet]
 *     summary: Отправить заполненный табель своего отдела за сегодняшний день
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: День отправлен на проверку }
 *       400: { description: Дата вне периода или табель неполный }
 *       403: { description: Нет доступа }
 *       404: { description: Табель не найден }
 *       409: { description: День уже закрыт или отметку установил отпуск }
 */
router.post('/:id/submit-today', asyncHandler(submitDay))

/**
 * @swagger
 * /timesheet/{id}/days/{date}/submit:
 *   post:
 *     tags: [Timesheet]
 *     summary: Отправить сегодняшний или возвращённый табель своего отдела вместе с правками
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: date, required: true, schema: { type: string, format: date } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entries: { type: array, items: { $ref: '#/components/schemas/TimesheetEntry' } }
 *     responses:
 *       200: { description: День отправлен на проверку }
 *       400: { description: Дата недоступна или табель неполный }
 *       403: { description: Нет доступа к табелю или работнику }
 *       404: { description: Табель не найден }
 *       409: { description: День уже закрыт или отметку установил отпуск }
 */
router.post('/:id/days/:date/submit', asyncHandler(submitDay))

/**
 * @swagger
 * /timesheet/{id}/days/{date}/review:
 *   put:
 *     tags: [Timesheet]
 *     summary: Принять день или вернуть начальнику на доработку
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: date, required: true, schema: { type: string, format: date } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status, revision]
 *             properties:
 *               status: { type: string, enum: [approved, returned] }
 *               revision: { type: integer }
 *               reason: { type: string, maxLength: 1000, description: Обязательна при возврате }
 *     responses:
 *       200: { description: Решение сохранено }
 *       400: { description: Некорректное решение или дата }
 *       403: { description: Нет права согласования или табель отправлен текущим пользователем }
 *       404: { description: Табель не найден }
 *       409: { description: Отправка уже изменилась или нет получателя для возврата }
 */
router.put('/:id/days/:date/review', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
  const { date } = req.params
  const { status, revision, reason } = req.body ?? {}
  const message = typeof reason === 'string' ? reason.trim() : ''
  if (!['approved', 'returned'].includes(status) || !Number.isInteger(revision) || revision < 1) {
    throw new ValidationError('Укажите решение и версию отправки')
  }
  if (status === 'returned' && (!message || message.length > 1000)) {
    throw new ValidationError('Укажите причину возврата до 1000 символов')
  }

  const result = await inTransaction(async db => {
    const sheet = await loadTimesheet(req, db, { lock: true })
    if (!timesheetDates(sheet).includes(date)) throw new ValidationError('Дата не входит в период табеля')
    const day = await loadDay(db, sheet, date)
    if (day?.status !== 'submitted' || day.revision !== revision) {
      throw new ConflictError('Отправка изменилась. Обновите табель перед проверкой')
    }
    if (day.submitted_by === req.user.id) throw new ForbiddenError('Табель должен проверить другой согласующий')
    const { rows } = await db.query(
      'UPDATE timesheet_days SET status = $1, reason = $2 WHERE timesheet_id = $3 AND date = $4 RETURNING date, status, revision, reason',
      [status, status === 'returned' ? message : null, sheet.id, date]
    )
    if (status === 'returned') {
      const { rows: recipients } = await db.query(
        `SELECT u.id FROM users u JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = $1 AND uo.is_active
         WHERE u.status <> 'inactive' AND (u.id = $3 OR u.id = $2
           OR EXISTS (SELECT 1 FROM timesheet_managers tm WHERE tm.department_id = $4 AND tm.user_id = u.id)
           OR ((u.role = 'manager' OR uo.org_role = 'manager') AND COALESCE(uo.department_id, u.department_id) = $4
             AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.organization_id = $1 AND d.manager_id = u.id)))
         ORDER BY (u.id = $3) DESC NULLS LAST, (u.id = $2) DESC NULLS LAST, u.id`,
        [sheet.organization_id, day.submitted_by, sheet.manager_id, sheet.department_id]
      )
      const permitted = []
      for (const recipient of recipients) {
        if ((await getManagerDepartments({ ...req, user: { id: recipient.id }, canManageTimesheets: false }, db)).some(d => d.id === sheet.department_id)) permitted.push(recipient.id)
      }
      if (!permitted.length) throw new ConflictError('Назначьте действующего начальника отдела перед возвратом табеля')
      for (const userId of permitted) await notify({
        userId,
        type: 'timesheet_returned',
        channel: 'in_app',
        data: {
          subject: 'Табель возвращён на доработку',
          message: `${sheet.department_name}, ${date}. ${message}`,
          departmentId: sheet.department_id,
          timesheetId: sheet.id,
          organizationId: sheet.organization_id,
          date,
        },
        db,
      })
    }
    await auditTimesheet(db, sheet, req.user.id, status === 'approved' ? 'Принятие' : 'Возврат', { date, revision, reason: message })
    return rows[0]
  })
  res.json(result)
}))

/**
 * @swagger
 * /timesheet/{id}/export/excel:
 *   get:
 *     tags: [Timesheet]
 *     summary: Экспортировать оформленный месячный табель в Excel
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: XLSX с цветными отметками и закреплёнными заголовками
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/export/excel', asyncHandler(async (req, res) => {
  try {
    const data = await inTransaction(async db => {
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const sheet = await loadTimesheet(req, db)
      return getTimesheetExportData(db, sheet, testScopeAware(req))
    })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${data.filename}.xlsx"`)
    await createTimesheetWorkbook(data).xlsx.write(res)
  } catch (error) {
    if (res.headersSent) return res.destroy(error)
    throw error
  }
}))

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
 *         description: PDF с кириллицей и заголовком таблицы на каждой странице
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/export/pdf', asyncHandler(async (req, res) => {
  try {
    const data = await inTransaction(async db => {
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const sheet = await loadTimesheet(req, db)
      return getTimesheetExportData(db, sheet, testScopeAware(req))
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${data.filename}.pdf"`)
    writeTimesheetPdf(res, data)
  } catch (error) {
    if (res.headersSent) return res.destroy(error)
    throw error
  }
}))

router.use(timesheetFeatures({ loadTimesheet, saveMarks }))

export default router
