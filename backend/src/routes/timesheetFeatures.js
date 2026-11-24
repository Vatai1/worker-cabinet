import express from 'express'
import multer from 'multer'
import { inTransaction, query } from '../config/database.js'
import AppError, { asyncHandler, ForbiddenError, ValidationError } from '../middleware/errors.js'
import { requirePermission } from '../lib/permissions.js'
import { currentOrgId } from '../lib/orgQuery.js'
import { testScopeAware } from '../utils/testScope.js'
import { auditTimesheet } from '../lib/timesheetAccess.js'
import { parseTimesheetImport, resolveTimesheetImportEmployees } from '../lib/timesheetImport.js'
import { getTimesheetData, timesheetDates } from '../lib/timesheetData.js'
import { saveTimesheetEmployeeSettings } from '../lib/timesheetEmployeeSettings.js'
import { MINUTE_CODES } from '../lib/timesheetCodes.js'
import { toLocalDateStr } from '../lib/dateUtils.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 } })
const uploadFile = (req, res, next) => upload.single('file')(req, res, error => {
  if (!error) return next()
  if (error.code === 'LIMIT_FILE_SIZE') return next(new AppError('Файл больше 5 МБ', 413, 'FILE_TOO_LARGE'))
  next(new ValidationError('Ожидается один XLSX-файл. Отдел можно указать отдельно'))
})

