import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import ExcelJS from 'exceljs'
import { query } from '../config/database.js'
import { toLocalDateStr } from '../lib/dateUtils.js'
import { runDailyTimesheetJob } from '../cron/timesheetCron.js'
import { BASE } from './helpers.js'

const stamp = Date.now()
const now = new Date()
const today = toLocalDateStr(now)
const yesterday = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
const ids = { users: [], departments: [] }

const call = async (method, path, user, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: user ? { Authorization: `Bearer ${user.token}`, 'x-organization-id': user.orgId, 'Content-Type': 'application/json' } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, data: await response.json() }
}

const addDepartment = async (name, orgId) => {
  const { rows: [department] } = await query(
    'INSERT INTO departments (name, organization_id) VALUES ($1, $2) RETURNING id',
    [`${name} ${stamp}`, orgId]
  )
  ids.departments.push(department.id)
  return department.id
}

const addUser = async (name, role, departmentId, orgId) => {
  const { rows: [user] } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date)
     VALUES ($1, '', 'Тест', $2, 'Тест', $3, $4, '2020-01-01') RETURNING id`,
    [`${ids.users.length}-${stamp}@timesheet.invalid`, name, role, departmentId]
  )
  ids.users.push(user.id)
  await query('INSERT INTO user_organizations (user_id, org_id, org_role, department_id) VALUES ($1,$2,$3,$4)', [user.id, orgId, role, departmentId])
  return { ...user, orgId, token: jwt.sign({ id: user.id }, process.env.JWT_SECRET) }
}

async function setVacation(userId, status) {
  const { rows } = await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, duration, vacation_type_id, status_id, organization_id)
     SELECT $1, $2, $2, 1, vt.id, rs.id, 1
     FROM vacation_types vt CROSS JOIN request_statuses rs
     WHERE vt.code = 'annual_paid' AND vt.organization_id = 1 AND rs.code = $3
     RETURNING id`,
    [userId, today, status]
  )
  assert.equal(rows.length, 1)
  return rows[0].id
}

