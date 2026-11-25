import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import ExcelJS from 'exceljs'
import { query } from '../config/database.js'
import { toLocalDateStr } from '../lib/dateUtils.js'
import { runTimesheetReminderJob } from '../cron/timesheetCron.js'
import { renderEmail } from '../lib/notificationEmail.js'
import { BASE } from './helpers.js'

const stamp = Date.now()
const today = toLocalDateStr(new Date())
const users = []
let dept, manager, hr, worker, delegate, outsider, sheet, calendar, settings
const call = async (method, path, user, body) => {
  const response = await fetch(`${BASE}/timesheet${path}`, { method, headers: { Authorization: `Bearer ${user.token}`, 'x-organization-id': '1', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, data: await response.json() }
}
const addUser = async (role, departmentId = dept) => {
  const { rows: [user] } = await query("INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date) VALUES ($1,'','Тест',$2,'Тест',$3,$4,'2020-01-01') RETURNING id", [`${users.length}-${stamp}@ts-features.invalid`, role, role, departmentId])
  users.push(user.id)
  await query('INSERT INTO user_organizations (user_id,org_id,org_role,department_id) VALUES ($1,1,$2,$3)', [user.id, role, departmentId])
  return { ...user, token: jwt.sign({ id: user.id }, process.env.JWT_SECRET) }
}

before(async () => {
  dept = (await query('INSERT INTO departments (name, organization_id) VALUES ($1,1) RETURNING id', [`Функции табеля ${stamp}`])).rows[0].id
  manager = await addUser('manager'); hr = await addUser('hr'); worker = await addUser('employee'); delegate = await addUser('employee'); outsider = await addUser('employee')
  await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [manager.id, dept])
  calendar = (await query('SELECT * FROM calendar_holidays WHERE day = $1', [today])).rows[0]
  await query("INSERT INTO calendar_holidays (day,year,kind,description) VALUES ($1,$2,'shortened','Тест') ON CONFLICT (day) DO UPDATE SET kind = 'shortened'", [today, Number(today.slice(0, 4))])
  settings = (await query("SELECT key,value FROM system_settings WHERE key LIKE 'timesheet_reminder_%'")).rows
  sheet = (await call('POST', '', manager, { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })).data
})
after(async () => {
  await query('DELETE FROM timesheets WHERE department_id = $1', [dept])
  await query('DELETE FROM vacation_requests WHERE user_id = ANY($1)', [users])
  await query('DELETE FROM users WHERE id = ANY($1)', [users])
  await query('DELETE FROM departments WHERE id = $1', [dept])
  for (const value of settings ?? []) await query('UPDATE system_settings SET value = $1 WHERE key = $2', [value.value, value.key])
  if (calendar) await query('UPDATE calendar_holidays SET kind = $1, description = $2 WHERE day = $3', [calendar.kind, calendar.description, today])
  else await query('DELETE FROM calendar_holidays WHERE day = $1', [today])
})

describe('Перенос функций табеля', () => {
  it('несколько руководителей: выдаёт и отзывает доступ без смены роли, не позволяет назначать чужого пользователя', async () => {
    const path = `/departments/${dept}/managers`
    assert.equal((await call('GET', `/${sheet.id}`, delegate)).status, 403)
    assert.equal((await call('PUT', path, hr, { user_ids: [delegate.id] })).status, 200)
    assert.ok((await call('GET', '/my-departments', delegate)).data.some(d => d.id === dept))
    assert.equal((await call('GET', `/${sheet.id}`, delegate)).status, 200)
    assert.equal((await call('PUT', path, delegate, { user_ids: [outsider.id] })).status, 403)
    assert.equal((await call('PUT', path, hr, { user_ids: [2147483647] })).status, 400)
    assert.equal((await call('PUT', path, hr, { user_ids: [] })).status, 200)
    assert.equal((await call('GET', `/${sheet.id}`, delegate)).status, 403)
  })

  it('замещение берётся из согласованного отпуска и заканчивается вместе с ним', async () => {
    const { rows: [vacation] } = await query(`INSERT INTO vacation_requests (user_id,start_date,end_date,duration,vacation_type_id,status_id,organization_id)
      SELECT $1,$2,$2,1,vt.id,rs.id,1 FROM vacation_types vt CROSS JOIN request_statuses rs WHERE vt.code='annual_paid' AND vt.organization_id=1 AND rs.code='approved' RETURNING id`, [manager.id, today])
    await query('INSERT INTO vacation_substitutions (vacation_request_id,substitute_user_id,assigned_by,organization_id) VALUES ($1,$2,$3,1)', [vacation.id, delegate.id, hr.id])
    assert.equal((await call('GET', `/${sheet.id}`, delegate)).status, 200)
    const future = toLocalDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1))
    await query('UPDATE vacation_requests SET start_date=$1,end_date=$1 WHERE id=$2', [future, vacation.id])
    assert.equal((await call('GET', `/${sheet.id}`, delegate)).status, 403)
    const audit = await call('GET', `/${sheet.id}/audit`, hr)
    assert.ok(audit.data.some(event => event.action === 'Назначение замещения'))
    await query('DELETE FROM vacation_requests WHERE id = $1', [vacation.id])
  })

  it('хранит минуты и неявку, требует часы при отправке, сохраняет прежнюю версию и журнал', async () => {
    assert.equal((await call('PUT', `/${sheet.id}/employees/${worker.id}/settings`, hr, { staff_number: `001-${stamp}`, hourly: true })).status, 200)
    assert.equal((await call('PUT', `/${sheet.id}/entries`, manager, [{ employee_id: worker.id, date: today, code: 'Я', minutes: -1 }])).status, 400)
    const marks = users.map(id => ({ employee_id: id, date: today, code: id === outsider.id ? 'НН' : 'Я' }))
    assert.equal((await call('POST', `/${sheet.id}/submit-today`, manager, { entries: marks })).status, 400)
    marks.find(e => e.employee_id === worker.id).minutes = 485
    const submitted = await call('POST', `/${sheet.id}/submit-today`, manager, { entries: marks })
    assert.equal(submitted.status, 200, JSON.stringify(submitted))
    assert.equal((await call('PUT', `/${sheet.id}/days/${today}/review`, hr, { status: 'approved', revision: 1 })).status, 200)
    const created = await call('POST', `/${sheet.id}/versions`, hr, { number: '24-К' })
    assert.equal(created.status, 201, JSON.stringify(created))
    assert.equal(created.data.version, 2)
    const next = await call('GET', `/${created.data.id}`, manager)
    assert.equal(next.data.entries.find(e => e.employee_id === worker.id && e.date === today).minutes, 485)
    assert.equal(next.data.days.find(d => d.date === today).status, 'returned')
    assert.equal((await call('GET', `/${sheet.id}`, hr)).data.days.find(d => d.date === today).status, 'approved')
    const audit = await call('GET', `/${sheet.id}/audit`, manager)
    assert.ok(audit.data.some(e => e.action === 'Отметка' && e.data.after.minutes === 485))
    assert.ok(audit.data.some(e => e.action === 'Руководители'))
    assert.equal((await call('GET', `/${sheet.id}/audit`, outsider)).status, 403)
    const excel = await fetch(`${BASE}/timesheet/${sheet.id}/export/excel`, { headers: { Authorization: `Bearer ${hr.token}`, 'x-organization-id': '1' } })
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await excel.arrayBuffer()))
    assert.ok(book.worksheets[0].getRows(6, users.length).some(row => row.values.includes('8:05')))
  })

  it('импорт создаёт отдельную версию только для известных номеров, без создания пользователей', async () => {
    const book = new ExcelJS.Workbook(); const tab = book.addWorksheet('0504421')
    tab.getCell('T3').value = '24'; tab.getCell('AN6').value = '16.01.2026'; tab.getCell('AN9').value = 0
    tab.getCell('O6').value = 'за период с 1 по 15 января 2026 г.'
    tab.getCell('C15').value = 'Работник'; tab.getCell('D15').value = 'unknown'
    for (const col of ['H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V']) { tab.getCell(`${col}15`).value = 7.5; tab.getCell(`${col}16`).value = 'Я' }
    const upload = async () => {
      const body = new FormData(); body.append('department_id', String(dept)); body.append('file', new Blob([await book.xlsx.writeBuffer()]), 'test.xlsx')
      const res = await fetch(`${BASE}/timesheet/import`, { method: 'POST', headers: { Authorization: `Bearer ${hr.token}`, 'x-organization-id': '1' }, body })
      return { status: res.status, data: await res.json() }
    }
    const count = Number((await query('SELECT COUNT(*) AS count FROM users')).rows[0].count)
    assert.equal((await upload()).status, 400)
    tab.getCell('D15').value = `001-${stamp}`
    const imported = await upload()
    assert.equal(imported.status, 201, JSON.stringify(imported))
    const data = (await call('GET', `/${imported.data.id}`, hr)).data
    assert.equal(data.period, 'half'); assert.equal(data.days.length, 15)
    assert.equal(data.entries.find(e => e.date === '2026-01-15').minutes, 450)
    assert.equal(Number((await query('SELECT COUNT(*) AS count FROM users')).rows[0].count), count)
    assert.equal((await call('PUT', `/${data.id}/entries`, manager, [{ employee_id: worker.id, date: '2026-01-15', code: 'НН' }])).status, 409)
  })

  it('импорт присваивает два номера одному сотруднику и сохраняет две строки вместе с отпуском', async () => {
    const { rows: [otherDept] } = await query('INSERT INTO departments (name, organization_id) VALUES ($1,1) RETURNING id', [`Импорт по отделам ${stamp}`])
    const other = await addUser('employee', otherDept.id)
    try {
      await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [manager.id, otherDept.id])
      const staffNumber = `002-${stamp}`
      const secondNumber = `003-${stamp}`
      await query(`INSERT INTO vacation_requests (user_id,start_date,end_date,duration,vacation_type_id,status_id,organization_id)
        SELECT $1,'2020-11-02','2020-11-03',2,vt.id,rs.id,1 FROM vacation_types vt CROSS JOIN request_statuses rs
        WHERE vt.code='annual_paid' AND vt.organization_id=1 AND rs.code='approved'`, [other.id])
      const book = new ExcelJS.Workbook()
      const tab = book.addWorksheet('0504421')
      tab.getCell('T3').value = `Импорт-${stamp}`
      tab.getCell('O6').value = 'за период с 1 по 15 ноября 2020 г.'
      tab.getCell('AN6').value = '15.11.2020'
      tab.getCell('AN9').value = 0
      tab.getCell('C15').value = 'Работник первого отдела'
      tab.getCell('D15').value = `001-${stamp}`
      tab.getCell('I15').value = 8
      tab.getCell('I16').value = 'Я'
      tab.getCell('C17').value = 'Работник второго отдела'
      tab.getCell('D17').value = staffNumber
      tab.getCell('J17').value = 8
      tab.getCell('J18').value = 'Я'
      tab.getCell('C19').value = 'Работник второго отдела'
      tab.getCell('D19').value = secondNumber
      tab.getCell('J20').value = 'НН'
      tab.getCell('L17').value = 6
      tab.getCell('L18').value = 'Я'
      tab.getCell('L20').value = 'НН'
      const upload = async (departmentId) => {
        const body = new FormData()
        if (departmentId) body.append('department_id', String(departmentId))
        body.append('file', new Blob([await book.xlsx.writeBuffer()]), 'test.xlsx')
        const res = await fetch(`${BASE}/timesheet/import`, { method: 'POST', headers: { Authorization: `Bearer ${hr.token}`, 'x-organization-id': '1' }, body })
        return { status: res.status, data: await res.json() }
      }
      const unknown = await upload()
      assert.equal(unknown.status, 400)
      assert.match(unknown.data.error, /Не найдены работники учреждения/)
      assert.equal((await query('SELECT id FROM timesheets WHERE number = $1', [tab.getCell('T3').value])).rowCount, 0)
      await query("UPDATE users SET last_name='Васильева', first_name='Алёна', middle_name='Сергеевна' WHERE id=$1", [other.id])
      tab.getCell('C17').value = 'васильева  алена СЕРГЕЕВНА'
      tab.getCell('C19').value = 'Васильева Алёна Сергеевна'
      assert.equal((await call('PUT', '/employees/settings', hr, [{ employee_id: other.id, hourly: true }])).status, 200)
      tab.getCell('J17').value = null
      assert.match((await upload()).data.error, /Заполните часы/)
      const settingsForOther = async () => (await call('GET', '/employees/settings', hr)).data.find(item => item.id === other.id)
      assert.equal((await settingsForOther()).staff_number, null)
      assert.deepEqual((await settingsForOther()).staff_numbers, [])
      tab.getCell('J17').value = 8
      const imported = await upload()
      assert.equal(imported.status, 201, JSON.stringify(imported))
      assert.equal(imported.data.assigned_staff_numbers, 2)
      const employeeSettings = await settingsForOther()
      assert.equal(employeeSettings.staff_number, staffNumber)
      assert.deepEqual(employeeSettings.staff_numbers, [staffNumber, secondNumber])
      assert.equal(employeeSettings.hourly, true)
      assert.deepEqual(imported.data.sheets.map(item => item.department_id), [dept, otherDept.id])
      const { data } = await call('GET', `/${imported.data.sheets[1].id}`, hr)
      assert.equal(data.days.length, 3)
      assert.ok(data.days.every(day => day.status === 'submitted' && day.employee_ids.length === 1 && day.employee_ids[0] === other.id && day.staff_rows.length === 2))
      const entries = data.entries.filter(entry => entry.staff_number === staffNumber && ['2020-11-02', '2020-11-03'].includes(entry.date))
      assert.deepEqual(entries.map(({ date, code, minutes }) => ({ date, code, minutes })), [
        { date: '2020-11-02', code: null, minutes: null },
        { date: '2020-11-03', code: 'Я', minutes: 480 },
      ])
      assert.equal(data.entries.find(entry => entry.staff_number === secondNumber && entry.date === '2020-11-03').code, 'НН')
      const { data: report } = await call('GET', '/report?date=2020-11-03', hr)
      assert.deepEqual(report.filter(item => item.id === other.id).map(item => item.marks), [[
        { staff_number: staffNumber, code: 'Я' }, { staff_number: secondNumber, code: 'НН' },
      ]])
      const excel = await fetch(`${BASE}/timesheet/${data.id}/export/excel`, { headers: { Authorization: `Bearer ${hr.token}`, 'x-organization-id': '1' } })
      assert.equal(excel.status, 200)
      const exported = new ExcelJS.Workbook()
      await exported.xlsx.load(Buffer.from(await excel.arrayBuffer()))
      const exportedRows = exported.worksheets[0].getRows(6, 2)
      assert.ok(exportedRows.some(row => row.getCell(1).text.endsWith(staffNumber) && row.getCell(4).text === 'Я\n8:00'))
      assert.ok(exportedRows.some(row => row.getCell(1).text.endsWith(secondNumber) && row.getCell(4).text === 'НН'))
      assert.equal((await query('SELECT duration FROM vacation_requests WHERE user_id = $1', [other.id])).rows[0].duration, 2)
      assert.equal((await upload(dept)).status, 409)
      assert.equal((await call('PUT', '/employees/settings', hr, [{ employee_id: other.id, staff_numbers: [staffNumber] }])).status, 200)
      const historical = (await call('GET', `/${data.id}`, hr)).data
      assert.ok(historical.employees.some(employee => employee.id === other.id && employee.staff_number === secondNumber))
      const next = await call('POST', `/${data.id}/versions`, hr, { number: 'Корректировка' })
      assert.equal(next.status, 201, JSON.stringify(next))
      const correction = (await call('GET', `/${next.data.id}`, hr)).data
      assert.ok(correction.days.every(day => day.staff_rows.length === 2 && day.status === 'returned'))
      const correctedDate = '2020-11-05'
      const edit = { employee_id: other.id, date: correctedDate, code: 'Я', minutes: 90 }
      assert.equal((await call('PUT', `/${correction.id}/entries`, manager, [edit])).status, 400)
      const submitted = await call('POST', `/${correction.id}/days/${correctedDate}/submit`, manager, {
        entries: [{ ...edit, staff_number: secondNumber }],
      })
      assert.equal(submitted.status, 200, JSON.stringify(submitted))
      assert.equal((await call('PUT', `/${correction.id}/days/${correctedDate}/review`, hr, { status: 'approved', revision: submitted.data.revision })).status, 200)
      const approved = (await call('GET', `/${correction.id}`, hr)).data
      assert.equal(approved.entries.find(entry => entry.date === correctedDate && entry.staff_number === staffNumber).minutes, 360)
      assert.equal(approved.entries.find(entry => entry.date === correctedDate && entry.staff_number === secondNumber).minutes, 90)
    } finally {
      await query('DELETE FROM timesheets WHERE department_id = $1', [otherDept.id])
      await query('DELETE FROM vacation_requests WHERE user_id = $1', [other.id])
      await query('DELETE FROM users WHERE id = $1', [other.id])
      await query('DELETE FROM departments WHERE id = $1', [otherDept.id])
    }
  })

  it('импорт останавливается на полных тёзках и при попытке привязать занятый номер к другому сотруднику', async () => {
    const firstName = `Тёзка ${stamp}`
    await query("UPDATE users SET last_name='Проверочный', first_name=$1 WHERE id=ANY($2::int[])", [firstName, [delegate.id, outsider.id]])
    const workbook = new ExcelJS.Workbook()
    const tab = workbook.addWorksheet('0504421')
    tab.getCell('T3').value = `Конфликт-${stamp}`
    tab.getCell('O6').value = 'за период с 1 по 15 января 2020 г.'
    tab.getCell('AN6').value = '15.01.2020'
    tab.getCell('AN9').value = 0
    tab.getCell('C15').value = `Проверочный ${firstName}`
    tab.getCell('D15').value = `009-${stamp}`
    tab.getCell('H16').value = 'В'
    const upload = async () => {
      const body = new FormData()
      body.append('file', new Blob([await workbook.xlsx.writeBuffer()]), 'test.xlsx')
      const response = await fetch(`${BASE}/timesheet/import`, { method: 'POST', headers: { Authorization: `Bearer ${hr.token}`, 'x-organization-id': '1' }, body })
      return { status: response.status, data: await response.json() }
    }
    const ambiguous = await upload()
    assert.equal(ambiguous.status, 409)
    assert.match(ambiguous.data.error, /несколько сотрудников с ФИО/)
    tab.getCell('D15').value = `001-${stamp}`
    const taken = await upload()
    assert.equal(taken.status, 409)
    assert.match(taken.data.error, /закреплён за другим сотрудником/)
    assert.equal((await query('SELECT id FROM timesheets WHERE number = $1', [tab.getCell('T3').value])).rowCount, 0)
    const { data: roster } = await call('GET', '/employees/settings', hr)
    assert.equal(roster.find(item => item.id === delegate.id).staff_number, null)

    await query("UPDATE users SET position='Старший специалист' WHERE id=$1", [delegate.id])
    const newNumber = `009-${stamp}`
    tab.getCell('D15').value = newNumber
    tab.getCell('F15').value = 'Старший специалист'
    const assigned = await upload()
    assert.equal(assigned.status, 201, JSON.stringify(assigned))
    assert.equal(assigned.data.assigned_staff_numbers, 1)
    const { data: updated } = await call('GET', '/employees/settings', hr)
    assert.equal(updated.find(item => item.id === delegate.id).staff_number, newNumber)
    assert.equal(updated.find(item => item.id === outsider.id).staff_number, null)
  })

  it('новая версия старого утверждённого месяца сохраняет состав и открывает скопированные даты для исправлений', async () => {
    const { rows: [legacy] } = await query("INSERT INTO timesheets(department_id,organization_id,year,month,status) VALUES ($1,1,2020,3,'approved') RETURNING id", [dept])
    await query("INSERT INTO timesheet_entries(timesheet_id,employee_id,date,code,minutes,organization_id) VALUES ($1,$2,'2020-03-02','Я',480,1)", [legacy.id, worker.id])
    const created = await call('POST', `/${legacy.id}/versions`, hr, { number: '25', document_date: '2026-11-18', kind: 'correction', period: 'half' })
    assert.equal(created.status, 201, JSON.stringify(created))
    assert.equal(created.data.period, 'half')
    assert.equal(created.data.document_date, '2026-11-18')
    const details = (await call('GET', `/${created.data.id}`, manager)).data
    assert.deepEqual(details.days.find(day => day.date === '2020-03-02').employee_ids, [worker.id])
    assert.equal(details.entries.find(mark => mark.date === '2020-03-02').minutes, 480)
    assert.equal((await call('PUT', `/${created.data.id}/entries`, manager, [{ employee_id: worker.id, date: '2020-03-02', code: 'НН' }])).status, 200)
  })

  it('журнал отдаёт предыдущие события без пропусков и повторов, курсор и чужой доступ проверяются', async () => {
    await query(`INSERT INTO timesheet_audit(department_id,timesheet_id,actor_id,action,data)
      SELECT $1,$2,$3,'Проверка истории',jsonb_build_object('reason',n) FROM generate_series(1,105) AS n`, [dept, sheet.id, hr.id])
    const first = await call('GET', `/${sheet.id}/audit`, manager)
    assert.equal(first.status, 200)
    assert.equal(first.data.length, 100)
    const cursor = first.data.at(-1).id
    const next = await call('GET', `/${sheet.id}/audit?before=${cursor}`, manager)
    assert.equal(next.status, 200)
    assert.ok(next.data.length > 0)
    assert.ok(next.data.every(event => BigInt(event.id) < BigInt(cursor)))
    const ids = [...first.data, ...next.data].map(event => event.id)
    assert.equal(new Set(ids).size, ids.length)
    const events = [...first.data, ...next.data].filter(event => event.action === 'Проверка истории')
    assert.equal(events.length, 105)
    assert.equal((await call('GET', `/${sheet.id}/audit?before=not-a-number`, manager)).status, 400)
    assert.equal((await call('GET', `/${sheet.id}/audit`, outsider)).status, 403)
  })

  it('напоминания по почте: время, выключатель, закрытые дни и отсутствие дублей', async () => {
    await query("UPDATE system_settings SET value = CASE key WHEN 'timesheet_reminder_enabled' THEN 'true' ELSE '10:17' END WHERE key LIKE 'timesheet_reminder_%'")
    const date = new Date(`${today}T10:17:00`)
    assert.equal(await runTimesheetReminderJob(new Date(`${today}T10:16:00`)), 0)
    assert.ok(await runTimesheetReminderJob(date) >= 1)
    assert.equal(await runTimesheetReminderJob(date), 0)
    const { rows: [notice] } = await query("SELECT * FROM notification_queue WHERE user_id=$1 AND type='timesheet_reminder'", [manager.id])
    assert.equal(notice.channel, 'email')
    const rendered = renderEmail(notice)
    assert.match(rendered.subject, /табель/)
    assert.match(rendered.text, /ещё не отправлен/)
    await query("UPDATE system_settings SET value='false' WHERE key='timesheet_reminder_enabled'")
    assert.equal(await runTimesheetReminderJob(date), 0)
  })
})