export function timesheetFeatures({ loadTimesheet, saveMarks }) {
  const router = express.Router()

  async function department(req, db) {
    const id = Number(req.params.departmentId ?? req.body.department_id)
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new ValidationError('Укажите отдел')
    const { rows } = await db.query('SELECT id, organization_id FROM departments WHERE id = $1 AND organization_id = $2 AND ($3 OR NOT is_test) FOR UPDATE', [id, currentOrgId(req), testScopeAware(req)])
    if (!rows.length) throw new ForbiddenError('Нет доступа к отделу')
    return rows[0]
  }

  /**
   * @swagger
   * /timesheet/employees/settings:
   *   get:
   *     tags: [Timesheet]
   *     summary: Сотрудники учреждения, табельные номера и режим учёта (HR)
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: 'Массив { id, name, position, department_id, department_name, staff_number, hourly }, включая сотрудников без отдела' }
   *       400: { description: Не выбрано учреждение }
   *       403: { description: Нет права управления табелями }
   *   put:
   *     tags: [Timesheet]
   *     summary: Атомарно сохранить табельные номера и режимы учёта сотрудников (HR)
   *     description: Проверяет уникальность номеров и принадлежность учреждению. При любой ошибке отменяется вся операция. Неуказанные поля сохраняют прежние значения.
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: array
   *             minItems: 1
   *             maxItems: 1000
   *             items:
   *               type: object
   *               required: [employee_id]
   *               properties:
   *                 employee_id: { type: integer }
   *                 staff_number: { type: string, nullable: true, maxLength: 64 }
   *                 hourly: { type: boolean }
   *     responses:
   *       200: { description: '{ updated: [{ employee_id, staff_number, hourly }] }' }
   *       400: { description: Некорректные изменения или не выбрано учреждение }
   *       403: { description: Нет права управления или сотрудник не принадлежит учреждению }
   *       409: { description: Табельный номер уже занят }
   */
  router.get('/employees/settings', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
    const orgId = currentOrgId(req)
    if (!orgId) throw new ValidationError('Выберите учреждение')
    const { rows } = await query(
      `SELECT u.id, CONCAT_WS(' ', u.last_name, u.first_name, u.middle_name) AS name, u.position,
        d.id AS department_id, d.name AS department_name, settings.staff_number, COALESCE(settings.hourly, false) AS hourly
       FROM user_organizations uo JOIN users u ON u.id = uo.user_id
       LEFT JOIN departments d ON d.id = COALESCE(uo.department_id, u.department_id) AND d.organization_id = uo.org_id
       LEFT JOIN timesheet_employee_settings settings ON settings.user_id = u.id AND settings.organization_id = uo.org_id
       WHERE uo.org_id = $1 AND uo.is_active AND u.status <> 'inactive' AND ($2 OR NOT u.is_test)
       ORDER BY u.last_name, u.first_name, u.middle_name, u.id`, [orgId, testScopeAware(req)])
    res.json(rows)
  }))
  router.put('/employees/settings', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
    const updated = await inTransaction(db => saveTimesheetEmployeeSettings(db, req, req.body))
    res.json({ updated })
  }))

  /**
   * @swagger
   * /timesheet/departments/{departmentId}/managers:
   *   get:
   *     tags: [Timesheet]
   *     summary: Руководители табеля и кандидаты активного учреждения (HR)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: departmentId, required: true, schema: { type: integer } }
   *     responses:
   *       200: { description: '{ managers: [{id, name, primary}], candidates: [{id, name}] }' }
   *       403: { description: Нет доступа }
   *   put:
   *     tags: [Timesheet]
   *     summary: Назначить дополнительных постоянных руководителей табеля (HR)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: departmentId, required: true, schema: { type: integer } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [user_ids]
   *             properties:
   *               user_ids: { type: array, items: { type: integer }, maxItems: 100 }
   *     responses:
   *       200: { description: Назначения сохранены, основной начальник сохраняет доступ }
   *       400: { description: Некорректные работники }
   *       403: { description: Нет доступа }
   */
  router.get('/departments/:departmentId/managers', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
    const result = await inTransaction(async db => {
      const dept = await department(req, db)
      const { rows } = await db.query(
        `SELECT u.id, CONCAT_WS(' ', u.last_name, u.first_name, u.middle_name) AS name,
          d.manager_id = u.id AS primary, tm.user_id IS NOT NULL AS assigned
         FROM user_organizations uo JOIN users u ON u.id = uo.user_id
         JOIN departments d ON d.id = $1
         LEFT JOIN timesheet_managers tm ON tm.department_id = d.id AND tm.user_id = u.id
         WHERE uo.org_id = $2 AND uo.is_active AND u.status <> 'inactive' AND ($3 OR NOT u.is_test)
         ORDER BY u.last_name, u.first_name`, [dept.id, dept.organization_id, testScopeAware(req)])
      return { managers: rows.filter(u => u.primary || u.assigned), candidates: rows }
    })
    res.json(result)
  }))
  router.put('/departments/:departmentId/managers', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
    const ids = req.body?.user_ids
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !Number.isInteger(id) || id <= 0 || id > 2147483647) || new Set(ids).size !== ids.length) throw new ValidationError('Укажите неповторяющийся список работников')
    await inTransaction(async db => {
      const dept = await department(req, db)
      const { rows } = await db.query(
        `SELECT u.id, CONCAT_WS(' ',u.last_name,u.first_name,u.middle_name) AS name FROM users u JOIN user_organizations uo ON uo.user_id = u.id
         WHERE u.id = ANY($1) AND uo.org_id = $2 AND uo.is_active AND u.status <> 'inactive' AND ($3 OR NOT u.is_test)`,
        [ids, dept.organization_id, testScopeAware(req)])
      if (rows.length !== ids.length) throw new ValidationError('Работники должны быть действующими участниками учреждения')
      const before = (await db.query("SELECT CONCAT_WS(' ', u.last_name, u.first_name, u.middle_name) AS name FROM timesheet_managers tm JOIN users u ON u.id = tm.user_id WHERE tm.department_id = $1 ORDER BY u.id", [dept.id])).rows.map(r => r.name)
      await db.query('DELETE FROM timesheet_managers WHERE department_id = $1', [dept.id])
      await db.query('INSERT INTO timesheet_managers (department_id, user_id, assigned_by) SELECT $1, unnest($2::int[]), $3', [dept.id, ids, req.user.id])
      await auditTimesheet(db, { department_id: dept.id }, req.user.id, 'Руководители', { before, after: rows.map(r => r.name) })
    })
    res.json({ success: true })
  }))

  /**
   * @swagger
   * /timesheet/{id}/employees/{employeeId}/settings:
   *   put:
   *     tags: [Timesheet]
   *     summary: Табельный номер и почасовой режим работника в учреждении (HR)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: integer } }
   *       - { in: path, name: employeeId, required: true, schema: { type: integer } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [hourly]
   *             properties:
   *               staff_number: { type: string, nullable: true, maxLength: 64 }
   *               hourly: { type: boolean }
   *     responses:
   *       200: { description: Настройки сохранены }
   *       400: { description: Некорректные настройки }
   *       403: { description: Нет доступа }
   *       409: { description: Табельный номер уже занят }
   */
  router.put('/:id/employees/:employeeId/settings', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
    const { staff_number, hourly } = req.body ?? {}
    if (typeof hourly !== 'boolean') throw new ValidationError('Укажите режим учёта')
    await inTransaction(async db => {
      const sheet = await loadTimesheet(req, db, { lock: true })
      await saveTimesheetEmployeeSettings(db, req, [{ employee_id: Number(req.params.employeeId), staff_number: staff_number ?? null, hourly }], sheet)
    })
    res.json({ success: true })
  }))

  /**
   * @swagger
   * /timesheet/{id}/audit:
   *   get:
   *     tags: [Timesheet]
   *     summary: Журнал табеля и назначений руководителей его отдела
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: integer } }
   *       - { in: query, name: before, schema: { type: integer }, description: Курсор id для предыдущих событий }
   *     responses:
   *       200: { description: 'До 100 событий [{id, actor, action, data, created_at}], новые первыми' }
   *       400: { description: Некорректный курсор }
   *       403: { description: Нет доступа }
   */
  router.get('/:id/audit', asyncHandler(async (req, res) => {
    const before = req.query.before ?? '9223372036854775807'
    if (typeof before !== 'string' || !/^\d{1,19}$/.test(before) || BigInt(before) > 9223372036854775807n) throw new ValidationError('Некорректный курсор журнала')
    const sheet = await loadTimesheet(req, { query })
    const visibleEmployees = (await getTimesheetData(sheet, testScopeAware(req))).employees.map(e => e.id)
    const { rows } = await query(`SELECT a.*, CONCAT_WS(' ', u.last_name, u.first_name, u.middle_name) AS actor,
      CONCAT_WS(' ', e.last_name, e.first_name, e.middle_name) AS employee
      FROM timesheet_audit a LEFT JOIN users u ON u.id = a.actor_id
      LEFT JOIN users e ON e.id = (a.data->>'employee_id')::int
      WHERE a.department_id = $1 AND (a.timesheet_id = $2 OR a.timesheet_id IS NULL) AND a.id < $3::bigint
      AND (a.timesheet_id IS NULL OR a.data->>'employee_id' IS NULL OR (a.data->>'employee_id')::int = ANY($4::int[]))
      ORDER BY a.id DESC LIMIT 100`, [sheet.department_id, sheet.id, before, visibleEmployees])
    res.json(rows)
  }))

  /**
   * @swagger
   * /timesheet/{id}/versions:
   *   post:
   *     tags: [Timesheet]
   *     summary: Создать версию, сохранив предыдущую (HR)
   *     description: Копирует отметки и состав отправленных дней. Скопированные дни возвращаются на доработку.
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: integer } }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               number: { type: string, maxLength: 64 }
   *               document_date: { type: string, format: date }
   *               kind: { type: string, enum: [original, correction], default: correction }
   *               period: { type: string, enum: [half, month] }
   *     responses:
   *       201: { description: Новая версия табеля }
   *       400: { description: Некорректный номер }
   *       403: { description: Нет доступа }
   */
  router.post('/:id/versions', requirePermission('timesheet:manage'), asyncHandler(async (req, res) => {
    if (req.body?.number != null && (typeof req.body.number !== 'string' || req.body.number.length > 64)) throw new ValidationError('Номер должен быть строкой до 64 символов')
    const documentDate = req.body?.document_date || toLocalDateStr(new Date())
    const parsedDate = typeof documentDate === 'string' ? new Date(documentDate) : null
    if (!parsedDate || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== documentDate || documentDate < '2000-01-01' || documentDate > '2100-12-31') throw new ValidationError('Некорректная дата документа')
    if (req.body?.kind != null && !['original', 'correction'].includes(req.body.kind)) throw new ValidationError('Некорректный тип табеля')
    if (req.body?.period != null && !['half', 'month'].includes(req.body.period)) throw new ValidationError('Некорректный период табеля')
    const result = await inTransaction(async db => {
      const sheet = await loadTimesheet(req, db, { lock: true })
      await db.query('SELECT id FROM departments WHERE id = $1 FOR UPDATE', [sheet.department_id])
      const { rows: [created] } = await db.query(`INSERT INTO timesheets (department_id, organization_id, year, month, version, number, document_date, kind, period, created_by)
        SELECT $1,$2,$3,$4,MAX(version) + 1,$5,$8,$9,$6,$7 FROM timesheets
        WHERE department_id = $1 AND year = $3 AND month = $4 RETURNING *`, [sheet.department_id, sheet.organization_id, sheet.year, sheet.month, req.body?.number?.trim() || null, req.body?.period ?? sheet.period, req.user.id, documentDate, req.body?.kind ?? 'correction'])
      const sourceIds = (await getTimesheetData(sheet, testScopeAware(req), db)).employees.map(e => e.id)
      await db.query("SELECT set_config('app.timesheet_actor', $1, true)", [String(req.user.id)])
      await db.query(`INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code, minutes, organization_id, is_automatic)
        SELECT $1,employee_id,date,code,minutes,organization_id,is_automatic FROM timesheet_entries WHERE timesheet_id = $2 AND date = ANY($3::date[]) AND employee_id = ANY($4::int[])`, [created.id, sheet.id, timesheetDates(created), sourceIds])
      await db.query(`INSERT INTO timesheet_days (timesheet_id, date, status, employee_ids, reason)
        SELECT $1,date,'returned',employee_ids,'Новая версия табеля' FROM timesheet_days WHERE timesheet_id = $2 AND date = ANY($3::date[])`, [created.id, sheet.id, timesheetDates(created)])
      await db.query(`INSERT INTO timesheet_days (timesheet_id, date, status, employee_ids, reason)
        SELECT $1,date,'returned',array_agg(employee_id ORDER BY employee_id),'Новая версия табеля'
        FROM timesheet_entries WHERE timesheet_id = $1 GROUP BY date
        ON CONFLICT (timesheet_id, date) DO NOTHING`, [created.id])
      await auditTimesheet(db, created, req.user.id, 'Новая версия', { previous_id: sheet.id, version: created.version })
      return created
    })
    res.status(201).json(result)
  }))

  /**
   * @swagger
   * /timesheet/import:
   *   post:
   *     tags: [Timesheet]
   *     summary: Импорт XLSX формы 0504421 в новые версии табеля (HR)
   *     description: Работники сопоставляются по табельному номеру в выбранном учреждении. Если номер ещё не задан, он берётся из файла при однозначном совпадении ФИО. Для полных тёзок дополнительно проверяется должность. Если отдел не указан, для каждого отдела из файла создаётся отдельная версия. Заполненные дни отправляются на проверку с отметками из файла, в том числе пустыми ячейками отдельных работников. Будущие отметки не допускаются. Любая ошибка отменяет назначение номеров и импорт во все отделы.
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [file]
   *             properties:
   *               file: { type: string, format: binary }
   *               department_id: { type: integer }
   *     responses:
   *       201: { description: 'Первая импортированная версия, массив версий в поле sheets и число присвоенных номеров в assigned_staff_numbers' }
   *       400: { description: Ошибка формы или работники не найдены или без отдела }
   *       403: { description: Нет доступа }
   *       409: { description: Конфликт табельного номера или несколько работников с таким ФИО }
   *       413: { description: Файл больше 5 МБ }
   */
  router.post('/import', requirePermission('timesheet:manage'), uploadFile, asyncHandler(async (req, res) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith('.xlsx')) throw new ValidationError('Выберите XLSX формы 0504421, не более 5 МБ')
    const orgId = currentOrgId(req)
    if (!orgId) throw new ValidationError('Выберите учреждение')
    const imported = await parseTimesheetImport(req.file.buffer)
    const { sheets, assignedCount } = await inTransaction(async db => {
      await db.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [orgId])
      const dept = req.body.department_id === undefined ? null : await department(req, db)
      const includeTest = testScopeAware(req)
      const { matches, assignments } = await resolveTimesheetImportEmployees(db, imported.employees, {
        orgId, departmentId: dept?.id ?? null, includeTest,
      })
      const today = toLocalDateStr(new Date())
      const groups = new Map()
      const filledDays = new Set()
      for (const employee of imported.employees) {
        const known = matches.get(employee.staffNumber)
        if (!groups.has(known.department_id)) groups.set(known.department_id, { ids: [], marks: new Map() })
        const group = groups.get(known.department_id)
        group.ids.push(known.id)
        for (const entry of employee.entries) {
          if (entry.date > today) {
            if (entry.code) throw new ValidationError(`В файле заполнена будущая дата ${entry.date}`)
            continue
          }
          if (known.hourly && MINUTE_CODES.includes(entry.code) && !entry.minutes) throw new ValidationError(`Заполните часы ${employee.staffNumber} за ${entry.date}`)
          if (!group.marks.has(entry.date)) group.marks.set(entry.date, new Map())
          group.marks.get(entry.date).set(known.id, entry)
          if (entry.code) filledDays.add(entry.date)
        }
      }
      if (!filledDays.size) throw new ValidationError('В файле нет заполненных отметок')
      const { rows: departments } = await db.query(
        'SELECT id FROM departments WHERE organization_id = $1 AND id = ANY($2::int[]) AND ($3 OR NOT is_test) ORDER BY id FOR UPDATE',
        [orgId, [...groups.keys()], includeTest]
      )
      if (departments.length !== groups.size) throw new ValidationError('Состав отделов изменился. Повторите импорт')
      for (let offset = 0; offset < assignments.length; offset += 1000) {
        await saveTimesheetEmployeeSettings(db, req, assignments.slice(offset, offset + 1000))
      }
      const createdSheets = []
      for (const { id } of departments) {
        const { ids, marks } = groups.get(id)
        const { rows: [created] } = await db.query(`INSERT INTO timesheets (department_id, organization_id, year, month, version, number, document_date, kind, period, created_by)
          SELECT $1,$2,$3,$4,COALESCE(MAX(version),0)+1,$5,$6,$7,$8,$9 FROM timesheets
          WHERE department_id = $1 AND year = $3 AND month = $4 RETURNING *`,
          [id, orgId, imported.year, imported.month, imported.number, imported.document_date, imported.kind, imported.period, req.user.id])
        for (const date of filledDays) {
          await saveMarks(db, created, date, marks.get(date), true, req.user.id)
          await db.query(`INSERT INTO timesheet_days (timesheet_id, date, status, employee_ids, submitted_by) VALUES ($1,$2,'submitted',$3,$4)`, [created.id, date, ids, req.user.id])
        }
        await auditTimesheet(db, created, req.user.id, 'Импорт', { filename: req.file.originalname, number: imported.number, employees: ids.length })
        createdSheets.push(created)
      }
      return { sheets: createdSheets, assignedCount: assignments.length }
    })
    res.status(201).json({ ...sheets[0], sheets, assigned_staff_numbers: assignedCount })
  }))

  return router
}
