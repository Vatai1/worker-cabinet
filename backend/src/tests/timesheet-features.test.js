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
const addUser = async role => {
  const { rows: [user] } = await query("INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date) VALUES ($1,'','Тест',$2,'Тест',$3,$4,'2020-01-01') RETURNING id", [`${users.length}-${stamp}@ts-features.invalid`, role, role, dept])
  users.push(user.id)
  await query('INSERT INTO user_organizations (user_id,org_id,org_role,department_id) VALUES ($1,1,$2,$3)', [user.id, role, dept])
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