describe('Дневной табель', () => {
  let manager, worker, otherWorker, hr, foreign, foreignManager, foreignDepartment, department, orgId, calendar, calendarTouched, sheet, vacation
  const entry = (user, code = 'Я', date = today) => ({ employee_id: user.id, date, code })

  before(async () => {
    department = await addDepartment('Отдел табеля', 1)
    manager = await addUser('Начальник', 'manager', department, 1)
    worker = await addUser('Отпускник', 'employee', department, 1)
    otherWorker = await addUser('Работник', 'employee', department, 1)
    hr = await addUser('Кадры', 'hr', null, 1)
    const { rows } = await query('INSERT INTO organizations (name, slug) VALUES ($1,$2) RETURNING id', [`Учреждение ${stamp}`, `timesheet-${stamp}`])
    orgId = rows[0].id
    foreignDepartment = await addDepartment('Чужой отдел', orgId)
    foreign = await addUser('ЧужойРаботник', 'employee', foreignDepartment, orgId)
    foreignManager = await addUser('ЧужойНачальник', 'manager', foreignDepartment, orgId)
    await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [manager.id, department])
    await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [foreignManager.id, foreignDepartment])
    calendar = (await query('SELECT * FROM calendar_holidays WHERE day = $1', [today])).rows[0]
    await query(
      `INSERT INTO calendar_holidays (day, year, kind, description)
       VALUES ($1,$2,'shortened','Тест табеля') ON CONFLICT (day) DO UPDATE SET kind = EXCLUDED.kind`,
      [today, now.getFullYear()]
    )
    calendarTouched = true
    const created = await call('POST', '/timesheet', manager, { year: now.getFullYear(), month: now.getMonth() + 1 })
    assert.equal(created.status, 201, JSON.stringify(created))
    sheet = created.data
  })

  after(async () => {
    await query('DELETE FROM notification_queue WHERE user_id = ANY($1)', [ids.users])
    await query('DELETE FROM vacation_requests WHERE user_id = ANY($1)', [ids.users])
    await query('DELETE FROM timesheets WHERE department_id = ANY($1)', [ids.departments])
    await query('UPDATE departments SET manager_id = NULL WHERE id = ANY($1)', [ids.departments])
    await query('DELETE FROM users WHERE id = ANY($1)', [ids.users])
    await query('DELETE FROM departments WHERE id = ANY($1)', [ids.departments])
    if (orgId) await query('DELETE FROM organizations WHERE id = $1', [orgId])
    if (calendar) await query('UPDATE calendar_holidays SET kind = $1 WHERE day = $2', [calendar.kind, today])
    else if (calendarTouched) await query('DELETE FROM calendar_holidays WHERE day = $1', [today])
  })

  it('ограничивает доступ и проверяет принадлежность работников и код отметки', async () => {
    const path = `/timesheet/${sheet.id}`
    assert.equal((await call('GET', '/timesheet')).status, 401)
    assert.equal((await call('GET', '/timesheet', worker)).status, 403)
    assert.equal((await call('GET', path, foreignManager)).status, 404)
    assert.equal((await call('PUT', path + '/entries', manager, [entry(foreign)])).status, 403)
    assert.equal((await call('PUT', path + '/entries', manager, [entry(worker, 'ЛЮБОЙ')])).status, 400)
    assert.equal((await call('PUT', path + '/entries', manager, [entry(worker, 'Я', '2020-01-01')])).status, 400)
    assert.equal((await call('PUT', path + '/entries', hr, [entry(worker)])).status, 403)
    assert.equal((await call('POST', '/timesheet', hr, {
      department_id: foreignDepartment, year: sheet.year, month: sheet.month,
    })).status, 403)
  })

  it('показывает согласованный отпуск поверх явки и отклоняет неполную отправку без записи правок', async () => {
    const path = `/timesheet/${sheet.id}`
    vacation = await setVacation(worker.id, 'on_approval')
    const submitted = await call('POST', path + '/submit-today', manager)
    assert.equal(submitted.status, 400)
    assert.equal((await call('PUT', path + '/entries', manager, [entry(worker)])).status, 200)
    const draft = await call('GET', path, manager)
    assert.equal(draft.data.entries.find(e => e.employee_id === worker.id && e.date === today).code, 'Я')
    await query("UPDATE vacation_requests SET status_id = (SELECT id FROM request_statuses WHERE code = 'approved') WHERE id = $1", [vacation])
    const onLeave = await call('GET', path, manager)
    assert.equal(onLeave.data.entries.find(e => e.employee_id === worker.id && e.date === today).code, 'ОТ')
    const incomplete = await call('POST', path + `/days/${today}/submit`, manager, { entries: [entry(manager)] })
    assert.equal(incomplete.status, 400)
    const persisted = await query('SELECT 1 FROM timesheet_entries WHERE timesheet_id = $1 AND employee_id = $2 AND date = $3', [sheet.id, manager.id, today])
    assert.equal(persisted.rowCount, 0)
  })

  it('отправляет все отметки, блокирует правки, возвращает с уведомлением, принимает исправление', async () => {
    const path = `/timesheet/${sheet.id}`
    const daily = path + `/days/${today}`
    const submission = { entries: [entry(manager), entry(otherWorker)] }
    const replies = await Promise.all([
      call('POST', daily + '/submit', manager, submission),
      call('POST', daily + '/submit', manager, submission),
    ])
    assert.deepEqual(replies.map(res => res.status).sort(), [200, 409])
    const accepted = replies.find(res => res.status === 200)
    assert.equal(accepted.data.updated, 3)
    assert.equal((await call('PUT', path + '/entries', manager, [entry(manager, 'Б')])).status, 409)
    const pending = await call('GET', '/timesheet/days/submitted', hr)
    assert.ok(pending.data.some(d => d.timesheet_id === sheet.id && d.date === today))
    assert.equal((await call('PUT', daily + '/review', manager, { status: 'approved', revision: 1 })).status, 403)
    await query("UPDATE vacation_requests SET status_id = (SELECT id FROM request_statuses WHERE code = 'rejected') WHERE id = $1", [vacation])
    const locked = await call('GET', path, hr)
    assert.equal(locked.data.entries.find(e => e.employee_id === worker.id && e.date === today).code, 'ОТ')
    assert.equal((await call('PUT', daily + '/review', hr, { status: 'returned', revision: 1 })).status, 400)
    const returned = await call('PUT', daily + '/review', hr, { status: 'returned', revision: 1, reason: 'Уточните явку' })
    assert.equal(returned.status, 200)
    assert.equal((await call('PUT', daily + '/review', hr, { status: 'returned', revision: 1, reason: 'Дубль' })).status, 409)
    const notifications = await query("SELECT data FROM notification_queue WHERE user_id = $1 AND type = 'timesheet_returned'", [manager.id])
    assert.equal(notifications.rowCount, 1)
    assert.equal(notifications.rows[0].data.departmentId, department)
    assert.equal(notifications.rows[0].data.date, today)
    assert.match(notifications.rows[0].data.message, /Уточните явку/)
    const corrected = await call('POST', daily + '/submit', manager, { entries: [entry(manager, 'Б'), entry(worker)] })
    assert.equal(corrected.status, 200, JSON.stringify(corrected))
    assert.equal(corrected.data.revision, 2)
    assert.equal((await call('PUT', daily + '/review', hr, { status: 'approved', revision: 1 })).status, 409)
    assert.equal((await call('PUT', daily + '/review', hr, { status: 'approved', revision: 2 })).status, 200)
    assert.equal((await call('PUT', path + '/entries', manager, [entry(manager)])).status, 409)
    const approved = await call('GET', path, hr)
    assert.equal(approved.data.days.find(d => d.date === today).status, 'approved')
    assert.equal(approved.data.entries.find(e => e.employee_id === manager.id && e.date === today).code, 'Б')
  })

  it('позволяет переотправить возвращённый день, когда дата уже прошла', async () => {
    const [year, month] = yesterday.split('-').map(Number)
    let previous = sheet
    if (month !== sheet.month || year !== sheet.year) {
      const created = await call('POST', '/timesheet', manager, { year, month })
      assert.equal(created.status, 201)
      previous = created.data
    }
    await query(
      "INSERT INTO timesheet_days (timesheet_id, date, status, reason, employee_ids) VALUES ($1,$2,'returned','Проверка даты',$3)",
      [previous.id, yesterday, [manager.id, worker.id, otherWorker.id]]
    )
    const path = `/timesheet/${previous.id}/days/${yesterday}`
    const marks = [manager, worker, otherWorker].map(user => entry(user, 'Я', yesterday))
    const detail = await call('GET', `/timesheet/${previous.id}`, manager)
    const result = await call('POST', path + '/submit', manager, { entries: detail.data.nonWorkingDays.includes(yesterday) ? [] : marks })
    assert.equal(result.status, 200, JSON.stringify(result))
    assert.equal((await call('PUT', path + '/review', hr, { status: 'approved', revision: result.data.revision })).status, 200)
  })

  it('не раскрывает старые чужие отметки в табеле и Excel', async () => {
    await query(
      "INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code, organization_id) VALUES ($1,$2,$3,'Я',1)",
      [sheet.id, foreign.id, today]
    )
    const detail = await call('GET', `/timesheet/${sheet.id}`, hr)
    assert.ok(!detail.data.entries.some(e => e.employee_id === foreign.id))
    const response = await fetch(`${BASE}/timesheet/${sheet.id}/export/excel`, {
      headers: { Authorization: `Bearer ${hr.token}`, 'x-organization-id': '1' },
    })
    assert.equal(response.status, 200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()))
    const worksheet = workbook.getWorksheet('Табель')
    assert.equal(worksheet.getCell('A1').value, 'Табель посещаемости')
    assert.match(worksheet.getCell('A2').value, /Отдел табеля/)
    assert.equal(worksheet.views[0].state, 'frozen')
    assert.equal(worksheet.views[0].xSplit, 1)
    assert.equal(worksheet.views[0].ySplit, 5)
    const names = worksheet.getColumn(1).values
    const managerRow = names.findIndex(name => String(name).includes('Начальник'))
    assert.equal(worksheet.getCell(managerRow, Number(today.slice(-2)) + 1).value, 'Б')
    assert.ok(names.some(name => String(name).includes('Начальник')))
    assert.ok(names.every(name => !String(name).includes('ЧужойРаботник')))
  })

  it('встраивает шрифт с Unicode в PDF табеля', async () => {
    const response = await fetch(`${BASE}/timesheet/${sheet.id}/export/pdf`, {
      headers: { Authorization: `Bearer ${hr.token}`, 'x-organization-id': '1' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/pdf')
    const pdf = Buffer.from(await response.arrayBuffer()).toString('latin1')
    assert.ok(pdf.startsWith('%PDF-'))
    assert.match(pdf, /\/FontName \/[A-Z]+\+LiberationSans/)
    assert.match(pdf, /\/ToUnicode \d+ 0 R/)
  })

  it('фоновое создание сохраняет организацию отдела', async () => {
    const date = new Date(2088, 0, 1)
    try {
      await runDailyTimesheetJob(date)
      const own = await call('GET', '/timesheet?year=2088&month=1', foreignManager)
      assert.ok(own.data.some(t => t.department_id === foreignDepartment))
      const visible = await call('GET', '/timesheet?year=2088&month=1', hr)
      assert.ok(visible.data.every(t => t.department_id !== foreignDepartment))
    } finally {
      await query('DELETE FROM timesheets WHERE year = 2088 AND month = 1 AND created_by IS NULL AND created_at >= to_timestamp($1 / 1000.0)', [stamp])
    }
  })
})
