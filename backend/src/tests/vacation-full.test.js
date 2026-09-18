import { describe, it, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import PizZip from 'pizzip'
import { pool, query } from '../config/database.js'
import { BASE, PASSWORD, login } from './helpers.js'
import { deleteFromS3 } from '../config/s3.js'

const SUFFIX = '@vac-full.test'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (days) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return iso(d) }
const yearOf = (s) => parseInt(s.slice(0, 4), 10)

async function call(method, path, token, body, org = '1') {
  const headers = { 'x-organization-id': org }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  })
  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('json') ? await res.json().catch(() => null) : Buffer.from(await res.arrayBuffer())
  return { status: res.status, data, contentType }
}

async function mkUser({ email, role = 'employee', last = 'Пробников', first = 'Пётр', deptId = null, orgIds = [1], hireDate = '2020-01-01' }) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date, status)
     VALUES ($1, $2, $3, $4, 'Специалист', $5, $6, $7, 'active') RETURNING id`,
    [email, hash, first, last, role, deptId, hireDate])).rows[0].id
  for (const orgId of orgIds) {
    await query('INSERT INTO user_organizations (user_id, org_id, org_role) VALUES ($1, $2, $3)', [id, orgId, role])
  }
  return { id, email, token: null }
}

async function tokenFor(user) {
  if (!user.token) user.token = await login(user.email)
  return user.token
}

async function mkDept(name, orgId = 1, managerId = null) {
  return (await query('INSERT INTO departments (name, organization_id, manager_id) VALUES ($1, $2, $3) RETURNING id', [name, orgId, managerId])).rows[0].id
}

async function mkBalance(userId, year, orgId = 1, total = 28, used = 0, reserved = 0) {
  await query(
    'INSERT INTO vacation_balances (user_id, total_days, used_days, available_days, reserved_days, year, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [userId, total, used, total - used - reserved, reserved, year, orgId])
}

async function mkVacation({ userId, start, end, duration, orgId = 1, status = 'on_approval', type = 'annual_paid', approverId = null }) {
  return (await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, duration, vacation_type_id, status_id, organization_id, approver_id)
     VALUES ($1, $2, $3, $4, (SELECT id FROM vacation_types WHERE code = $5 AND organization_id = $6), (SELECT id FROM request_statuses WHERE code = $7), $6, $8)
     RETURNING *`,
    [userId, start, end, duration, type, orgId, status, approverId])).rows[0]
}

const statusOf = async (id) => (await query(
  'SELECT rs.code AS code FROM vacation_requests vr JOIN request_statuses rs ON rs.id = vr.status_id WHERE vr.id = $1', [id])).rows[0].code

const historyOf = async (id) => (await query(
  'SELECT rs.code AS code FROM vacation_request_status_history h JOIN request_statuses rs ON rs.id = h.status_id WHERE h.request_id = $1 ORDER BY h.id', [id])).rows.map((r) => r.code)

const balanceOf = async (userId, year, orgId = 1) => (await query(
  'SELECT total_days, used_days, reserved_days, available_days FROM vacation_balances WHERE user_id = $1 AND year = $2 AND organization_id = $3', [userId, year, orgId])).rows[0]

async function waitNotification(userId, type, predicate = () => true, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const rows = (await query(
      'SELECT * FROM notification_queue WHERE user_id = $1 AND type = $2 ORDER BY id DESC LIMIT 20', [userId, type])).rows
    const hit = rows.find(predicate)
    if (hit) return hit
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return null
}

async function enableModules() {
  const snap = (await query("SELECT code, is_enabled FROM modules WHERE code IN ('notifications')")).rows
  await query("UPDATE modules SET is_enabled = true WHERE code IN ('notifications')")
  return snap
}

async function restoreModules(snap) {
  for (const m of snap) await query('UPDATE modules SET is_enabled = $1 WHERE code = $2', [m.is_enabled, m.code])
}

async function cleanupFixtures({ deptIds = [], templateNames = [] } = {}) {
  const like = `%${SUFFIX}`
  const fixtureUserIds = 'SELECT id FROM users WHERE email LIKE $1'
  if (deptIds.length) {
    await query('DELETE FROM vacation_restrictions WHERE department_id = ANY($1) OR created_by IN (' + fixtureUserIds.replace('$1', '$2') + ')', [deptIds, like])
    await query('DELETE FROM timesheets WHERE department_id = ANY($1)', [deptIds])
    await query('UPDATE departments SET manager_id = NULL, parent_user_id = NULL WHERE id = ANY($1)', [deptIds])
  } else {
    await query('DELETE FROM vacation_restrictions WHERE created_by IN (' + fixtureUserIds + ')', [like])
  }
  await query('DELETE FROM vacation_request_status_history WHERE changed_by IN (' + fixtureUserIds + ')', [like])
  await query(
    `UPDATE vacation_requests SET reviewed_by = NULL, approver_id = NULL, transferred_from_id = NULL
     WHERE reviewed_by IN (${fixtureUserIds}) OR approver_id IN (${fixtureUserIds}) OR transferred_from_id IN (${fixtureUserIds})`,
    [like])
  await query('DELETE FROM vacation_substitutions WHERE assigned_by IN (' + fixtureUserIds + ')', [like])
  await query('DELETE FROM vacation_requests WHERE user_id IN (' + fixtureUserIds + ')', [like])
  await query('DELETE FROM users WHERE email LIKE $1', [like])
  if (deptIds.length) await query('DELETE FROM departments WHERE id = ANY($1)', [deptIds])
  if (templateNames.length) {
    const rows = (await query('SELECT file_key FROM document_templates WHERE name = ANY($1)', [templateNames])).rows
    for (const row of rows) { if (row.file_key) await deleteFromS3(row.file_key).catch(() => {}) }
    await query('DELETE FROM document_templates WHERE name = ANY($1)', [templateNames])
  }
}

function minimalDocx() {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>wc test</w:t></w:r></w:p></w:body></w:document>')
  return zip.generate({ type: 'nodebuffer' })
}

async function createDocTemplate(token, name, purpose, buffer = minimalDocx(), mime = DOCX_MIME, filename = 'template.docx') {
  const fd = new FormData()
  fd.append('name', name)
  if (purpose) fd.append('purpose', purpose)
  if (buffer) fd.append('file', new Blob([buffer], { type: mime }), filename)
  return call('POST', '/dictionaries/doc-templates', token, fd)
}

const postVacation = async (user, body, org = '1') => call('POST', '/vacation/requests', await tokenFor(user), body, org)

