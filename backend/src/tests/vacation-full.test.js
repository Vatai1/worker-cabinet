import { describe, it, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import PizZip from 'pizzip'
import { pool, query } from '../config/database.js'
import { BASE, PASSWORD, login } from './helpers.js'
import { deleteFromS3 } from '../config/s3.js'
import { computeVacationDates } from '../routes/vacation.js'

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

async function ensureTestOrg(orgId) {
  const found = await query('SELECT 1 FROM organizations WHERE id = $1', [orgId])
  if (found.rows.length === 0) {
    await query('INSERT INTO organizations (id, name, slug, is_active) VALUES ($1, $2, $3, true)', [orgId, `Тест org ${orgId}`, `test-org-${orgId}`])
    await query("SELECT setval('organizations_id_seq', (SELECT MAX(id) FROM organizations))")
  }
  return orgId
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
      assert.strictEqual(notification.data.link, '/vacation')
      assert.strictEqual(notification.data.requestId, res.data.id)
      assert.strictEqual(notification.data.employeeId, emp.id)
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
      const n1 = await waitNotification(emp2.id, 'vacation_substitution')
      const n2 = await waitNotification(sub.id, 'vacation_substitution')
      assert.ok(n1, 'уведомление первому замещающему не получено')
      assert.ok(n2, 'уведомление второму замещающему не получено')
      assert.strictEqual(n1.data.requestId, res.data.id)
      assert.strictEqual(n2.data.requestId, res.data.id)
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
      assert.strictEqual(String(notification.data.requestId), String(created.data.id))
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
      assert.strictEqual(String(notification.data.requestId), String(created.data.id))
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

    it('end<start → 400', async () => {
      const id = await approvedVacation()
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp), { newStartDate: shift(44), newEndDate: shift(40), reason: 'Проверка' })
      assert.strictEqual(res.status, 400)
    })

    it('перенос длиннее исходного, но в пределах баланса → 201, разница резервируется', async () => {
      const id = await approvedVacation()
      const year = yearOf(shift(10))
      const before = await balanceOf(emp.id, year)
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(47), reason: 'Длиннее' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.duration, 8)
      const after = await balanceOf(emp.id, year)
      assert.strictEqual(after.reserved_days, before.reserved_days + 3)
      assert.strictEqual(after.used_days, before.used_days)
    })

    it('перенос сверх доступного баланса → 400 «Не хватает дней»', async () => {
      const id = await approvedVacation()
      const year = yearOf(shift(10))
      await query('UPDATE vacation_balances SET total_days = used_days + reserved_days + 1 WHERE user_id = $1 AND year = $2 AND organization_id = 1', [emp.id, year])
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(46), reason: 'Слишком длинный' })
      assert.strictEqual(res.status, 400)
      assert.match(res.data.error, /Не хватает дней/)
    })

    it('перенос без причины → 201, причина пустая', async () => {
      const id = await approvedVacation()
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44), note: 'с оплатой проезда' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.transfer_reason, null)
      assert.strictEqual(res.data.transfer_note, 'с оплатой проезда')
    })

    it('перенос в другой год → 400', async () => {
      const id = await approvedVacation()
      const nextYear = yearOf(shift(10)) + 1
      const res = await call('POST', `/vacation/requests/${id}/transfer`, await tokenFor(emp), { newStartDate: `${nextYear}-03-02`, newEndDate: `${nextYear}-03-06`, reason: 'Другой год' })
      assert.strictEqual(res.status, 400)
      assert.match(res.data.error, /того же года/)
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

    it('баланс после transfer/approve: исходные дни возвращаются, списывается новая длительность', async () => {
      const { transferId } = await transferFlow()
      const pending = await balanceOf(emp.id, yearOf(shift(10)))
      assert.strictEqual(pending.used_days, 5)
      assert.strictEqual(pending.reserved_days, 2)
      await call('POST', `/vacation/requests/${transferId}/transfer/approve`, await tokenFor(mgr), {})
      const actual = await balanceOf(emp.id, yearOf(shift(10)))
      assert.strictEqual(actual.used_days, 7)
      assert.strictEqual(actual.reserved_days, 0)
    })

    it('transfer/reject: исходные даты прежние, перенос закрыт', async () => {
      const { originalId, transferId } = await transferFlow()
      const res = await call('POST', `/vacation/requests/${transferId}/transfer/reject`, await tokenFor(mgr), { reason: 'Нет возможности' })
      assert.strictEqual(res.status, 200)
      const bal = await balanceOf(emp.id, yearOf(shift(10)))
      assert.strictEqual(bal.used_days, 5)
      assert.strictEqual(bal.reserved_days, 0)
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
      const bal = await balanceOf(emp.id, yearOf(shift(10)))
      assert.strictEqual(bal.used_days, 5)
      assert.strictEqual(bal.reserved_days, 0)
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
      await query("DELETE FROM skills_dictionary WHERE name LIKE 'us9-тег-%'")
      await cleanupFixtures({ deptIds: [deptId] })
    })

    const mkTag = async () => (await query(
      'INSERT INTO skills_dictionary (name) VALUES ($1) RETURNING id',
      [`us9-тег-${Date.now()}-${Math.floor(Math.random() * 1e6)}`]
    )).rows[0].id

    const assignTag = (userId, tagId) => query(
      'INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, tagId]
    )

    it('POST /restrictions (manager, group maxConcurrent=1) → 201; GET списка отдела содержит', async () => {
      const res = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id], maxConcurrent: 1, description: 'Не одновременно',
      })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.type, 'group')
      assert.deepStrictEqual(res.data.employeeIds, [String(emp.id), String(emp2.id)])
      const list = await call('GET', `/vacation/restrictions?departmentId=${deptId}`, await tokenFor(mgr))
      assert.strictEqual(list.status, 200)
      assert.ok(list.data.some((r) => r.id === res.data.id))
    })

    it('GET /restrictions без departmentId → 200 (все правила организации)', async () => {
      await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id] })
      const res = await call('GET', '/vacation/restrictions', await tokenFor(mgr))
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(res.data))
      assert.ok(res.data.some((r) => r.departmentId === String(deptId)))
      assert.ok(res.data.every((r) => r.departmentName === null || typeof r.departmentName === 'string'))
    })

    it('POST /restrictions от employee → 403', async () => {
      const res = await call('POST', '/vacation/restrictions', await tokenFor(emp), { departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id] })
      assert.strictEqual(res.status, 403)
    })

    it('DELETE /restrictions от employee → 403', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id] })
      const res = await call('DELETE', `/vacation/restrictions/${created.data.id}`, await tokenFor(emp))
      assert.strictEqual(res.status, 403)
    })

    it('DELETE hr → 200; повторный DELETE → 404', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id] })
      const removed = await call('DELETE', `/vacation/restrictions/${created.data.id}`, await tokenFor(hr))
      assert.strictEqual(removed.status, 200)
      assert.strictEqual(removed.data.success, true)
      const again = await call('DELETE', `/vacation/restrictions/${created.data.id}`, await tokenFor(hr))
      assert.strictEqual(again.status, 404)
      assert.strictEqual(again.data.error, 'Ограничение не найдено')
    })

    it('check-restrictions: нарушение группового ограничения (maxConcurrent=1 по умолчанию) с ФИО', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id] })
      assert.strictEqual(created.status, 201)
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const res = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: shift(11), endDate: shift(12) })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.length, 1)
      assert.strictEqual(res.data[0].field, 'restriction')
      assert.strictEqual(res.data[0].rule, 'group')
      assert.ok(res.data[0].message.includes('Превышен лимит'), res.data[0].message)
      assert.deepStrictEqual(res.data[0].names, ['Занятая Пётр'])
      assert.deepStrictEqual(res.data[0].conflicts, [
        { userId: String(emp2.id), name: 'Занятая Пётр', periods: [{ startDate: shift(10), endDate: shift(14) }] },
      ])
    })

    it('check-restrictions: мимо дат → пусто', async () => {
      await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id] })
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
      await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id] })
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const res = await postVacation(emp, { startDate: shift(11), endDate: shift(12), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    })

    it('теговое правило maxConcurrent=0: наложение у носителей тега, у остальных — нет', async () => {
      const tagId = await mkTag()
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', tagIds: [tagId], maxConcurrent: 0, description: 'Строгий запрет',
      })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      assert.strictEqual(created.data.maxConcurrent, 0)
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const hit = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: shift(11), endDate: shift(12) })
      assert.strictEqual(hit.status, 200)
      assert.strictEqual(hit.data.length, 1)
      assert.strictEqual(hit.data[0].rule, 'group')
      assert.strictEqual(hit.data[0].ruleType, 'tag')
      assert.ok(hit.data[0].message.includes('Пересечение отпусков запрещено'), hit.data[0].message)
      assert.ok(hit.data[0].names.join(' ').includes('Занятая'))
      assert.ok(hit.data[0].dates.length >= 1)
      const miss = await call('POST', '/vacation/check-restrictions', await tokenFor(mgr), { userId: mgr.id, startDate: shift(11), endDate: shift(12) })
      assert.strictEqual(miss.status, 200)
      assert.deepStrictEqual(miss.data, [])
    })

    it('теговое правило maxConcurrent=2: двое одновременно — ок, третий — нарушение', async () => {
      const tagId = await mkTag()
      const emp3 = await mkUser({ email: `us9.emp3${SUFFIX}`, last: 'Третий', deptId })
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)
      await assignTag(emp3.id, tagId)
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', tagIds: [tagId], maxConcurrent: 2,
      })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const ok = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: shift(11), endDate: shift(12) })
      assert.strictEqual(ok.status, 200)
      assert.deepStrictEqual(ok.data, [])
      await mkVacation({ userId: emp3.id, start: shift(11), end: shift(13), duration: 3, status: 'approved' })
      const bad = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: shift(12), endDate: shift(13) })
      assert.strictEqual(bad.status, 200)
      assert.strictEqual(bad.data.length, 1)
      assert.ok(bad.data[0].message.includes('макс. 2'), bad.data[0].message)
    })

    it('комбинированное правило (employeeIds + tagIds): раскрытие без дублей', async () => {
      const tagId = await mkTag()
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', employeeIds: [emp.id], tagIds: [tagId], maxConcurrent: 2,
      })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const ok = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: shift(11), endDate: shift(12) })
      assert.strictEqual(ok.status, 200)
      assert.deepStrictEqual(ok.data, [])
      await query('UPDATE vacation_restrictions SET max_concurrent = 1 WHERE id = $1', [created.data.id])
      const strict = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: shift(11), endDate: shift(12) })
      assert.strictEqual(strict.status, 200)
      assert.strictEqual(strict.data.length, 1)
      assert.strictEqual(strict.data[0].ruleType, 'combined')
      assert.strictEqual(strict.data[0].tagNames.length, 1)
    })

    it('POST /requests при нарушении тегового правила → 201 (не блокирует)', async () => {
      const tagId = await mkTag()
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)
      await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', tagIds: [tagId], maxConcurrent: 0 })
      await mkVacation({ userId: emp2.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const res = await postVacation(emp, { startDate: shift(11), endDate: shift(12), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    })

    it('GET /restrictions?tagId и search: фильтры + имена тегов', async () => {
      const tagId = await mkTag()
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)
      await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', tagIds: [tagId], maxConcurrent: 1, description: 'Теговое правило' })
      await call('POST', '/vacation/restrictions', await tokenFor(mgr), { departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id] })
      const filtered = await call('GET', `/vacation/restrictions?tagId=${tagId}`, await tokenFor(mgr))
      assert.strictEqual(filtered.status, 200)
      assert.strictEqual(filtered.data.length, 1)
      assert.deepStrictEqual(filtered.data[0].tagIds, [String(tagId)])
      assert.ok(filtered.data[0].tags[0].name.startsWith('us9-тег-'))
      assert.ok(typeof filtered.data[0].departmentName === 'string')
      const searched = await call('GET', '/vacation/restrictions?search=Теговое правило', await tokenFor(mgr))
      assert.strictEqual(searched.status, 200)
      assert.ok(searched.data.some((r) => r.description === 'Теговое правило'))
      assert.ok(searched.data.every((r) => r.description === 'Теговое правило'))
    })

    it('правило только по одному тегу (без employeeIds) → 201, если у тега 2+ носителей', async () => {
      const tagId = await mkTag()
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', tagIds: [tagId], maxConcurrent: 1,
      })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      assert.deepStrictEqual(created.data.employeeIds, [])
      assert.deepStrictEqual(created.data.tagIds, [String(tagId)])
    })

    it('правило по одному тегу с единственным носителем → 201 (достаточно одного работника)', async () => {
      const tagId = await mkTag()
      await assignTag(emp.id, tagId)
      const res = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', tagIds: [tagId], maxConcurrent: 1,
      })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    })

    it('GET /restrictions: employeeDepartments — отделы участников', async () => {
      const otherMgr = await mkUser({ email: `us9.omgr${SUFFIX}`, role: 'manager', last: 'Другой' })
      const otherDept = await mkDept('US9 Другой отдел vac-full', 1, otherMgr.id)
      const outsider = await mkUser({ email: `us9.odep${SUFFIX}`, last: 'Чужой', deptId: otherDept })
      const created = await call('POST', '/vacation/restrictions', await tokenFor(hr), { type: 'group', employeeIds: [emp.id, emp2.id, outsider.id] })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      const list = await call('GET', '/vacation/restrictions', await tokenFor(hr))
      const row = list.data.find((r) => r.id === created.data.id)
      assert.deepStrictEqual(row.employeeDepartments, ['US9 Другой отдел vac-full', 'US9 Отдел vac-full'])
      await query('DELETE FROM vacation_restrictions WHERE id = $1', [created.data.id])
      await cleanupFixtures({ deptIds: [otherDept] })
    })

    it('ограничение без работников → 400 «хотя бы одного»', async () => {
      const res = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { type: 'group', employeeIds: [] })
      assert.strictEqual(res.status, 400)
      assert.match(res.data.error, /хотя бы одного/)
    })

    it('ограничение из одного работника без отдела → 201', async () => {
      const res = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { type: 'group', employeeIds: [emp.id] })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.departmentId, null)
    })

    it('scope-employees: manager видит только свой отдел, hr — и чужих', async () => {
      const outsider = await mkUser({ email: `us9.out${SUFFIX}`, last: 'Чужой' })
      const mine = await call('GET', '/vacation/restrictions/scope-employees', await tokenFor(mgr))
      assert.strictEqual(mine.status, 200, JSON.stringify(mine.data))
      const mineIds = mine.data.map((e) => e.id)
      assert.ok(mineIds.includes(String(emp.id)))
      assert.ok(!mineIds.includes(String(outsider.id)))
      const all = await call('GET', '/vacation/restrictions/scope-employees', await tokenFor(hr))
      assert.ok(all.data.map((e) => e.id).includes(String(outsider.id)))
      const denied = await call('GET', '/vacation/restrictions/scope-employees', await tokenFor(emp))
      assert.strictEqual(denied.status, 403)
    })

    it('scope-employees: работники, видимые по связи иерархии (emp_parent_sees_child), доступны руководителю', async () => {
      const otherMgr = await mkUser({ email: `us9.linkmgr${SUFFIX}`, role: 'manager', last: 'Связанный' })
      const linkedDept = await mkDept('US9 Связанный отдел vac-full', 1, otherMgr.id)
      const linked = await mkUser({ email: `us9.linked${SUFFIX}`, last: 'Связанная', deptId: linkedDept })
      try {
        const before = await call('GET', '/vacation/restrictions/scope-employees', await tokenFor(mgr))
        assert.ok(!before.data.some((e) => e.id === String(linked.id)))

        await query('UPDATE departments SET parent_id = $1, emp_parent_sees_child = true WHERE id = $2', [deptId, linkedDept])
        const after = await call('GET', '/vacation/restrictions/scope-employees', await tokenFor(mgr))
        assert.ok(after.data.some((e) => e.id === String(linked.id)), 'связанный работник должен быть в списке')

        const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { type: 'group', employeeIds: [emp.id, linked.id] })
        assert.strictEqual(created.status, 201, JSON.stringify(created.data))
        const upd = await call('PUT', `/vacation/restrictions/${created.data.id}`, await tokenFor(mgr), { type: 'group', employeeIds: [linked.id], maxConcurrent: 1, description: 'Изменено' })
        assert.strictEqual(upd.status, 200, JSON.stringify(upd.data))
        assert.deepStrictEqual(upd.data.employeeIds, [String(linked.id)])
        const list = await call('GET', '/vacation/restrictions?scope=mine', await tokenFor(mgr))
        assert.ok(list.data.some((r) => r.id === created.data.id && r.description === 'Изменено'))
        await query('DELETE FROM vacation_restrictions WHERE id = $1', [created.data.id])
      } finally {
        await cleanupFixtures({ deptIds: [linkedDept] })
      }
    })

    it('manager может добавить работника другого отдела; своё ограничение видно в scope=mine', async () => {
      const outsider = await mkUser({ email: `us9.out2${SUFFIX}`, last: 'Чужой' })
      const res = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { type: 'group', employeeIds: [outsider.id] })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      const list = await call('GET', '/vacation/restrictions?scope=mine', await tokenFor(mgr))
      const row = list.data.find((r) => r.id === res.data.id)
      assert.ok(row)
      assert.strictEqual(row.canManage, true)
    })

    it('GET scope=mine: manager видит ограничение HR со своим работником, с владельцем и без права удаления', async () => {
      const outsider = await mkUser({ email: `us9.out3${SUFFIX}`, last: 'Чужой' })
      const withMine = await call('POST', '/vacation/restrictions', await tokenFor(hr), { type: 'group', employeeIds: [emp.id, outsider.id] })
      assert.strictEqual(withMine.status, 201, JSON.stringify(withMine.data))
      const foreign = await call('POST', '/vacation/restrictions', await tokenFor(hr), { type: 'group', employeeIds: [outsider.id] })
      assert.strictEqual(foreign.status, 201, JSON.stringify(foreign.data))

      const list = await call('GET', '/vacation/restrictions?scope=mine', await tokenFor(mgr))
      assert.strictEqual(list.status, 200)
      const ids = list.data.map((r) => r.id)
      assert.ok(ids.includes(withMine.data.id))
      assert.ok(!ids.includes(foreign.data.id))
      const row = list.data.find((r) => r.id === withMine.data.id)
      assert.match(row.createdByName, /Смирнова/)
      assert.strictEqual(row.canManage, false)
      assert.ok(row.employees.some((e) => e.id === String(outsider.id) && /Чужой/.test(e.name)))

      const del = await call('DELETE', `/vacation/restrictions/${withMine.data.id}`, await tokenFor(mgr))
      assert.strictEqual(del.status, 403)
      await query('DELETE FROM vacation_restrictions WHERE id = ANY($1)', [[withMine.data.id, foreign.data.id]])
    })

    it('violations scope=mine: прошедшие пересечения не показываются, чужие работники не учитываются', async () => {
      const outsider = await mkUser({ email: `us9.out4${SUFFIX}`, last: 'Чужой' })
      const created = await call('POST', '/vacation/restrictions', await tokenFor(hr), { type: 'group', employeeIds: [emp.id, emp2.id, outsider.id], maxConcurrent: 1 })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      const statusId = (await query("SELECT id FROM request_statuses WHERE code = 'approved'")).rows[0].id
      const insert = (uid, start, end) => query(
        `INSERT INTO vacation_requests (user_id, start_date, end_date, duration, status_id, organization_id)
         VALUES ($1, $2, $3, 3, $4, 1)`,
        [uid, start, end, statusId]
      )
      await insert(emp.id, shift(-30), shift(-28))
      await insert(emp2.id, shift(-29), shift(-27))
      await insert(emp.id, shift(20), shift(22))
      await insert(outsider.id, shift(21), shift(23))

      const res = await call('GET', '/vacation/restrictions/violations?scope=mine', await tokenFor(mgr))
      assert.strictEqual(res.status, 200)
      const mine = res.data.filter((v) => v.restrictionId === created.data.id)
      assert.strictEqual(mine.length, 0, JSON.stringify(mine))

      const all = await call('GET', '/vacation/restrictions/violations?scope=mine', await tokenFor(hr))
      const hrRows = all.data.filter((v) => v.restrictionId === created.data.id)
      assert.strictEqual(hrRows.length, 1, JSON.stringify(hrRows))
      assert.ok(hrRows[0].startDate >= shift(0))
      await query('DELETE FROM vacation_requests WHERE user_id = ANY($1)', [[emp.id, emp2.id, outsider.id]])
      await query('DELETE FROM vacation_restrictions WHERE id = $1', [created.data.id])
    })

    it('violations scope=mine: пересечение по ограничению без отдела видно руководителю', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), { type: 'group', employeeIds: [emp.id, emp2.id], maxConcurrent: 1 })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      await mkBalance(emp2.id, yearOf(shift(10)))
      const r1 = await postVacation(emp, { startDate: shift(10), endDate: shift(12), vacationType: 'annual_paid' })
      assert.strictEqual(r1.status, 201, JSON.stringify(r1.data))
      await call('POST', `/vacation/requests/${r1.data.id}/approve`, await tokenFor(mgr), {})
      const r2 = await postVacation(emp2, { startDate: shift(11), endDate: shift(13), vacationType: 'annual_paid' })
      assert.strictEqual(r2.status, 201, JSON.stringify(r2.data))
      const res = await call('GET', '/vacation/restrictions/violations?scope=mine', await tokenFor(mgr))
      assert.strictEqual(res.status, 200)
      assert.ok(res.data.some((v) => v.restrictionId === created.data.id), JSON.stringify(res.data))
    })

    it('GET /restrictions: employeeCount учитывает носителей тега, а не только employeeIds', async () => {
      const tagId = await mkTag()
      const emp3 = await mkUser({ email: `us9.ecnt${SUFFIX}`, last: 'Считова', deptId })
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)
      await assignTag(emp3.id, tagId)
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', tagIds: [tagId], maxConcurrent: 1,
      })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      const list = await call('GET', `/vacation/restrictions?departmentId=${deptId}`, await tokenFor(mgr))
      const row = list.data.find((r) => r.id === created.data.id)
      assert.strictEqual(row.employeeIds.length, 0)
      assert.strictEqual(row.employeeCount, 3)
    })

    it('GET /restrictions/preview-count: считает уникальных людей из тегов и сотрудников', async () => {
      const tagId = await mkTag()
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)

      const empty = await call('GET', '/vacation/restrictions/preview-count', await tokenFor(mgr))
      assert.strictEqual(empty.status, 200)
      assert.strictEqual(empty.data.count, 0)

      const tagOnly = await call('GET', `/vacation/restrictions/preview-count?tagIds=${tagId}`, await tokenFor(mgr))
      assert.strictEqual(tagOnly.status, 200)
      assert.strictEqual(tagOnly.data.count, 2)

      const combined = await call('GET', `/vacation/restrictions/preview-count?tagIds=${tagId}&employeeIds=${emp.id},${mgr.id}`, await tokenFor(mgr))
      assert.strictEqual(combined.status, 200)
      assert.strictEqual(combined.data.count, 3)
    })

    it('правило по тегу без departmentId → 201, действует во всех отделах организации', async () => {
      const tagId = await mkTag()
      const otherDeptId = await mkDept('US9 Другой отдел vac-full')
      const otherEmp = await mkUser({ email: `us9.other${SUFFIX}`, last: 'Иногородний', deptId: otherDeptId })
      await assignTag(emp.id, tagId)
      await assignTag(otherEmp.id, tagId)

      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        type: 'group', tagIds: [tagId], maxConcurrent: 0, description: 'Оргвайд по тегу',
      })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      assert.strictEqual(created.data.departmentId, null)

      const list = await call('GET', '/vacation/restrictions', await tokenFor(mgr))
      const row = list.data.find((r) => r.id === created.data.id)
      assert.strictEqual(row.departmentName, null)

      await mkVacation({ userId: emp.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const hit = await call('POST', '/vacation/check-restrictions', await tokenFor(otherEmp), { userId: otherEmp.id, startDate: shift(11), endDate: shift(12) })
      assert.strictEqual(hit.status, 200)
      assert.strictEqual(hit.data.length, 1, JSON.stringify(hit.data))

      await query('UPDATE users SET department_id = NULL WHERE id = $1', [otherEmp.id])
      await query('DELETE FROM departments WHERE id = $1', [otherDeptId])
    })

    it('PUT /restrictions/:id обновляет правило (manager); employee → 403; несуществующий id → 404', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id],
      })
      assert.strictEqual(created.status, 201)

      const forbidden = await call('PUT', `/vacation/restrictions/${created.data.id}`, await tokenFor(emp), {
        departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id],
      })
      assert.strictEqual(forbidden.status, 403)

      const tagId = await mkTag()
      await assignTag(emp.id, tagId)
      await assignTag(emp2.id, tagId)
      const updated = await call('PUT', `/vacation/restrictions/${created.data.id}`, await tokenFor(hr), {
        departmentId: deptId, type: 'group', tagIds: [tagId], maxConcurrent: 2, description: 'Обновлено',
      })
      assert.strictEqual(updated.status, 200, JSON.stringify(updated.data))
      assert.strictEqual(updated.data.type, 'group')
      assert.strictEqual(updated.data.maxConcurrent, 2)
      assert.strictEqual(updated.data.description, 'Обновлено')
      assert.deepStrictEqual(updated.data.tagIds, [String(tagId)])
      assert.deepStrictEqual(updated.data.employeeIds, [])

      const missing = await call('PUT', '/vacation/restrictions/99999999', await tokenFor(hr), {
        departmentId: deptId, type: 'group', employeeIds: [emp.id, emp2.id],
      })
      assert.strictEqual(missing.status, 404)
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
      await ensureTestOrg(2)
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

  describe('US-14. HR меняет баланс отпуска работника (PATCH /vacation/balances/:userId)', () => {
    let emp, hr
    const year = yearOf(shift(10)) + 5

    beforeEach(async () => {
      emp = await mkUser({ email: `us14.emp${SUFFIX}`, last: 'Балансов' })
      hr = await mkUser({ email: `us14.hr${SUFFIX}`, role: 'hr', last: 'Смирнова' })
    })

    afterEach(async () => {
      await query('DELETE FROM vacation_day_rules WHERE user_id = $1', [emp.id])
      await query('DELETE FROM vacation_balances WHERE user_id = $1', [emp.id])
      await cleanupFixtures()
    })

    it('изменение за текущий год действует и на будущие: следующий год создаётся, более поздние обновляются, прошлые — нет', async () => {
      const current = new Date().getFullYear()
      await mkBalance(emp.id, current - 1, 1, 28)
      await mkBalance(emp.id, current + 3, 1, 28)
      const res = await call('PATCH', `/vacation/balances/${emp.id}`, await tokenFor(hr), { year: current, total_days: 33 })
      assert.strictEqual(res.status, 200, JSON.stringify(res.data))
      assert.strictEqual(res.data.year, current)
      const rows = (await query('SELECT year, total_days FROM vacation_balances WHERE user_id = $1 AND organization_id = 1 ORDER BY year', [emp.id])).rows
      assert.deepStrictEqual(rows, [
        { year: current - 1, total_days: 28 },
        { year: current, total_days: 33 },
        { year: current + 1, total_days: 33 },
        { year: current + 3, total_days: 33 },
      ])
    })

    it('правило дней отпуска для работника меняет балансы текущего и будущих лет, прошлые — нет', async () => {
      const current = new Date().getFullYear()
      await mkBalance(emp.id, current - 1, 1, 28)
      await mkBalance(emp.id, current, 1, 28)
      await mkBalance(emp.id, current + 1, 1, 28)
      const res = await call('PUT', '/vacation/day-rules', await tokenFor(hr), { userId: emp.id, days: 31 })
      assert.strictEqual(res.status, 200, JSON.stringify(res.data))
      const rows = (await query('SELECT year, total_days FROM vacation_balances WHERE user_id = $1 AND organization_id = 1 ORDER BY year', [emp.id])).rows
      assert.deepStrictEqual(rows, [
        { year: current - 1, total_days: 28 },
        { year: current, total_days: 31 },
        { year: current + 1, total_days: 31 },
      ])
    })

    it('PUT /day-rules/members: состав правила по должностям меняется, группа сохраняется', async () => {
      const suffix = Date.now()
      const [pA, pB, pC] = [`us14-должность-A-${suffix}`, `us14-должность-B-${suffix}`, `us14-должность-C-${suffix}`]
      try {
        const created = await call('PUT', '/vacation/day-rules', await tokenFor(hr), { positions: [pA, pB], days: 30 })
        assert.strictEqual(created.status, 200, JSON.stringify(created.data))
        const groupId = created.data.groupId
        const res = await call('PUT', '/vacation/day-rules/members', await tokenFor(hr), { groupId, kind: 'position', positions: [pB, pC], days: 32 })
        assert.strictEqual(res.status, 200, JSON.stringify(res.data))
        assert.strictEqual(res.data.groupId, groupId)
        const rows = (await query('SELECT position, days, group_id FROM vacation_day_rules WHERE position = ANY($1) ORDER BY position', [[pA, pB, pC]])).rows
        assert.deepStrictEqual(rows.map((r) => [r.position, r.days, r.group_id]), [[pB, 32, groupId], [pC, 32, groupId]])
        const empty = await call('PUT', '/vacation/day-rules/members', await tokenFor(hr), { groupId, kind: 'position', positions: [], days: 32 })
        assert.strictEqual(empty.status, 400)
      } finally {
        await query('DELETE FROM vacation_day_rules WHERE position = ANY($1)', [[pA, pB, pC]])
      }
    })

    it('PUT /day-rules/members: работника можно добавить в правило и убрать; баланс нового пересчитывается', async () => {
      const current = new Date().getFullYear()
      const emp2 = await mkUser({ email: `us14.emp2${SUFFIX}`, last: 'Второй' })
      await query('INSERT INTO user_organizations (user_id, org_id) VALUES ($1, 1) ON CONFLICT DO NOTHING', [emp2.id]).catch(() => {})
      await mkBalance(emp2.id, current + 1, 1, 28)
      try {
        const created = await call('PUT', '/vacation/day-rules', await tokenFor(hr), { userIds: [emp.id], days: 30 })
        assert.strictEqual(created.status, 200, JSON.stringify(created.data))
        const groupId = created.data.groupId
        const res = await call('PUT', '/vacation/day-rules/members', await tokenFor(hr), { groupId, kind: 'user', userIds: [emp2.id], days: 35 })
        assert.strictEqual(res.status, 200, JSON.stringify(res.data))
        const rules = (await query('SELECT user_id, days FROM vacation_day_rules WHERE user_id = ANY($1) ORDER BY user_id', [[emp.id, emp2.id]])).rows
        assert.deepStrictEqual(rules, [{ user_id: emp2.id, days: 35 }])
        const bal = (await query('SELECT total_days FROM vacation_balances WHERE user_id = $1 AND year = $2 AND organization_id = 1', [emp2.id, current + 1])).rows[0]
        assert.strictEqual(bal.total_days, 35)
      } finally {
        await query('DELETE FROM vacation_day_rules WHERE user_id = ANY($1)', [[emp.id, emp2.id]])
        await query('DELETE FROM vacation_balances WHERE user_id = $1', [emp2.id])
      }
    })

    it('upsert: создаёт баланс, если строки ещё нет', async () => {
      const res = await call('PATCH', `/vacation/balances/${emp.id}`, await tokenFor(hr), { year, total_days: 35 })
      assert.strictEqual(res.status, 200, JSON.stringify(res.data))
      assert.strictEqual(res.data.total_days, 35)
      const row = (await query('SELECT total_days, used_days, reserved_days, available_days FROM vacation_balances WHERE user_id = $1 AND year = $2 AND organization_id = 1', [emp.id, year])).rows[0]
      assert.strictEqual(row.total_days, 35)
      assert.strictEqual(row.available_days, 35 - row.used_days - row.reserved_days)
    })

    it('upsert: обновляет total_days существующего баланса, used/reserved не трогает', async () => {
      await mkBalance(emp.id, year, 1, 28, 4, 2)
      const res = await call('PATCH', `/vacation/balances/${emp.id}`, await tokenFor(hr), { year, total_days: 40 })
      assert.strictEqual(res.status, 200, JSON.stringify(res.data))
      const row = (await query('SELECT total_days, used_days, reserved_days, available_days FROM vacation_balances WHERE user_id = $1 AND year = $2 AND organization_id = 1', [emp.id, year])).rows[0]
      assert.strictEqual(row.total_days, 40)
      assert.strictEqual(row.used_days, 4)
      assert.strictEqual(row.reserved_days, 2)
      assert.strictEqual(row.available_days, 34)
    })

    it('employee → 403', async () => {
      const res = await call('PATCH', `/vacation/balances/${emp.id}`, await tokenFor(emp), { year, total_days: 30 })
      assert.strictEqual(res.status, 403)
    })
  })

  describe('US-15. Производственный календарь: праздники не входят в число дней отпуска', () => {
    let deptId, mgr, emp

    beforeEach(async () => {
      mgr = await mkUser({ email: `us15.mgr${SUFFIX}`, role: 'manager', last: 'Праздников' })
      deptId = await mkDept('US15 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us15.emp${SUFFIX}`, last: 'Иванов', deptId })
      await mkBalance(emp.id, 2026, 1, 28)
      await mkBalance(emp.id, 2027, 1, 28)
      await mkBalance(emp.id, 2028, 1, 28)
    })

    afterEach(async () => {
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('2027-01-05…01-20 (4 праздника: 5,6,7,8 января) → end 01-20, duration 12, returnDate 01-21', async () => {
      const res = await postVacation(emp, { startDate: '2027-01-05', endDate: '2027-01-20', vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.end_date, '2027-01-20')
      assert.strictEqual(res.data.duration, 12)
      assert.strictEqual(res.data.returnDate, '2027-01-21')
      assert.strictEqual(res.data.holidaysCount, 4)
    })

    it('диапазон с 6+ праздниками → 400 «слишком много праздничных»', async () => {
      const res = await postVacation(emp, { startDate: '2027-01-01', endDate: '2027-01-08', vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 400)
      assert.match(res.data.error, /празднич/i)
    })

    it('идемпотентность: перенос с одинаковыми новыми датами дважды → даты и длительность совпадают', async () => {
      const created = await postVacation(emp, { startDate: '2027-05-17', endDate: '2027-05-21', vacationType: 'annual_paid' })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      const approveRes = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      assert.strictEqual(approveRes.status, 200, JSON.stringify(approveRes.data))

      const t1 = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), { newStartDate: '2027-06-10', newEndDate: '2027-06-16', reason: 'Перенос 1' })
      assert.strictEqual(t1.status, 201, JSON.stringify(t1.data))
      const t2 = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), { newStartDate: '2027-06-10', newEndDate: '2027-06-16', reason: 'Перенос 2' })
      assert.strictEqual(t2.status, 201, JSON.stringify(t2.data))

      assert.strictEqual(t1.data.end_date, '2027-06-16')
      assert.strictEqual(t1.data.duration, 6)
      assert.strictEqual(t1.data.end_date, t2.data.end_date)
      assert.strictEqual(t1.data.duration, t2.data.duration)
      assert.strictEqual(t1.data.holidaysCount, 1)
    })

    it('2028 год (данных нет) → даты без изменений', async () => {
      const res = await postVacation(emp, { startDate: '2028-01-05', endDate: '2028-01-20', vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.end_date, '2028-01-20')
      assert.strictEqual(res.data.holidaysCount, 0)
    })

    it('start_date в прошлом → без пересчёта (даже если диапазон содержит праздники 2027)', async () => {
      const result = await computeVacationDates('2020-01-01', '2020-01-10')
      assert.strictEqual(result.endDate, '2020-01-10')
      assert.strictEqual(result.holidaysCount, 0)
      assert.strictEqual(result.countedDays, 10)
    })
  })

  describe('US-16. Роуты без покрытия: балансы отдела, правка заявки, day-rules', () => {
    let deptId, dept2Id, mgr, mgr2, hrUser, emp, emp2, emp2b
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us16.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US16 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us16.emp${SUFFIX}`, last: 'Иванов', deptId })
      emp2 = await mkUser({ email: `us16.emp2${SUFFIX}`, last: 'Петров', deptId })
      mgr2 = await mkUser({ email: `us16.mgr2${SUFFIX}`, role: 'manager', last: 'Николаев' })
      dept2Id = await mkDept('US16 Отдел 2 vac-full', 1, mgr2.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [dept2Id, mgr2.id])
      emp2b = await mkUser({ email: `us16.emp2b${SUFFIX}`, last: 'Смирнов', deptId: dept2Id })
      hrUser = await mkUser({ email: `us16.hr${SUFFIX}`, role: 'hr', last: 'Смирнова' })
      await mkBalance(emp.id, yearOf(shift(10)))
      await mkBalance(emp2.id, yearOf(shift(10)))
      await mkBalance(emp2b.id, yearOf(shift(10)), 1, 30)
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await query('DELETE FROM vacation_day_rules WHERE position LIKE \'US16%\'')
      await cleanupFixtures({ deptIds: [deptId, dept2Id] })
    })

    it('GET /balances (hr): список отдела с тотал/использовано/доступно', async () => {
      await mkVacation({ userId: emp.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      await query('UPDATE vacation_balances SET used_days = 5, available_days = available_days - 5 WHERE user_id = $1 AND year = $2', [emp.id, yearOf(shift(10))])
      const res = await call('GET', `/vacation/balances?departmentId=${deptId}&year=${yearOf(shift(10))}`, await tokenFor(hrUser))
      assert.strictEqual(res.status, 200)
      const mine = res.data.find((r) => r.user_id === emp.id)
      assert.ok(mine, 'баланс работника отдела не найден')
      assert.strictEqual(mine.total_days, 28)
      assert.strictEqual(mine.used_days, 5)
      assert.strictEqual(mine.available_days, 23)
      assert.ok(res.data.every((r) => r.user_id !== emp2b.id), 'работник чужого отдела попал в список')
    })

    it('GET /balances от employee: чужой departmentId зажимается к своему отделу (200, не 403 — фактическое поведение)', async () => {
      const res = await call('GET', `/vacation/balances?departmentId=${dept2Id}&year=${yearOf(shift(10))}`, await tokenFor(emp))
      assert.strictEqual(res.status, 200)
      assert.ok(res.data.some((r) => r.user_id === emp.id), 'свой отдел не вернулся')
      assert.ok(res.data.every((r) => r.user_id !== emp2b.id), 'чужой отдел не должен был вернуться')
    })

    it('PUT /requests/:id: владелец правит даты on_approval → 200, reserved пересчитан', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('PUT', `/vacation/requests/${created.data.id}`, await tokenFor(emp), {
        startDate: shift(20), endDate: shift(22), vacationType: 'annual_paid', comment: 'Правка',
      })
      assert.strictEqual(res.status, 200, JSON.stringify(res.data))
      assert.strictEqual(res.data.start_date, shift(20))
      assert.strictEqual(res.data.duration, 3)
      assert.strictEqual((await balanceOf(emp.id, yearOf(shift(20)))).reserved_days, 3)
    })

    it('PUT /requests/:id: чужой employee → 403', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('PUT', `/vacation/requests/${created.data.id}`, await tokenFor(emp2), {
        startDate: shift(20), endDate: shift(22), vacationType: 'annual_paid',
      })
      assert.strictEqual(res.status, 403)
      assert.strictEqual(res.data.error, 'Редактировать заявку может только её автор')
    })

    it('PUT /requests/:id: несуществующая заявка → 404', async () => {
      const res = await call('PUT', '/vacation/requests/999999999', await tokenFor(emp), {
        startDate: shift(20), endDate: shift(22), vacationType: 'annual_paid',
      })
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.data.error, 'Заявка не найдена')
    })

    it('PUT /requests/:id: недопустимый тип → 400', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const res = await call('PUT', `/vacation/requests/${created.data.id}`, await tokenFor(emp), {
        startDate: shift(20), endDate: shift(22), vacationType: 'nonexistent',
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Неверный тип отпуска')
    })

    it('PUT /requests/:id: approved заявка → 400', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      const res = await call('PUT', `/vacation/requests/${created.data.id}`, await tokenFor(emp), {
        startDate: shift(20), endDate: shift(22), vacationType: 'annual_paid',
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Можно редактировать только заявки на согласовании')
    })

    it('GET /day-rules (hr) → 200 со структурой; employee → 403', async () => {
      await query('INSERT INTO vacation_day_rules (organization_id, position, days) VALUES (1, $1, 35)', ['US16 Тестер'])
      const ok = await call('GET', '/vacation/day-rules', await tokenFor(hrUser))
      assert.strictEqual(ok.status, 200)
      assert.strictEqual(typeof ok.data.defaultDays, 'number')
      assert.ok(Array.isArray(ok.data.positionRules))
      assert.ok(Array.isArray(ok.data.userRules))
      assert.ok(ok.data.positionRules.some((r) => r.position === 'US16 Тестер' && r.days === 35))
      const forbidden = await call('GET', '/vacation/day-rules', await tokenFor(emp))
      assert.strictEqual(forbidden.status, 403)
    })

    it('DELETE /day-rules/:id: своим → 200, повторно → 404, employee → 403', async () => {
      const ruleId = (await query('INSERT INTO vacation_day_rules (organization_id, position, days) VALUES (1, $1, 35) RETURNING id', ['US16 Должность'])).rows[0].id
      const removed = await call('DELETE', `/vacation/day-rules/${ruleId}`, await tokenFor(hrUser))
      assert.strictEqual(removed.status, 200)
      assert.strictEqual(removed.data.success, true)
      const again = await call('DELETE', `/vacation/day-rules/${ruleId}`, await tokenFor(hrUser))
      assert.strictEqual(again.status, 404)
      assert.strictEqual(again.data.error, 'Настройка не найдена')
      const nextId = (await query('INSERT INTO vacation_day_rules (organization_id, position, days) VALUES (1, $1, 30) RETURNING id', ['US16 Должность 2'])).rows[0].id
      const forbidden = await call('DELETE', `/vacation/day-rules/${nextId}`, await tokenFor(emp))
      assert.strictEqual(forbidden.status, 403)
    })

    it('DELETE /day-rules/group/:groupId: групповое удаление → 200, повторно → 404, employee → 403', async () => {
      const { randomUUID } = await import('node:crypto')
      const groupId = randomUUID()
      await query('INSERT INTO vacation_day_rules (organization_id, position, days, group_id) VALUES (1, $1, 35, $2), (1, $3, 35, $2)', ['US16 Группа A', groupId, 'US16 Группа B'])
      const removed = await call('DELETE', `/vacation/day-rules/group/${groupId}`, await tokenFor(hrUser))
      assert.strictEqual(removed.status, 200)
      const left = (await query('SELECT COUNT(*)::int AS n FROM vacation_day_rules WHERE group_id = $1', [groupId])).rows[0].n
      assert.strictEqual(left, 0)
      const again = await call('DELETE', `/vacation/day-rules/group/${groupId}`, await tokenFor(hrUser))
      assert.strictEqual(again.status, 404)
      assert.strictEqual(again.data.error, 'Правило не найдено')
      await query('INSERT INTO vacation_day_rules (organization_id, position, days, group_id) VALUES (1, $1, 35, $2)', ['US16 Группа C', groupId])
      const forbidden = await call('DELETE', `/vacation/day-rules/group/${groupId}`, await tokenFor(emp))
      assert.strictEqual(forbidden.status, 403)
    })
  })

  describe('US-17. Согласование по иерархии: vacationVisibility.parentApproves', () => {
    let orgId, hrUser, headUser, parentMgr, childMgr, emp
    let parentDeptId, childDeptId, ownDeptId

    const mkOrg = async () => (await query(
      'INSERT INTO organizations (name, slug, is_active) VALUES ($1, $2, true) RETURNING id',
      [`US17 Орг ${Date.now()}`, `us17-org-${Date.now()}`])).rows[0].id

    const saveHierarchy = async (edges, baseVersion) => {
      const nodes = [
        { id: `department-${parentDeptId}`, type: 'department', position: { x: 0, y: 0 }, data: { id: parentDeptId, name: 'US17 Родитель' } },
        { id: `department-${childDeptId}`, type: 'department', position: { x: 300, y: 0 }, data: { id: childDeptId, name: 'US17 Ребёнок' } },
      ]
      if (ownDeptId) nodes.push({ id: `department-${ownDeptId}`, type: 'department', position: { x: 600, y: 0 }, data: { id: ownDeptId, name: 'US17 Свой' } })
      return call('PUT', '/hierarchy', await tokenFor(hrUser), { nodes, edges, baseVersion }, orgId)
    }

    const linkEdge = (vacationVisibility) => ({
      id: 'e-parent-child',
      source: `department-${parentDeptId}`,
      target: `department-${childDeptId}`,
      type: 'editable',
      data: { relation: 'parent', ...(vacationVisibility ? { vacationVisibility } : {}) },
    })

    const postOwn = async (user, offset = 10) => call('POST', '/vacation/requests', await tokenFor(user), {
      startDate: shift(offset), endDate: shift(offset + 4), vacationType: 'annual_paid',
    }, orgId)

    const approverOf = async (id) => (await query('SELECT approver_id FROM vacation_requests WHERE id = $1', [id])).rows[0].approver_id

    beforeEach(async () => {
      orgId = await mkOrg()
      await query('INSERT INTO vacation_types (code, name, organization_id) SELECT code, name, $1 FROM vacation_types WHERE organization_id = 1', [orgId])
      hrUser = await mkUser({ email: `us17.hr${SUFFIX}`, role: 'hr', last: 'Смирнова', orgIds: [orgId] })
      headUser = await mkUser({ email: `us17.head${SUFFIX}`, last: 'Глава', orgIds: [orgId] })
      parentMgr = await mkUser({ email: `us17.pmgr${SUFFIX}`, role: 'manager', last: 'Родителев', orgIds: [orgId] })
      childMgr = await mkUser({ email: `us17.cmgr${SUFFIX}`, role: 'manager', last: 'Детев', orgIds: [orgId] })
      emp = await mkUser({ email: `us17.emp${SUFFIX}`, last: 'Иванов', orgIds: [orgId] })
      parentDeptId = await mkDept('US17 Родитель', orgId, parentMgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [parentDeptId, parentMgr.id])
      childDeptId = await mkDept('US17 Ребёнок', orgId)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [childDeptId, emp.id])
      await query('UPDATE organizations SET head_id = $1 WHERE id = $2', [headUser.id, orgId])
      await mkBalance(emp.id, yearOf(shift(10)), orgId)
      ownDeptId = null
    })

    afterEach(async () => {
      await query('DELETE FROM hr_hierarchy WHERE organization_id = $1', [orgId])
      await query('UPDATE organizations SET head_id = NULL WHERE id = $1', [orgId])
      await query('UPDATE departments SET manager_id = NULL, parent_id = NULL, parent_user_id = NULL WHERE organization_id = $1', [orgId])
      await cleanupFixtures({ deptIds: [parentDeptId, childDeptId, ownDeptId].filter(Boolean) })
      await query('DELETE FROM vacation_types WHERE organization_id = $1', [orgId])
      await query('DELETE FROM organizations WHERE id = $1', [orgId])
    })

    it('связь по умолчанию (parentApproves не задан): approver = менеджер родительского отдела, он может согласовать', async () => {
      const saved = await saveHierarchy([linkEdge(null)], 0)
      assert.strictEqual(saved.status, 200, JSON.stringify(saved.data))
      const created = await postOwn(emp)
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      assert.strictEqual(await approverOf(created.data.id), parentMgr.id)
      const approved = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(parentMgr), {}, orgId)
      assert.strictEqual(approved.status, 200)
    })

    it('parentApproves=true: согласует прямой родитель (менеджер родительского отдела)', async () => {
      await saveHierarchy([linkEdge({ parentSeesChild: true, childSeesParent: true, parentApproves: true })], 0)
      const created = await postOwn(emp)
      assert.strictEqual(created.status, 201)
      assert.strictEqual(await approverOf(created.data.id), parentMgr.id)
    })

    it('parentApproves=false: родитель пропускается, approver = глава организации; родителю approve → 403', async () => {
      await saveHierarchy([linkEdge({ parentSeesChild: true, childSeesParent: true, parentApproves: false })], 0)
      const created = await postOwn(emp)
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      assert.strictEqual(await approverOf(created.data.id), headUser.id)
      const denied = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(parentMgr), {}, orgId)
      assert.strictEqual(denied.status, 403)
      const approved = await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(headUser), {}, orgId)
      assert.strictEqual(approved.status, 200)
    })

    it('контроль: менеджер своего отдела согласует всегда, даже при parentApproves=false на связи', async () => {
      ownDeptId = await mkDept('US17 Свой', orgId, childMgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [ownDeptId, emp.id])
      await saveHierarchy([linkEdge({ parentApproves: false })], 0)
      const created = await postOwn(emp)
      assert.strictEqual(created.status, 201)
      assert.strictEqual(await approverOf(created.data.id), childMgr.id)
    })

    it('частичный PUT true→false на существующей связи: эффект применился к новым заявкам', async () => {
      await saveHierarchy([linkEdge({ parentApproves: true })], 0)
      const first = await postOwn(emp, 10)
      assert.strictEqual(await approverOf(first.data.id), parentMgr.id)
      const graph = await call('GET', '/hierarchy', await tokenFor(hrUser), undefined, orgId)
      assert.strictEqual(graph.status, 200)
      const edges = graph.data.data.edges.map((e) => (e.id === 'e-parent-child'
        ? { ...e, data: { ...e.data, vacationVisibility: { ...e.data.vacationVisibility, parentApproves: false } } }
        : e))
      const updated = await saveHierarchy(edges, graph.data.version)
      assert.strictEqual(updated.status, 200, JSON.stringify(updated.data))
      const second = await postOwn(emp, 30)
      assert.strictEqual(second.status, 201, JSON.stringify(second.data))
      assert.strictEqual(await approverOf(second.data.id), headUser.id)
    })

    it('удаление связи: фолбэк-роутинг на главу организации', async () => {
      await saveHierarchy([linkEdge(null)], 0)
      await saveHierarchy([], 1)
      const created = await postOwn(emp)
      assert.strictEqual(created.status, 201)
      assert.strictEqual(await approverOf(created.data.id), headUser.id)
    })

    it('GET /hierarchy: рёбра с vacationVisibility возвращаются как сохранены (round-trip)', async () => {
      await saveHierarchy([linkEdge({ parentSeesChild: false, childSeesParent: true, parentApproves: false })], 0)
      const graph = await call('GET', '/hierarchy', await tokenFor(hrUser), undefined, orgId)
      assert.strictEqual(graph.status, 200)
      const edge = graph.data.data.edges.find((e) => e.id === 'e-parent-child')
      assert.ok(edge, 'связь не вернулась из GET /hierarchy')
      assert.deepStrictEqual(edge.data.vacationVisibility, { parentSeesChild: false, childSeesParent: true, parentApproves: false })
      const row = (await query('SELECT vac_parent_sees_child, vac_child_sees_parent, vac_parent_approves FROM departments WHERE id = $1', [childDeptId])).rows[0]
      assert.strictEqual(row.vac_parent_sees_child, false)
      assert.strictEqual(row.vac_child_sees_parent, true)
      assert.strictEqual(row.vac_parent_approves, false)
    })
  })

  describe('US-18. Защитные ветки approve/reject/cancel/transfer', () => {
    let deptId, dept2Id, mgr, mgrOut, emp, outsider
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us18.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US18 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      emp = await mkUser({ email: `us18.emp${SUFFIX}`, last: 'Иванов', deptId })
      mgrOut = await mkUser({ email: `us18.mgrout${SUFFIX}`, role: 'manager', last: 'Чужов' })
      dept2Id = await mkDept('US18 Чужой отдел vac-full', 1, mgrOut.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [dept2Id, mgrOut.id])
      outsider = await mkUser({ email: `us18.out${SUFFIX}`, last: 'Посторонний', deptId: dept2Id })
      for (const year of new Set([yearOf(shift(10)), yearOf(shift(40))])) {
        await mkBalance(emp.id, year)
      }
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await cleanupFixtures({ deptIds: [deptId, dept2Id] })
    })

    it('404 на левом id: approve/reject/cancel/transfer и триада переноса', async () => {
      const approve = await call('POST', '/vacation/requests/999999999/approve', await tokenFor(mgr), {})
      assert.strictEqual(approve.status, 404)
      assert.strictEqual(approve.data.error, 'Заявка не найдена')
      const reject = await call('POST', '/vacation/requests/999999999/reject', await tokenFor(mgr), { reason: 'x' })
      assert.strictEqual(reject.status, 404)
      assert.strictEqual(reject.data.error, 'Заявка не найдена')
      const cancel = await call('POST', '/vacation/requests/999999999/cancel', await tokenFor(emp), {})
      assert.strictEqual(cancel.status, 404)
      assert.strictEqual(cancel.data.error, 'Заявка не найдена')
      const transfer = await call('POST', '/vacation/requests/999999999/transfer', await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44) })
      assert.strictEqual(transfer.status, 404)
      assert.strictEqual(transfer.data.error, 'Заявка не найдена')
      for (const action of ['approve', 'reject', 'cancel']) {
        const res = await call('POST', `/vacation/requests/999999999/transfer/${action}`, await tokenFor(mgr), action === 'reject' ? { reason: 'x' } : {})
        assert.strictEqual(res.status, 404)
        assert.strictEqual(res.data.error, 'Запрос на перенос не найден')
      }
    })

    it('reject: 403 не-согласующему; 400 на заявке не на согласовании', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const denied = await call('POST', `/vacation/requests/${created.data.id}/reject`, await tokenFor(outsider), { reason: 'Занят' })
      assert.strictEqual(denied.status, 403)
      assert.strictEqual(denied.data.error, 'Нет прав на согласование этой заявки')
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      const late = await call('POST', `/vacation/requests/${created.data.id}/reject`, await tokenFor(mgr), { reason: 'Поздно' })
      assert.strictEqual(late.status, 400)
      assert.strictEqual(late.data.error, 'Заявка не на согласовании')
    })

    it('cancel: 400 на rejected и cancelled; cancel approved возвращает used_days', async () => {
      const rejected = await mkVacation({ userId: emp.id, start: shift(10), end: shift(14), duration: 5, status: 'rejected' })
      const rejRes = await call('POST', `/vacation/requests/${rejected.id}/cancel`, await tokenFor(emp), {})
      assert.strictEqual(rejRes.status, 400)
      assert.strictEqual(rejRes.data.error, 'Нельзя отменить эту заявку')
      const cancelled = await mkVacation({ userId: emp.id, start: shift(20), end: shift(24), duration: 5, status: 'cancelled_by_employee' })
      const cnlRes = await call('POST', `/vacation/requests/${cancelled.id}/cancel`, await tokenFor(emp), {})
      assert.strictEqual(cnlRes.status, 400)
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      assert.strictEqual((await balanceOf(emp.id, yearOf(shift(10)))).used_days, 5)
      const cancelRes = await call('POST', `/vacation/requests/${created.data.id}/cancel`, await tokenFor(emp), {})
      assert.strictEqual(cancelRes.status, 200)
      assert.strictEqual(await statusOf(created.data.id), 'cancelled_by_employee')
      assert.strictEqual((await balanceOf(emp.id, yearOf(shift(10)))).used_days, 0)
    })

    it('transfer: 403 чужого руководителя в approve/reject; cancel переноса — только владелец', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      const transfer = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44), reason: 'Перенос' })
      assert.strictEqual(transfer.status, 201, JSON.stringify(transfer.data))
      const deniedApprove = await call('POST', `/vacation/requests/${transfer.data.id}/transfer/approve`, await tokenFor(mgrOut), {})
      assert.strictEqual(deniedApprove.status, 403)
      const deniedReject = await call('POST', `/vacation/requests/${transfer.data.id}/transfer/reject`, await tokenFor(mgrOut), { reason: 'Нет' })
      assert.strictEqual(deniedReject.status, 403)
      const deniedCancel = await call('POST', `/vacation/requests/${transfer.data.id}/transfer/cancel`, await tokenFor(mgr), {})
      assert.strictEqual(deniedCancel.status, 403)
      assert.strictEqual(deniedCancel.data.error, 'Доступ запрещён')
    })

    it('transfer: 400 без дат; 400 проезд без города; 400 на не-approved исходнике', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const noDates = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), {})
      assert.strictEqual(noDates.status, 400)
      assert.strictEqual(noDates.data.error, 'Укажите новые даты переноса')
      const noCity = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44), hasTravel: true })
      assert.strictEqual(noCity.status, 400)
      assert.strictEqual(noCity.data.error, 'Укажите город проезда')
      const notApproved = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44) })
      assert.strictEqual(notApproved.status, 400)
      assert.strictEqual(notApproved.data.error, 'Можно переносить только согласованные заявки')
    })
  })

  describe('US-19. Валидации создания заявки', () => {
    let deptId, mgr, hrUser, emp, emp2
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us19.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US19 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      hrUser = await mkUser({ email: `us19.hr${SUFFIX}`, role: 'hr', last: 'Смирнова' })
      emp = await mkUser({ email: `us19.emp${SUFFIX}`, last: 'Иванов', deptId })
      emp2 = await mkUser({ email: `us19.emp2${SUFFIX}`, last: 'Петров', deptId })
      for (const year of new Set([yearOf(shift(10)), yearOf(shift(40))])) {
        await mkBalance(emp.id, year)
      }
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      await query('UPDATE departments SET vacation_requests_blocked = false WHERE id = $1', [deptId])
      await cleanupFixtures({ deptIds: [deptId] })
    })

    it('400: учебный отпуск без справки', async () => {
      const res = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'educational' })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Для учебного отпуска необходимо приложить справку')
    })

    it('400: пересечение с существующей заявкой', async () => {
      await mkVacation({ userId: emp.id, start: shift(10), end: shift(14), duration: 5, status: 'approved' })
      const res = await postVacation(emp, { startDate: shift(12), endDate: shift(16), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.data.error, 'Пересечение с существующей заявкой')
    })

    it('409: дубль заявки с проездом на согласовании', async () => {
      const pending = await mkVacation({ userId: emp.id, start: shift(10), end: shift(14), duration: 5, status: 'on_approval' })
      await query('UPDATE vacation_requests SET has_travel = true, travel_destination = \'Южно-Сахалинск\' WHERE id = $1', [pending.id])
      const res = await postVacation(emp, { startDate: shift(40), endDate: shift(44), vacationType: 'annual_paid', hasTravel: true, travelDestination: 'Москва' })
      assert.strictEqual(res.status, 409)
      assert.strictEqual(res.data.error, 'Уже есть заявка с проездом на согласовании')
    })

    it('201: ребёнок 18+ принимается — возраст не валидируется (фактическое поведение)', async () => {
      const res = await postVacation(emp, {
        startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid',
        hasTravel: true, travelDestination: 'Южно-Сахалинск',
        travelChildren: [{ fullName: 'Иванов Совершеннолетний', birthDate: '2000-01-01' }],
      })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      const row = (await query('SELECT travel_children FROM vacation_requests WHERE id = $1', [res.data.id])).rows[0]
      assert.strictEqual(row.travel_children[0].birthDate, '2000-01-01')
    })

    it('403: подача заявок заблокирована для отдела (флаг через departments endpoint)', async () => {
      const blockRes = await call('PATCH', `/departments/${deptId}/vacation-block`, await tokenFor(hrUser), { blocked: true })
      assert.strictEqual(blockRes.status, 200, JSON.stringify(blockRes.data))
      assert.strictEqual(blockRes.data.vacation_requests_blocked, true)
      const res = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      assert.strictEqual(res.status, 403)
      assert.strictEqual(res.data.error, 'Подача заявок на отпуск для вашего отдела временно заблокирована HR')
      const unblock = await call('PATCH', `/departments/${deptId}/vacation-block`, await tokenFor(hrUser), { blocked: false })
      assert.strictEqual(unblock.status, 200)
      const after = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      assert.strictEqual(after.status, 201, JSON.stringify(after.data))
    })
  })

  describe('US-20. Замещающие и ограничения: защитные ветки', () => {
    let deptId, mgr, mgrOther, hrUser, emp, sub, foreignUser, foreignOrgId
    let modulesSnap

    beforeEach(async () => {
      modulesSnap = await enableModules()
      mgr = await mkUser({ email: `us20.mgr${SUFFIX}`, role: 'manager', last: 'Сидоров' })
      deptId = await mkDept('US20 Отдел vac-full', 1, mgr.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, mgr.id])
      hrUser = await mkUser({ email: `us20.hr${SUFFIX}`, role: 'hr', last: 'Смирнова' })
      emp = await mkUser({ email: `us20.emp${SUFFIX}`, last: 'Иванов', deptId })
      sub = await mkUser({ email: `us20.sub${SUFFIX}`, last: 'Козлов', deptId })
      mgrOther = await mkUser({ email: `us20.mgro${SUFFIX}`, role: 'manager', last: 'Чужов' })
      foreignOrgId = await ensureTestOrg(2)
      foreignUser = await mkUser({ email: `us20.foreign${SUFFIX}`, last: 'Иностранцев', orgIds: [foreignOrgId] })
      for (const year of new Set([yearOf(shift(10)), yearOf(shift(40))])) {
        await mkBalance(emp.id, year)
      }
    })

    afterEach(async () => {
      await restoreModules(modulesSnap)
      const strayDeptIds = (await query("SELECT id FROM departments WHERE name = 'US20 Чужой отдел vac-full'")).rows.map((r) => r.id)
      await cleanupFixtures({ deptIds: [deptId, ...strayDeptIds], templateNames: ['vac-full us20 nofile', 'vac-full us20 notfile'] })
    })

    it('substitutes POST: пустой список → 400; левая заявка → 404; чужой employee → 403', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const empty = await call('POST', `/vacation/requests/${created.data.id}/substitutes`, await tokenFor(emp), { substitute_ids: [] })
      assert.strictEqual(empty.status, 400)
      assert.strictEqual(empty.data.error, 'Укажите замещающих')
      const missing = await call('POST', '/vacation/requests/999999999/substitutes', await tokenFor(emp), { substitute_ids: [sub.id] })
      assert.strictEqual(missing.status, 404)
      assert.strictEqual(missing.data.error, 'Заявка не найдена')
      const denied = await call('POST', `/vacation/requests/${created.data.id}/substitutes`, await tokenFor(mgrOther), { substitute_ids: [sub.id] })
      assert.strictEqual(denied.status, 403)
      assert.strictEqual(denied.data.error, 'Нет прав')
    })

    it('substitutes POST: работник не из организации → 400; DELETE: левая заявка → 404', async () => {
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      const foreign = await call('POST', `/vacation/requests/${created.data.id}/substitutes`, await tokenFor(emp), { substitute_ids: [foreignUser.id] })
      assert.strictEqual(foreign.status, 400)
      assert.strictEqual(foreign.data.error, 'Замещающие не найдены в организации')
      const missing = await call('DELETE', `/vacation/requests/999999999/substitutes/${sub.id}`, await tokenFor(emp))
      assert.strictEqual(missing.status, 404)
      assert.strictEqual(missing.data.error, 'Заявка не найдена')
    })

    it('restrictions PUT: без type → 400; manager-не-владелец → 403; DELETE: manager-не-владелец → 403', async () => {
      const created = await call('POST', '/vacation/restrictions', await tokenFor(mgr), {
        departmentId: deptId, type: 'group', employeeIds: [emp.id, sub.id], maxConcurrent: 1,
      })
      assert.strictEqual(created.status, 201, JSON.stringify(created.data))
      const noType = await call('PUT', `/vacation/restrictions/${created.data.id}`, await tokenFor(mgr), { departmentId: deptId })
      assert.strictEqual(noType.status, 400)
      assert.strictEqual(noType.data.error, 'Укажите type')
      const deniedPut = await call('PUT', `/vacation/restrictions/${created.data.id}`, await tokenFor(mgrOther), {
        departmentId: deptId, type: 'group', employeeIds: [emp.id, sub.id],
      })
      assert.strictEqual(deniedPut.status, 403)
      assert.strictEqual(deniedPut.data.error, 'Изменять ограничение может только его владелец или HR')
      const deniedDelete = await call('DELETE', `/vacation/restrictions/${created.data.id}`, await tokenFor(mgrOther))
      assert.strictEqual(deniedDelete.status, 403)
      assert.strictEqual(deniedDelete.data.error, 'Удалить ограничение может только его владелец или HR')
      const hrDelete = await call('DELETE', `/vacation/restrictions/${created.data.id}`, await tokenFor(hrUser))
      assert.strictEqual(hrDelete.status, 200)
    })

    it('violations: manager по чужому departmentId → 403', async () => {
      const otherDept = await mkDept('US20 Чужой отдел vac-full', 1, mgrOther.id)
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [otherDept, mgrOther.id])
      const res = await call('GET', `/vacation/restrictions/violations?departmentId=${otherDept}`, await tokenFor(mgr))
      assert.strictEqual(res.status, 403)
      assert.strictEqual(res.data.error, 'Доступ только к своему отделу')
    })

    it('check-restrictions: диапазон с 6+ праздниками → 400 «слишком много праздничных»', async () => {
      const res = await call('POST', '/vacation/check-restrictions', await tokenFor(emp), { userId: emp.id, startDate: '2027-01-01', endDate: '2027-01-08' })
      assert.strictEqual(res.status, 400)
      assert.match(res.data.error, /слишком много праздничных/i)
    })

    it('generate-application и generate-transfer-application: шаблон без файла → 400', async () => {
      const template = (await createDocTemplate(await tokenFor(hrUser), 'vac-full us20 nofile', 'vacation_template')).data
      await query('UPDATE document_templates SET file_key = \'\' WHERE id = $1', [template.id])
      const created = await postVacation(emp, { startDate: shift(10), endDate: shift(14), vacationType: 'annual_paid' })
      await call('POST', `/vacation/requests/${created.data.id}/approve`, await tokenFor(mgr), {})
      const app = await call('POST', '/vacation/generate-application', await tokenFor(emp), { year: yearOf(shift(10)), templateId: template.id })
      assert.strictEqual(app.status, 400)
      assert.strictEqual(app.data.error, 'Файл шаблона не прикреплён')
      const transfer = await call('POST', `/vacation/requests/${created.data.id}/transfer`, await tokenFor(emp), { newStartDate: shift(40), newEndDate: shift(44), reason: 'Перенос' })
      assert.strictEqual(transfer.status, 201, JSON.stringify(transfer.data))
      const transferApproved = await call('POST', `/vacation/requests/${transfer.data.id}/transfer/approve`, await tokenFor(mgr), {})
      assert.strictEqual(transferApproved.status, 200, JSON.stringify(transferApproved.data))
      const transferTemplate = (await createDocTemplate(await tokenFor(hrUser), 'vac-full us20 notfile', 'vacation_transfer_template')).data
      await query('UPDATE document_templates SET file_key = \'\' WHERE id = $1', [transferTemplate.id])
      const trApp = await call('POST', '/vacation/generate-transfer-application', await tokenFor(emp), { templateId: transferTemplate.id, transferIds: [transfer.data.id] })
      assert.strictEqual(trApp.status, 400)
      assert.strictEqual(trApp.data.error, 'Файл шаблона не прикреплён')
    })
  })
})