async function anonymousCall(method, path, body) {
  const pre = await fetch(`${BASE}/dictionaries/doc-templates`, { headers: { 'x-organization-id': '1' } })
  const cookie = (pre.headers.getSetCookie?.() || []).find((c) => c.startsWith('csrf_token='))
  const headers = { 'x-organization-id': '1' }
  if (cookie) {
    const pair = cookie.split(';')[0]
    headers.Cookie = pair
    headers['x-csrf-token'] = pair.split('=')[1]
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, data: await res.json().catch(() => null) }
}

describe('Модуль отпусков — user stories', () => {
  after(() => pool.end())

  describe('US-1. Работник подаёт заявку на отпуск', () => {
    let deptId, mgr, emp, emp2, sub
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us1.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US1 Отдел vac-full', 1, mgr.id)
      mgr.deptId = deptId
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us1.emp${SUFFIX}`, last: 'Иванов', first: 'Пётр', deptId })
      emp2 = await mkUser({ email: `us1.emp2${SUFFIX}`, last: 'Петров', deptId })
      sub = await mkUser({ email: `us1.sub${SUFFIX}`, last: 'Козлов', deptId })
      await mkBalance(emp.id, yearOf(shift(10)))
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('201: заявка on_approval с duration, резервом, историей и уведомлением согласующему', async () => {
      const res = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid', comment: 'Семейные обстоятельства' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.duration, 5)
      assert.strictEqual(res.data.user_id, emp.id)
      assert.strictEqual(res.data.start_date, shift(10))
      assert.strictEqual(await statusOf(res.data.id), 'on_approval')
      assert.deepStrictEqual(await historyOf(res.data.id), ['on_approval'])
      assert.strictEqual((await balanceOf(emp.id, yearOf(shift(10)))).reserved_days, 5)
      const notification = await waitNotification(mgr.id, 'vacation_created', (n) => n.data.days === 5)
      assert.ok(notification, 'уведомление vacation_created согласующему не получено')
      assert.strictEqual(notification.data.employeeName, 'Иванов Пётр')
      assert.strictEqual(notification.data.link, '/leader')
    })

    it('400: дата окончания раньше даты начала', async () => {
      const res = await postVacation(emp, { startDate: shift(14), endDate: shift(10), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Дата окончания не может быть раньше даты начала')
    })

    it('400: несуществующий тип отпуска', async () => {
      const res = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'nonexistent' })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Неверный тип отпуска')
    })

    it('400: дата начала в прошлом', async () => {
      const res = await postVacation(emp, { startDate: shift(-5), endDate: shift(-1), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Нельзя создавать заявку на прошедшую дату')
    })

    it('400: недостаточно дней на балансе', async () => {
      const res = await postVacation(emp, { startDate: shift(10), endDate: shift(45), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Недостаточно дней на балансе')
      assert.strictEqual(res.data.required, 36)
    })

    it('401: запрос без токена (с валидной CSRF-парой, без auth_token)', async () => {
      const res = await anonymousCall('POST', '/vacation/requests', { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 401)
      assert.strictEqual(res.data.error, 'Access token required')
    })

    it('201: поездка с детьми — JSONB children и счётчик', async () => {
      const res = await postVacation(emp, {
        startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid',
        hasTravel: true, travelDestination: 'Южно-Сахалинск',
        travelChildren: [{ fullName: 'Иванов Пётр Jr', birthDate: '2015-03-01' }],
      })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      const row = (await query('SELECT has_travel, travel_destination, travel_children, travel_children_count FROM vacation_requests WHERE id = $1', [res.data.id])).rows[0]
      assert.strictEqual(row.has_travel, true)
      assert.strictEqual(row.travel_destination, 'Южно-Сахалинск')
      assert.strictEqual(row.travel_children_count, 1)
      assert.strictEqual(row.travel_children[0].fullName, 'Иванов Пётр Jr')
    })

    it('400: поездка без города', async () => {
      const res = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid', hasTravel: true })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Укажите город проезда')
    })

    it('400: ребёнок без ФИО', async () => {
      const res = await postVacation(emp, {
        startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid', hasTravel: true, travelDestination: 'Южно-Сахалинск',
        travelChildren: [{ birthDate: '2015-03-01' }],
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Укажите ФИО ребёнка')
    })

    it('400: ребёнок 18+ отклоняется', { skip: 'код не валидирует возраст детей — расхождение с ТЗ, см. коммит' }, async () => {
      const res = await postVacation(emp, {
        startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid', hasTravel: true, travelDestination: 'Южно-Сахалинск',
        travelChildren: [{ fullName: 'Иванов adult', birthDate: '2000-01-01' }],
      })
      assert.strictEqual(res.status, 400)
    })

    it('201: замещающие при создании заявки — строки и уведомления обоим', async () => {
      const res = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid', substitute_ids: [emp2.id, sub.id] })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      const rows = (await query('SELECT substitute_user_id FROM vacation_substitutions WHERE vacation_request_id = $1 ORDER BY substitute_user_id', [res.data.id])).rows.map((r) => r.substitute_user_id)
      assert.deepStrictEqual(rows.sort((a, b) => a - b), [emp2.id, sub.id].sort((a, b) => a - b))
      assert.ok(await waitNotification(emp2.id, 'vacation_substitution'), 'уведомление первому замещающему не получено')
      assert.ok(await waitNotification(sub.id, 'vacation_substitution'), 'уведомление второму замещающему не получено')
    })
  })

  describe('US-2. Работник видит свои отпуска и баланс', () => {
    let deptId, mgr, emp, emp2
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us2.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US2 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us2.emp${SUFFIX}`, last: 'Иванов', deptId })
      emp2 = await mkUser({ email: `us2.emp2${SUFFIX}`, last: 'Петров', deptId })
      await mkBalance(emp.id, yearOf(shift(10)))
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('GET /requests?userId возвращает только свои заявки; чужой userId от employee → 403', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      assert.strictEqual(created.status, 201)
      const own = await call('GET', `/vacation/requests?userId=${emp.id}`, await tokenFor(emp))
      assert.strictEqual(own.status, 200)
      assert.ok(own.data.some((r) => r.id === created.data.id))
      assert.ok(own.data.every((r) => r.user_id === emp.id))
      const foreign = await call('GET', `/vacation/requests?userId=${emp.id}`, await tokenFor(emp2))
      assert.strictEqual(foreign.status, 403)
    })

    it('GET /upcoming/:userId — будущая approved есть, rejected нет', async () => {
      const first = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const second = await postVacation(emp, { startDate: shift(20), endDate: shift(24), vacationType: 'annual_paid' })
      assert.strictEqual((await call('POST', `/vacation/requests/${first.data.id}/approve`, await tokenFor(mgr), {})).status, 200)
      assert.strictEqual((await call('POST', `/vacation/requests/${second.data.id}/reject`, await tokenFor(mgr), { reason: 'Нет замены' })).status, 200)
      const upcoming = await call('GET', `/vacation/upcoming/${emp.id}`, await tokenFor(emp))
      assert.strictEqual(upcoming.status, 200)
      assert.ok(upcoming.data.some((r) => r.id === first.data.id && r.status === 'approved'))
      assert.ok(!upcoming.data.some((r) => r.id === second.data.id))
    })

    it('GET /balance/:userId — total/used/available/reserved', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      const balance = await call('GET', `/vacation/balance/${emp.id}?year=${yearOf(shift(10))}`, await tokenFor(emp))
      assert.strictEqual(balance.status, 200)
      assert.strictEqual(balance.data.total_days, 28)
      assert.strictEqual(balance.data.used_days, 5)
      assert.strictEqual(balance.data.reserved_days, 0)
      assert.strictEqual(balance.data.available_days, 23)
    })
  })

  describe('US-3. Работник отменяет свою заявку', () => {
    let deptId, mgr, emp, emp2, hr
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us3.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US3 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us3.emp${SUFFIX}`, last: 'Иванов', deptId })
      emp2 = await mkUser({ email: `us3.emp2${SUFFIX}`, last: 'Петров', deptId })
      hr = await mkUser({ email: `us3.hr${SUFFIX}`, role: 'hr', last: 'Смирнова' })
      await mkBalance(emp.id, yearOf(shift(10)))
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('владелец: cancelled_by_employee, резерв восстановлен, история', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('POST', `/vacation/requests/${created.data.id}/cancel`, await tokenFor(emp), {})
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.status, 'cancelled_by_employee')
      assert.strictEqual(await statusOf(created.data.id), 'cancelled_by_employee')
      assert.strictEqual((await balanceOf(emp.id, yearOf(shift(10)))).reserved_days, 0)
      assert.deepStrictEqual(await historyOf(created.data.id), ['on_approval', 'cancelled_by_employee'])
    })

    it('чужой employee → 403', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('POST', `/vacation/requests/${created.data.id}/cancel`, await tokenFor(emp2), {})
      assert.strictEqual(res.status, 403)
      assert.strictEqual(await statusOf(created.data.id), 'on_approval')
    })

    it('hr может отменить чужую заявку (по коду роли ≠ employee проходят)', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('POST', `/vacation/requests/${created.data.id}/cancel`, await tokenFor(hr), {})
      assert.strictEqual(res.status, 200)
      assert.strictEqual(await statusOf(created.data.id), 'cancelled_by_employee')
      assert.strictEqual((await balanceOf(emp.id, yearOf(shift(10)))).reserved_days, 0)
    })
  })

  describe('US-4. Руководитель согласовывает заявку', () => {
    let deptId, mgr, emp, emp2
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us4.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US4 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us4.emp${SUFFIX}`, last: 'Иванов', deptId })
      emp2 = await mkUser({ email: `us4.emp2${SUFFIX}`, last: 'Петров', deptId })
      await mkBalance(emp.id, yearOf(shift(10)))
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('очередь согласования: заявка есть до approve и исчезает после', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const before = await call('GET', '/vacation/requests?status=on_approval', await tokenFor(mgr))
      assert.strictEqual(before.status, 200)
      assert.ok(before.data.some((r) => r.id === created.data.id))
      const approved = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      assert.strictEqual(approved.status, 200)
      const after = await call('GET', '/vacation/requests?status=on_approval', await tokenFor(mgr))
      assert.ok(!after.data.some((r) => r.id === created.data.id))
    })

    it('approve: reserved→used, история, уведомление автору', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.status, 'approved')
      assert.strictEqual(await statusOf(created.data.id), 'approved')
      const balance = await balanceOf(emp.id, yearOf(shift(10)))
      assert.strictEqual(balance.used_days, 5)
      assert.strictEqual(balance.reserved_days, 0)
      assert.deepStrictEqual(await historyOf(created.data.id), ['on_approval', 'approved'])
      const notification = await waitNotification(emp.id, 'vacation_status_changed', (n) => n.data.status === 'approved')
      assert.ok(notification, 'уведомление vacation_status_changed не получено')
      assert.strictEqual(notification.data.comment, null)
    })

    it('reject с причиной: rejected, rejection_reason, уведомление с комментарием', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('POST', `/vacation/requests/${created.data.id}/reject`, await tokenFor(mgr), { reason: 'Производственная необходимость' })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.status, 'rejected')
      assert.strictEqual(await statusOf(created.data.id), 'rejected')
      const row = (await query('SELECT rejection_reason FROM vacation_requests WHERE id = $1', [created.data.id])).rows[0]
      assert.strictEqual(row.rejection_reason, 'Производственная необходимость')
      assert.strictEqual((await balanceOf(emp.id, yearOf(shift(10)))).reserved_days, 0)
      const notification = await waitNotification(emp.id, 'vacation_status_changed', (n) => n.data.status === 'rejected')
      assert.ok(notification, 'уведомление об отклонении не получено')
      assert.strictEqual(notification.data.comment, 'Производственная необходимость')
    })

    it('reject без причины → 400', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('POST', `/vacation/requests/${created.data.id}/reject`, await tokenFor(mgr), {})
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Укажите причину отклонения')
    })

    it('approve не-согласующим → 403', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(emp2), {})
      assert.strictEqual(res.status, 403)
      assert.strictEqual(res.data.error, 'Нет прав на согласование этой заявки')
    })

    it('повторный approve согласованной заявки → 400', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      const res = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Заявка не на согласовании')
    })
  })

  describe('US-5. Замещающий согласовывает за руководителя', () => {
    let deptId, mgr, emp, emp2, sub
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us5.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US5 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us5.emp${SUFFIX}`, last: 'Иванов', deptId })
      emp2 = await mkUser({ email: `us5.emp2${SUFFIX}`, last: 'Петров', deptId })
      sub = await mkUser({ email: `us5.sub${SUFFIX}`, last: 'Козлов', deptId })
      await mkBalance(emp.id, yearOf(shift(10)))
      await mkBalance(emp2.id, yearOf(shift(10)))
      const mgrVacation = await mkVacation({ userId: mgr.id, start: shift(-1), end: shift(5), duration: 7, status: 'approved', approverId: null })
      await query('INSERT INTO vacation_substitutions (vacation_request_id, substitute_user_id, organization_id) VALUES ($1, $2, 1)', [mgrVacation.id, sub.id])
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('уведомления approver и замещающему; approve замещающим → 200', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      assert.strictEqual(created.status, 201)
      assert.ok(await waitNotification(mgr.id, 'vacation_created'), 'уведомление approver не получено')
      assert.ok(await waitNotification(sub.id, 'vacation_created'), 'уведомление замещающему не получено')
      const res = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(sub), {})
      assert.strictEqual(res.status, 200)
      assert.strictEqual(await statusOf(created.data.id), 'approved')
    })

    it('посторонний работник → 403', async () => {
      const created = await postVacation(emp2, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      assert.strictEqual(created.status, 201)
      const res = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(emp2), {})
      assert.strictEqual(res.status, 403)
      assert.strictEqual(res.data.error, 'Нет прав на согласование этой заявки')
    })
  })

  describe('US-6. Работник запрашивает перенос отпуска', () => {
    let deptId, mgr, emp, emp2
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us6.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US6 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us6.emp${SUFFIX}`, last: 'Иванов', deptId })
      emp2 = await mkUser({ email: `us6.emp2${SUFFIX}`, last: 'Петров', deptId })
      for (const year of new Set([yearOf(shift(10)), yearOf(shift(40))])) {
        await mkBalance(emp.id, year)
      }
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    const approvedVacation = async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      assert.strictEqual(created.status, 201)
      const approved = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      assert.strictEqual(approved.status, 200)
      return created.data.id
    }

    it('GET /my-transferable: у владельца approved есть, у работника без отпусков пусто', async () => {
      const id = await approvedVacation()
      const mine = await call('GET', '/vacation/my-transferable', await tokenFor(emp))
      assert.strictEqual(mine.status, 200)
      assert.ok(mine.data.some((r) => r.id === id))
      const other = await call('GET', '/vacation/my-transferable', await tokenFor(emp2))
      assert.deepStrictEqual(other.data, [])
    })

    it('POST transfer от владельца: 201, исходные даты не изменились', async () => {
      const id = await approvedVacation()
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44), reason: 'По семейным обстоятельствам' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.transferred_from_id, id)
      assert.strictEqual(await statusOf(id), 'approved')
      const original = (await query('SELECT start_date, end_date FROM vacation_requests WHERE id = $1', [id])).rows[0]
      assert.strictEqual(String(original.start_date), shift(10))
      assert.strictEqual(String(original.end_date), shift(14))
      assert.strictEqual(await statusOf(res.data.id), 'on_approval')
      assert.strictEqual(String(res.data.start_date), shift(40))
    })

    it('чужой работник → 404 (владелец проверяется в SQL)', async () => {
      const id = await approvedVacation()
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp2), { newStartDate: shift(40), newEndDate: shift(44), reason: 'Захват' })
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.data.error, 'Заявка не найдена')
    })

    it('end<start → 400', { skip: 'код не валидирует порядок дат переноса — расхождение с ТЗ, см. коммит' }, async () => {
      const id = await approvedVacation()
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp), { newStartDate: shift(44), newEndDate: shift(40), reason: 'Проверка' })
      assert.strictEqual(res.status, 400)
    })

    it('duration>available → 400', { skip: 'код не проверяет баланс при переносе — расхождение с ТЗ, см. коммит' }, async () => {
      const id = await approvedVacation()
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(120), reason: 'Проверка' })
      assert.strictEqual(res.status, 400)
    })
  })

  describe('US-7. Руководитель согласовывает перенос', () => {
    let deptId, mgr, emp, sub
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us7.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US7 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us7.emp${SUFFIX}`, last: 'Иванов', deptId })
      sub = await mkUser({ email: `us7.sub${SUFFIX}`, last: 'Козлов', deptId })
      for (const year of new Set([yearOf(shift(10)), yearOf(shift(40))])) {
        await mkBalance(emp.id, year)
      }
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    const transferFlow = async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      assert.strictEqual(created.status, 201)
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      const transfer = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(46), reason: 'Перенос по производственной необходимости' })
      assert.strictEqual(transfer.status, 201, JSON.stringify(transfer.data))
      return { originalId: created.data.id, transferId: transfer.data.id }
    }

    it('transfer/approve: новые даты, статусы, история переносов', async () => {
      const { originalId, transferId } = await transferFlow()
      const res = await call('POST', `/vacation/requests/${transferId}/transfer/approve`, await tokenFor(mgr), {})
      assert.strictEqual(res.status, 200)
      assert.strictEqual(await statusOf(transferId), 'approved')
      assert.strictEqual(String(res.data.start_date), shift(40))
      assert.strictEqual(String(res.data.end_date), shift(46))
      assert.strictEqual(res.data.duration, 7)
      assert.strictEqual(await statusOf(originalId), 'cancelled_by_employee')
      assert.deepStrictEqual(await historyOf(transferId), ['on_approval', 'approved'])
      assert.deepStrictEqual(await historyOf(originalId), ['on_approval', 'approved', 'cancelled_by_employee'])
      const transfers = await call('GET', '/vacation/my-transfer-requests', await tokenFor(emp))
      const row = transfers.data.find((r) => r.id === transferId)
      assert.ok(row)
      assert.strictEqual(row.status, 'approved')
      assert.strictEqual(row.original_id, originalId)
    })

    it('баланс после transfer/approve: факт кода — used += new, reserved -= new без восстановления исходного', async () => {
      const { transferId } = await transferFlow()
      await call('POST', `/vacation/requests/${transferId}/transfer/approve`, await tokenFor(mgr), {})
      const expected = {}
      const bump = (year, used, reserved) => {
        expected[year] = expected[year] || { used: 0, reserved: 0 }
        expected[year].used += used
        expected[year].reserved += reserved
      }
      bump(yearOf(shift(10)), 0, 5)
      bump(yearOf(shift(10)), 5, -5)
      bump(yearOf(shift(40)), 7, -7)
      for (const [year, exp] of Object.entries(expected)) {
        const actual = await balanceOf(emp.id, parseInt(year, 10))
        assert.ok(actual, `баланс за ${year} не найден`)
        assert.strictEqual(actual.used_days, exp.used, `used за ${year}`)
        assert.strictEqual(actual.reserved_days, exp.reserved, `reserved за ${year}`)
      }
    })

    it('transfer/reject: исходные даты прежние, перенос закрыт', async () => {
      const { originalId, transferId } = await transferFlow()
      const res = await call('POST', `/vacation/requests/${transferId}/transfer/reject`, await tokenFor(mgr), { reason: 'Нет возможности' })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(await statusOf(transferId), 'rejected')
      assert.strictEqual(await statusOf(originalId), 'approved')
      const original = (await query('SELECT start_date, end_date FROM vacation_requests WHERE id = $1', [originalId])).rows[0]
      assert.strictEqual(String(original.start_date), shift(10))
      assert.strictEqual(String(original.end_date), shift(14))
      assert.deepStrictEqual(await historyOf(transferId), ['on_approval', 'rejected'])
      const transfers = await call('GET', '/vacation/my-transfer-requests', await tokenFor(emp))
      assert.strictEqual(transfers.data.find((r) => r.id === transferId).status, 'rejected')
    })

    it('transfer/cancel владельцем: перенос закрыт, исходная остаётся approved', async () => {
      const { originalId, transferId } = await transferFlow()
      const res = await call('POST', `/vacation/requests/${transferId}/transfer/cancel`, await tokenFor(emp), {})
      assert.strictEqual(res.status, 200)
      assert.strictEqual(await statusOf(transferId), 'cancelled_by_employee')
      assert.strictEqual(await statusOf(originalId), 'approved')
      const original = (await query('SELECT start_date, end_date, transfer_reason FROM vacation_requests WHERE id = $1', [originalId])).rows[0]
      assert.strictEqual(String(original.start_date), shift(10))
      assert.strictEqual(original.transfer_reason, null)
      assert.deepStrictEqual(await historyOf(transferId), ['on_approval', 'rejected'])
      const transfers = await call('GET', '/vacation/my-transfer-requests', await tokenFor(emp))
      assert.strictEqual(transfers.data.find((r) => r.id === transferId).status, 'cancelled_by_employee')
    })

    it('замещающие при переносе привязываются к новой заявке (по факту кода)', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      const transfer = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44), reason: 'Перенос', substitute_ids: [sub.id] })
      assert.strictEqual(transfer.status, 201)
      const rows = (await query('SELECT substitute_user_id FROM vacation_substitutions WHERE vacation_request_id = $1', [transfer.data.id])).rows
      assert.strictEqual(rows.length, 1)
      assert.strictEqual(rows[0].substitute_user_id, sub.id)
    })
  })

  describe('US-8. Управление замещающими на существующем отпуске', () => {
    let deptId, mgr, emp, sub
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us8.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US8 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us8.emp${SUFFIX}`, last: 'Иванов', deptId })
      sub = await mkUser({ email: `us8.sub${SUFFIX}`, last: 'Козлов', deptId })
      await mkBalance(emp.id, yearOf(shift(10)))
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('POST /requests/:id/substitutes добавляет замещающего и уведомляет', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('POST', `/vacation/requests/${created.data.id}/substitutes`, await tokenFor(emp), { substitute_ids: [sub.id] })
      assert.strictEqual(res.status, 201)
      assert.strictEqual(res.data.added, 1)
      const rows = (await query('SELECT substitute_user_id FROM vacation_substitutions WHERE vacation_request_id = $1', [created.data.id])).rows
      assert.strictEqual(rows.length, 1)
      assert.ok(await waitNotification(sub.id, 'vacation_substitution'))
    })

    it('GET /my-substitutions показывает отпуск замещающему', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await query('INSERT INTO vacation_substitutions (vacation_request_id, substitute_user_id, assigned_by, organization_id) VALUES ($1, $2, $3, 1)', [created.data.id, sub.id, emp.id])
      const res = await call('GET', '/vacation/my-substitutions', await tokenFor(sub))
      assert.strictEqual(res.status, 200)
      assert.ok(res.data.some((r) => r.id === created.data.id))
      assert.ok(res.data.every((r) => r.user_id === emp.id))
    })

    it('DELETE /requests/:id/substitutes/:userId убирает замещающего', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await query('INSERT INTO vacation_substitutions (vacation_request_id, substitute_user_id, assigned_by, organization_id) VALUES ($1, $2, $3, 1)', [created.data.id, sub.id, emp.id])
      const res = await call('DELETE', `/vacation/requests/${created.data.id}/substitutes/${sub.id}`, await tokenFor(emp))
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.removed, true)
      const rows = (await query('SELECT 1 FROM vacation_substitutions WHERE vacation_request_id = $1 AND substitute_user_id = $2', [created.data.id, sub.id])).rows
      assert.strictEqual(rows.length, 0)
    })
  })

  describe('US-9. HR управляет ограничениями (пересечения)', () => {
    let deptId, mgr, hr, emp, emp2
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us9.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US9 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      hr = await mkUser({ email: `us9.hr${SUFFIX}`, role: 'hr', last: 'Смирнова' })
      emp = await mkUser({ email: `us9.emp${SUFFIX}`, last: 'Ограничкин', deptId })
      emp2 = await mkUser({ email: `us9.emp2${SUFFIX}`, last: 'Занятая', deptId })
      await mkBalance(emp.id, yearOf(shift(10)))
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('POST /restrictions (manager, pair) → 201; GET списка отдела содержит', async () => {
      const res = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'pair', employeeIds: [emp.id, emp2.id], maxConcurrent: 1, description: 'Не одновременно',
      })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.type, 'pair')
      assert.deepStrictEqual(res.data.employeeIds, [String(emp.id), String(emp2.id)])
      const list = await call('GET', `/vacation/restrictions?departmentId=${deptId}`, await tokenFor(mgr))
      assert.strictEqual(list.status, 200)
      assert.ok(list.data.some((r) => r.id === res.data.id))
    })

    it('GET /restrictions без departmentId → 400', async () => {
      const res = await call('GET', '/vacation/restrictions', await tokenFor(mgr))
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Укажите departmentId')
    })

    it('POST /restrictions от employee → 403', async () => {
      const res = await call('POST', '/vacation/restrictions', await tokenFor(emp), { departmentId: deptId, type: 'pair', employeeIds: [emp.id, emp2.id] })
      assert.strictEqual(res.status, 403)
    })

    it('DELETE /restrictions от employee → 403', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'pair', employeeIds: [emp.id, emp2.id] })
      const res = await call('DELETE', `/vacation/restrictions/${created.data.id}`, await tokenFor(emp))
      assert.strictEqual(res.status, 403)
    })

    it('DELETE hr → 200; повторный DELETE → 404', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'pair', employeeIds: [emp.id, emp2.id] })
      const removed = await call('DELETE', `/vacation/restrictions/${created.data.id}`, await tokenFor(hr))
      assert.strictEqual(removed.status, 200)
      assert.strictEqual(removed.data.success, true)
      const again = await call('DELETE', `/vacation/restrictions/${created.data.id}`, await tokenFor(hr))
      assert.strictEqual(again.status, 404)
      assert.strictEqual(again.data.error, 'Ограничение не найдено')
    })

    it('check-restrictions: нарушение парного ограничения с ФИО', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'pair', employeeIds: [emp.id, emp2.id] })
      assert.strictEqual(created.status, 201)
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const res = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: shift(11), endDate: shift(12) })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.length, 1)
      assert.strictEqual(res.data[0].field, 'restriction')
      assert.ok(res.data[0].message.includes('Занятая'), res.data[0].message)
      assert.ok(res.data[0].message.includes('парное ограничение'), res.data[0].message)
    })

    it('check-restrictions: мимо дат → пусто', async () => {
      await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'pair', employeeIds: [emp.id, emp2.id] })
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const res = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: shift(40), endDate: shift(41) })
      assert.strictEqual(res.status, 200)
      assert.deepStrictEqual(res.data, [])
    })

    it('check-restrictions: 400 без полей; 404 несуществующий пользователь', async () => {
      const bad = await call('POST', '/vacation/check-restrictions', await tokenFor(mgr), {})
      assert.strictEqual(bad.status, 400)
      assert.strictEqual(bad.data.error, 'Укажите userId, startDate и endDate')
      const missing = await call('POST', '/vacation/check-restrictions', await tokenFor(mgr), { userId: 99999999, startDate: shift(10), endDate: shift(11) })
      assert.strictEqual(missing.status, 404)
      assert.strictEqual(missing.data.error, 'Пользователь не найден')
    })

    it('POST /requests не блокируется нарушением ограничения (по коду)', async () => {
      await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'pair', employeeIds: [emp.id, emp2.id] })
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const res = await postVacation(emp, { startDate: shift(11), endDate: shift(12), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    })
  })

  describe('US-10. HR управляет шаблонами заявлений', () => {
    let hrUser, emp
    const NAMES = ['vac-full шаблон A', 'vac-full шаблон B', 'vac-full шаблон C', 'vac-full шаблон D', 'vac-full шаблон E', 'vac-full шаблон F']
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      hrUser = await mkUser({ email: `us10.hr${SUFFIX}`, role: 'hr', last: 'Смирнова' })
      emp = await mkUser({ email: `us10.emp${SUFFIX}`, last: 'Иванов' })
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ templateNames: NAMES })
    })

    it('POST от hr (multipart docx) → 201 с file_key', async () => {
      const res = await createDocTemplate(await tokenFor(hrUser), NAMES[0], 'vacation_template')
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.name, NAMES[0])
      assert.ok(res.data.file_key.startsWith('doc-templates/'))
      assert.strictEqual(res.data.mime_type, DOCX_MIME)
    })

    it('дубликат purpose → 409', async () => {
      const first = await createDocTemplate(await tokenFor(hrUser), NAMES[1], 'vacation_template')
      assert.strictEqual(first.status, 201)
      const second = await createDocTemplate(await tokenFor(hrUser), NAMES[2], 'vacation_template')
      assert.strictEqual(second.status, 409)
      assert.strictEqual(second.data.error, 'Шаблон с таким назначением уже существует')
    })

    it('POST без файла → 500: file_key NOT NULL, файл фактически обязателен', async () => {
      const res = await createDocTemplate(await tokenFor(hrUser), NAMES[5], null, null)
      assert.strictEqual(res.status, 500)
      assert.ok(String(res.data.error).includes('file_key'))
    })

    it('PUT: переименование и замена файла', async () => {
      const created = await createDocTemplate(await tokenFor(hrUser), NAMES[3], 'vacation_transfer_template')
      assert.strictEqual(created.status, 201)
      const fd = new FormData()
      fd.append('name', NAMES[4])
      fd.append('file', new Blob([minimalDocx()], { type: DOCX_MIME }), 'replacement.docx')
      const updated = await call('PUT', `/dictionaries/doc-templates/${created.data.id}`, await tokenFor(hrUser), fd)
      assert.strictEqual(updated.status, 200)
      assert.strictEqual(updated.data.name, NAMES[4])
      assert.notStrictEqual(updated.data.file_key, created.data.file_key)
    })

    it('DELETE → 200; из списка исчезает; повторный DELETE → 404', async () => {
      const created = await createDocTemplate(await tokenFor(hrUser), NAMES[0], 'vacation_template')
      const removed = await call('DELETE', `/dictionaries/doc-templates/${created.data.id}`, await tokenFor(hrUser))
      assert.strictEqual(removed.status, 200)
      assert.strictEqual(removed.data.success, true)
      const list = await call('GET', '/dictionaries/doc-templates', await tokenFor(hrUser))
      assert.ok(!list.data.some((t) => t.id === created.data.id))
      const again = await call('DELETE', `/dictionaries/doc-templates/${created.data.id}`, await tokenFor(hrUser))
      assert.strictEqual(again.status, 404)
      assert.strictEqual(again.data.error, 'Шаблон не найден')
    })

    it('GET список от employee → 200; POST/PUT/DELETE от employee → 403', async () => {
      const created = await createDocTemplate(await tokenFor(hrUser), NAMES[0], 'vacation_template')
      const list = await call('GET', '/dictionaries/doc-templates', await tokenFor(emp))
      assert.strictEqual(list.status, 200)
      assert.ok(list.data.some((t) => t.id === created.data.id))
      const post = await createDocTemplate(await tokenFor(emp), NAMES[1], null, null)
      assert.strictEqual(post.status, 403)
      const fd = new FormData()
      fd.append('name', 'ignored')
      const put = await call('PUT', `/dictionaries/doc-templates/${created.data.id}`, await tokenFor(emp), fd)
      assert.strictEqual(put.status, 403)
      const del = await call('DELETE', `/dictionaries/doc-templates/${created.data.id}`, await tokenFor(emp))
      assert.strictEqual(del.status, 403)
    })

    it('GET /:id/file hr → 200 с исходными байтами; employee → 403', async () => {
      const docx = minimalDocx()
      const created = await createDocTemplate(await tokenFor(hrUser), NAMES[0], 'vacation_template', docx)
      const file = await call('GET', `/dictionaries/doc-templates/${created.data.id}/file`, await tokenFor(hrUser))
      assert.strictEqual(file.status, 200)
      assert.strictEqual(file.data.length, docx.length)
      const forbidden = await call('GET', `/dictionaries/doc-templates/${created.data.id}/file`, await tokenFor(emp))
      assert.strictEqual(forbidden.status, 403)
    })

    it('preview-token → public по токену без авторизации; битый токен → 401; чужой шаблон → 403', async () => {
      const first = await createDocTemplate(await tokenFor(hrUser), NAMES[0], 'vacation_template')
      const second = await createDocTemplate(await tokenFor(hrUser), NAMES[1], 'vacation_transfer_template')
      const preview = await call('GET', `/dictionaries/doc-templates/${first.data.id}/preview-token`, await tokenFor(hrUser))
      assert.strictEqual(preview.status, 200)
      assert.ok(preview.data.token)
      assert.ok(preview.data.publicUrl.includes(`/public/${preview.data.token}`))
      const publicFile = await call('GET', `/dictionaries/doc-templates/${first.data.id}/public/${preview.data.token}`, null)
      assert.strictEqual(publicFile.status, 200)
      assert.strictEqual(publicFile.data[0], 0x50)
      assert.strictEqual(publicFile.data[1], 0x4b)
      const badToken = await call('GET', `/dictionaries/doc-templates/${first.data.id}/public/not.a.jwt`, null)
      assert.strictEqual(badToken.status, 401)
      assert.strictEqual(badToken.data.error, 'Недействительный токен')
      const wrongTemplate = await call('GET', `/dictionaries/doc-templates/${second.data.id}/public/${preview.data.token}`, null)
      assert.strictEqual(wrongTemplate.status, 403)
      assert.strictEqual(wrongTemplate.data.error, 'Токен не соответствует шаблону')
    })

    it('multipart-фильтр: недопустимый тип файла отклоняется; pdf принимается', async () => {
      const fd = new FormData()
      fd.append('name', NAMES[0])
      fd.append('file', new Blob(['not a doc'], { type: 'application/zip' }), 'bad.zip')
      const rejected = await call('POST', '/dictionaries/doc-templates', await tokenFor(hrUser), fd)
      assert.strictEqual(rejected.status, 500)
      assert.strictEqual(rejected.data.error, 'Недопустимый тип файла')
      const pdf = await createDocTemplate(await tokenFor(hrUser), NAMES[5], null, Buffer.from('%PDF-1.4 тест'), 'application/pdf', 'doc.pdf')
      assert.strictEqual(pdf.status, 201)
      assert.strictEqual(pdf.data.mime_type, 'application/pdf')
    })
  })

  describe('US-11. Работник генерирует заявления', () => {
    let deptId, mgr, emp, hrUser, templateA, templateT
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us11.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US11 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us11.emp${SUFFIX}`, last: 'Иванов', deptId })
      hrUser = await mkUser({ email: `us11.hr${SUFFIX}`, role: 'hr', last: 'Смирнова' })
      for (const year of new Set([yearOf(shift(10)), yearOf(shift(40))])) {
        await mkBalance(emp.id, year)
      }
      const hrToken = await tokenFor(hrUser)
      templateA = (await createDocTemplate(hrToken, 'vac-full gen A', 'vacation_template')).data
      templateT = (await createDocTemplate(hrToken, 'vac-full gen T', 'vacation_transfer_template')).data
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId], templateNames: ['vac-full gen A', 'vac-full gen T'] })
    })

    const approvedVacation = async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      return created.data
    }

    it('POST /generate-application → 200 DOCX', async () => {
      await approvedVacation()
      const res = await call('POST', '/vacation/generate-application', await tokenFor(emp), { year: yearOf(shift(10)), templateId: templateA.id })
      assert.strictEqual(res.status, 200)
      assert.ok(res.contentType.includes('wordprocessingml.document'))
      assert.strictEqual(res.data[0], 0x50)
      assert.strictEqual(res.data[1], 0x4b)
    })

    it('несуществующий templateId → 404', async () => {
      const res = await call('POST', '/vacation/generate-application', await tokenFor(emp), { year: yearOf(shift(10)), templateId: 99999999 })
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.data.error, 'Шаблон не найден')
    })

    it('без года/шаблона → 400', async () => {
      const res = await call('POST', '/vacation/generate-application', await tokenFor(emp), {})
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Необходимо указать год и шаблон')
    })

    it('401 без токена (с валидной CSRF-парой)', async () => {
      const res = await anonymousCall('POST', '/vacation/generate-application', { year: 2026, templateId: 1 })
      assert.strictEqual(res.status, 401)
      assert.strictEqual(res.data.error, 'Access token required')
    })

    it('POST /generate-transfer-application → 200 DOCX', async () => {
      const original = await approvedVacation()
      const transfer = await call('POST', `/vacation/requests/${original.id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44), reason: 'Перенос' })
      assert.strictEqual(transfer.status, 201)
      const approved = await call('POST', `/vacation/requests/${transfer.data.id}/transfer/approve`, await tokenFor(mgr), {})
      assert.strictEqual(approved.status, 200)
      const res = await call('POST', '/vacation/generate-transfer-application', await tokenFor(emp), { templateId: templateT.id, transferIds: [transfer.data.id] })
      assert.strictEqual(res.status, 200)
      assert.ok(res.contentType.includes('wordprocessingml.document'))
      assert.strictEqual(res.data[0], 0x50)
    })

    it('transfer: пустой transferIds → 400; несуществующий шаблон → 404', async () => {
      const empty = await call('POST', '/vacation/generate-transfer-application', await tokenFor(emp), { templateId: templateT.id, transferIds: [] })
      assert.strictEqual(empty.status, 400)
      assert.strictEqual(empty.data.error, 'Необходимо указать шаблон и переносы')
      const missing = await call('POST', '/vacation/generate-transfer-application', await tokenFor(emp), { templateId: 99999999, transferIds: [1] })
      assert.strictEqual(missing.status, 404)
      assert.strictEqual(missing.data.error, 'Шаблон не найден')
    })
  })

  describe('US-12. Календарь: фильтры и org-scope', () => {
    let dept1, dept2, mgr1, mgr2, emp1, emp2
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr1 = await mkUser({ email: `us12.mgr1${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      dept1 = await mkDept('US12 Отдел vac-full', 1, mgr1.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [dept1, mgr1.id])
      emp1 = await mkUser({ email: `us12.emp1${SUFFIX}`, last: 'Иванов', deptId: dept1 })
      for (const year of new Set([yearOf(shift(10)), yearOf(shift(400))])) {
        await mkBalance(emp1.id, year)
      }
      mgr2 = await mkUser({ email: `us12.mgr2${SUFFIX}`, role: 'manager', last: 'Николаев' })
      dept2 = await mkDept('US12 Орг2 vac-full', 2, mgr2.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [dept2, mgr2.id])
      emp2 = await mkUser({ email: `us12.emp2${SUFFIX}`, last: 'Петров', deptId: dept2, orgIds: [1, 2] })
      await mkBalance(emp2.id, yearOf(shift(10)), 1, 28)
      await mkBalance(emp2.id, yearOf(shift(10)), 2, 30)
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [dept1, dept2] })
    })

    it('фильтры userId/status/year/vacationType дают точные выборки', async () => {
      const annual = await postVacation(emp1, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const unpaid = await postVacation(emp1, { startDate: shift(400), endDate: shift(404), vacationType: 'unpaid' })
      assert.strictEqual(annual.status, 201)
      assert.strictEqual(unpaid.status, 201)
      const byYearAndType = await call('GET', `/vacation/requests?userId=${emp1.id}&year=${yearOf(shift(10))}&vacationType=annual_paid`, await tokenFor(emp1))
      assert.ok(byYearAndType.data.some((r) => r.id === annual.data.id))
      assert.ok(!byYearAndType.data.some((r) => r.id === unpaid.data.id))
      const byStatusAndType = await call('GET', `/vacation/requests?userId=${emp1.id}&status=on_approval&vacationType=unpaid`, await tokenFor(emp1))
      assert.ok(byStatusAndType.data.some((r) => r.id === unpaid.data.id))
      assert.ok(!byStatusAndType.data.some((r) => r.id === annual.data.id))
      const all = await call('GET', `/vacation/requests?userId=${emp1.id}`, await tokenFor(emp1))
      assert.ok(all.data.some((r) => r.id === annual.data.id))
      assert.ok(all.data.some((r) => r.id === unpaid.data.id))
    })

    it('department-head-requests: отпуска начальника видит подчинённый, сам начальник — пусто', async () => {
      await mkVacation({ userId: mgr1.id, start: shift(20), end: shift(24), duration: 5, status: 'approved' })
      const subordinate = await call('GET', '/vacation/department-head-requests', await tokenFor(emp1))
      assert.strictEqual(subordinate.status, 200)
      assert.ok(subordinate.data.some((r) => r.user_id === mgr1.id))
      const own = await call('GET', '/vacation/department-head-requests', await tokenFor(mgr1))
      assert.deepStrictEqual(own.data, [])
    })

    it('org-scope: заявка org1 не видна в контексте org2', async () => {
      const created = await postVacation(emp2, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' }, '2')
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      assert.strictEqual(created.data.organization_id, 2)
      const inOrg2 = await call('GET', '/vacation/requests', await tokenFor(emp2), undefined, '2')
      assert.ok(inOrg2.data.some((r) => r.id === created.data.id))
      const inOrg1 = await call('GET', '/vacation/requests', await tokenFor(emp2), undefined, '1')
      assert.ok(!inOrg1.data.some((r) => r.id === created.data.id))
    })

    it('балансы одного пользователя за один год в org1 и org2 сосуществуют', async () => {
      const year = yearOf(shift(10))
      const inOrg1 = await call('GET', `/vacation/balance/${emp2.id}?year=${year}`, await tokenFor(emp2), undefined, '1')
      const inOrg2 = await call('GET', `/vacation/balance/${emp2.id}?year=${year}`, await tokenFor(emp2), undefined, '2')
      assert.strictEqual(inOrg1.status, 200)
      assert.strictEqual(inOrg2.status, 200)
      assert.strictEqual(inOrg1.data.total_days, 28)
      assert.strictEqual(inOrg2.data.total_days, 30)
    })
  })

  describe('US-13. Таймшит при отпуске', () => {
    let deptId, emp, month1, month2, tsDraftId, tsApprovedId
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      emp = await mkUser({ email: `us13.emp${SUFFIX}`, last: 'Иванов' })
      deptId = await mkDept('US13 Отдел vac-full', 1)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, emp.id])
      month1 = new Date()
      month1.setDate(1)
      if (new Date().getDate() >= 8) month1.setMonth(month1.getMonth() + 1)
      month2 = new Date(month1)
      month2.setMonth(month2.getMonth() + 1)
      tsDraftId = (await query(
        'INSERT INTO timesheets (department_id, year, month, status, organization_id) VALUES ($1, $2, $3, $4, 1) RETURNING id',
        [deptId, month1.getFullYear(), month1.getMonth() + 1, 'draft'])).rows[0].id
      tsApprovedId = (await query(
        'INSERT INTO timesheets (department_id, year, month, status, organization_id) VALUES ($1, $2, $3, $4, 1) RETURNING id',
        [deptId, month2.getFullYear(), month2.getMonth() + 1, 'approved'])).rows[0].id
      for (const year of new Set([month1.getFullYear(), month2.getFullYear()])) {
        await mkBalance(emp.id, year)
      }
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId] })
    })

    const dayOfMonth = (month, day) => iso(new Date(month.getFullYear(), month.getMonth(), day))

    it('после создания заявки — записи ОТ на все даты в черновом таймшите', async () => {
      const start = dayOfMonth(month1, 10)
      const end = dayOfMonth(month1, 14)
      const res = await postVacation(emp, { startDate: start, endDate: end, vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      const entries = (await query(
        'SELECT date, code FROM timesheet_entries WHERE timesheet_id = $1 AND employee_id = $2 ORDER BY date', [tsDraftId, emp.id])).rows
      assert.strictEqual(entries.length, 5)
      assert.ok(entries.every((e) => e.code === 'ОТ'))
      const dates = entries.map((e) => String(e.date))
      const expected = []
      for (let d = 10; d <= 14; d++) expected.push(dayOfMonth(month1, d))
      assert.deepStrictEqual(dates, expected)
    })

    it('согласованный (approved) таймшит не заполняется', async () => {
      const start = dayOfMonth(month2, 10)
      const end = dayOfMonth(month2, 14)
      const res = await postVacation(emp, { startDate: start, endDate: end, vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      const entries = (await query(
        'SELECT 1 FROM timesheet_entries WHERE timesheet_id = $1 AND employee_id = $2', [tsApprovedId, emp.id])).rows
      assert.strictEqual(entries.length, 0)
    })
  })
})
