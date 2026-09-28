import { describe, it, before, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { pool, query } from '../config/database.js'
import { BASE, PASSWORD, login } from './helpers.js'

const SUFFIX = '@hier-full.test'
const SLUG_PREFIX = 'hier-full-'

async function call(method, path, token, body, org) {
  const headers = {}
  if (org !== null) headers['x-organization-id'] = String(org)
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('json') ? await res.json().catch(() => null) : null
  return { status: res.status, data }
}

async function anonymousCall(method, path, body) {
  const pre = await fetch(`${BASE}/hierarchy`, { headers: { 'x-organization-id': '1' } })
  const cookie = (pre.headers.getSetCookie?.() || []).find((c) => c.startsWith('csrf_token='))
  const headers = { 'x-organization-id': '1' }
  if (cookie) {
    const pair = cookie.split(';')[0]
    headers.Cookie = pair
    headers['x-csrf-token'] = pair.split('=')[1]
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

async function mkOrg(name, slug) {
  return (await query('INSERT INTO organizations (name, slug, is_active) VALUES ($1, $2, true) RETURNING id', [name, slug])).rows[0].id
}

async function mkUser({ email, role = 'employee', orgId, orgRole = role, deptId = null }) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date, status)
     VALUES ($1, $2, 'Пётр', 'Пробников', 'Специалист', $3, $4, '2020-01-01', 'active') RETURNING id`,
    [email, hash, role, deptId])).rows[0].id
  await query('INSERT INTO user_organizations (user_id, org_id, org_role) VALUES ($1, $2, $3)', [id, orgId, orgRole])
  return { id, email, token: null }
}

async function tokenFor(user) {
  if (!user.token) user.token = await login(user.email)
  return user.token
}

async function mkDept(name, orgId) {
  return (await query('INSERT INTO departments (name, organization_id) VALUES ($1, $2) RETURNING id', [name, orgId])).rows[0].id
}

async function cleanupFixtures() {
  const orgIds = (await query('SELECT id FROM organizations WHERE slug LIKE $1', [`${SLUG_PREFIX}%`])).rows.map((r) => r.id)
  if (orgIds.length > 0) {
    await query('DELETE FROM hr_hierarchy WHERE organization_id = ANY($1)', [orgIds])
    await query('DELETE FROM department_hierarchy WHERE organization_id = ANY($1)', [orgIds])
    await query('UPDATE departments SET manager_id = NULL, parent_id = NULL, parent_user_id = NULL WHERE organization_id = ANY($1)', [orgIds])
  }
  await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
  if (orgIds.length > 0) {
    await query('DELETE FROM departments WHERE organization_id = ANY($1)', [orgIds])
    await query('DELETE FROM organizations WHERE id = ANY($1)', [orgIds])
  }
}

const deptNode = (deptId, name, x = 0) => ({
  id: `department-${deptId}-t1`,
  type: 'department',
  position: { x, y: 0 },
  data: { id: deptId, name, employeeCount: 0, managerName: null },
})

const empNode = (userId, x = 400) => ({
  id: `employee-${userId}-t1`,
  type: 'employee',
  position: { x, y: 200 },
  data: { id: userId, firstName: 'Пётр', lastName: 'Пробников', position: 'Специалист' },
})

const TEXT_NODE = { id: 'text-t1', type: 'text', position: { x: 0, y: 400 }, data: { text: 'Заметка hier-full' } }
const GROUP_NODE = { id: 'group-t1', type: 'group', position: { x: 0, y: 600 }, style: { width: 400, height: 260 }, data: { title: 'Группа' } }

const parentEdge = (sourceNodeId, targetNodeId, extra = {}) => ({
  id: `e-${sourceNodeId}-${targetNodeId}`,
  source: sourceNodeId,
  target: targetNodeId,
  type: 'editable',
  data: { relation: 'parent', ...extra },
})

let orgA, orgB, hrA, empA, empA2, superadmin, deptA, deptB, deptB1

before(async () => {
  await cleanupFixtures()
})

beforeEach(async () => {
  const stamp = Date.now()
  orgA = await mkOrg('Иерархия Тест А', `${SLUG_PREFIX}a-${stamp}`)
  orgB = await mkOrg('Иерархия Тест Б', `${SLUG_PREFIX}b-${stamp}`)
  hrA = await mkUser({ email: `hr${SUFFIX}`, role: 'hr', orgId: orgA })
  empA = await mkUser({ email: `emp${SUFFIX}`, role: 'employee', orgId: orgA })
  empA2 = await mkUser({ email: `emp2${SUFFIX}`, role: 'employee', orgId: orgA })
  superadmin = await mkUser({ email: `sa${SUFFIX}`, role: 'superadmin', orgId: orgA, orgRole: 'admin' })
  deptA = await mkDept('Отдел А hier', orgA)
  deptB = await mkDept('Отдел Б hier', orgA)
  deptB1 = await mkDept('Отдел Б1 hier', orgB)
})

afterEach(async () => {
  await cleanupFixtures()
})

after(() => pool.end())

describe('US-Б1. «HR сохраняет структуру организации»', () => {
  it('Given пустая схема org A, When HR делает PUT / с нодами отдел+работник+текст+группа и edge с vacationVisibility, Then 200 и version=1', async () => {
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), deptNode(deptB, 'Отдел Б hier', 400), empNode(empA2.id), TEXT_NODE, GROUP_NODE]
    const edges = [parentEdge(`department-${deptA}-t1`, `department-${deptB}-t1`, { vacationVisibility: { parentSeesChild: true, childSeesParent: true, parentApproves: true } })]
    const res = await call('PUT', '/hierarchy', token, { nodes, edges, viewport: { x: 0, y: 0, zoom: 0.85 }, baseVersion: 0 }, orgA)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    assert.strictEqual(res.data.version, 1)
    assert.ok(res.data.updated_at)
  })

  it('Then GET / возвращает сохранённую схему в формате {data, updated_at, updated_by, version}', async () => {
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), empNode(empA2.id), TEXT_NODE, GROUP_NODE]
    const put = await call('PUT', '/hierarchy', token, { nodes, edges: [], viewport: { x: 10, y: 20, zoom: 1 }, baseVersion: 0 }, orgA)
    assert.strictEqual(put.status, 200)

    const res = await call('GET', '/hierarchy', token, undefined, orgA)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.version, 1)
    assert.strictEqual(res.data.updated_by, hrA.id)
    assert.ok(res.data.updated_at)
    const nodeIds = res.data.data.nodes.map((n) => n.id).sort()
    assert.deepStrictEqual(nodeIds, ['department-' + deptA + '-t1', 'employee-' + empA2.id + '-t1', 'group-t1', 'text-t1'].sort())
    assert.strictEqual(res.data.data.edges.length, 0)
    assert.deepStrictEqual(res.data.data.viewport, { x: 10, y: 20, zoom: 1 })
    assert.deepStrictEqual(res.data.data.orgPositions, {})
  })

  it('When employee делает PUT /, Then 403', async () => {
    const token = await tokenFor(empA)
    const res = await call('PUT', '/hierarchy', token, { nodes: [], edges: [], baseVersion: 0 }, orgA)
    assert.strictEqual(res.status, 403)
  })

  it('When запрос без токена, Then 401 (GET напрямую, PUT через csrf-куку)', async () => {
    const get = await fetch(`${BASE}/hierarchy`)
    assert.strictEqual(get.status, 401)

    const put = await anonymousCall('PUT', '/hierarchy', { nodes: [], edges: [], baseVersion: 0 })
    assert.strictEqual(put.status, 401)
  })

  it('When HR делает PUT /global, Then 403 — глобальная схема доступна только superadmin (факт по коду)', async () => {
    const token = await tokenFor(hrA)
    const res = await call('PUT', '/hierarchy/global', token, { nodes: [TEXT_NODE], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, orgA)
    assert.strictEqual(res.status, 403)
  })

  it('When superadmin делает PUT /global + GET /global, Then 200 и данные на месте (общая строка восстанавливается)', async () => {
    const token = await tokenFor(superadmin)
    const before = (await query('SELECT data FROM global_hierarchy WHERE id = 1')).rows[0]?.data ?? null
    try {
      const marker = `sa-${Date.now()}`
      const put = await call('PUT', '/hierarchy/global', token, { nodes: [{ ...TEXT_NODE, data: { text: marker } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, null)
      assert.strictEqual(put.status, 200, JSON.stringify(put.data))
      assert.ok(put.data.updated_at)

      const get = await call('GET', '/hierarchy/global', token, undefined, null)
      assert.strictEqual(get.status, 200)
      assert.strictEqual(get.data.data.nodes[0].data.text, marker)
    } finally {
      if (before === null) await query('DELETE FROM global_hierarchy WHERE id = 1')
      else await query('UPDATE global_hierarchy SET data = $1 WHERE id = 1', [JSON.stringify(before)])
    }
  })
})

describe('US-Б2. «Работник смотрит структуру своей org»', () => {
  it('Given схемы в org A и org B, When employee org A запрашивает GET / с чужим X-Organization-Id, Then возвращает его собственную org', async () => {
    const hrAToken = await tokenFor(hrA)
    await call('PUT', '/hierarchy', hrAToken, { nodes: [deptNode(deptA, 'Отдел А hier'), TEXT_NODE], edges: [], baseVersion: 0 }, orgA)

    const hrB = await mkUser({ email: `hrb${SUFFIX}`, role: 'hr', orgId: orgB })
    const hrBToken = await tokenFor(hrB)
    await call('PUT', '/hierarchy', hrBToken, { nodes: [deptNode(deptB1, 'Отдел Б1 hier')], edges: [], baseVersion: 0 }, orgB)

    const token = await tokenFor(empA)
    const res = await call('GET', '/hierarchy', token, undefined, orgB)
    assert.strictEqual(res.status, 200)
    const names = res.data.data.nodes.map((n) => n.data?.name).filter(Boolean)
    assert.ok(names.includes('Отдел А hier'))
    assert.ok(!names.includes('Отдел Б1 hier'))
    assert.ok(res.data.data.nodes.some((n) => n.id === 'text-t1'))
  })

  it('When HR читает GET / с X-Organization-Id другой org, Then 200 и данные той org (межorg-чтение для hr — by design)', async () => {
    const hrB = await mkUser({ email: `hrb${SUFFIX}`, role: 'hr', orgId: orgB })
    const hrBToken = await tokenFor(hrB)
    await call('PUT', '/hierarchy', hrBToken, { nodes: [deptNode(deptB1, 'Отдел Б1 hier')], edges: [], baseVersion: 0 }, orgB)

    const token = await tokenFor(hrA)
    const res = await call('GET', '/hierarchy', token, undefined, orgB)
    assert.strictEqual(res.status, 200)
    assert.ok(res.data.data.nodes.some((n) => n.data?.name === 'Отдел Б1 hier'))
  })

  it('When employee запрашивает GET /global, Then 200 (доступен любой роли; содержит глобальную схему)', async () => {
    const token = await tokenFor(empA)
    const res = await call('GET', '/hierarchy/global', token, undefined, orgA)
    assert.strictEqual(res.status, 200)
    assert.ok(res.data !== null && typeof res.data === 'object')
    assert.ok('data' in res.data)
  })
})

describe('US-Б3. «Настройки связи (видимость/согласование) сохраняются»', () => {
  it('Given edge с vacationVisibility все false, When PUT + GET, Then флаги на месте в edge и в departments/users', async () => {
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), deptNode(deptB, 'Отдел Б hier', 400), empNode(empA.id), empNode(empA2.id, 700)]
    const edges = [
      parentEdge(`department-${deptA}-t1`, `department-${deptB}-t1`, { vacationVisibility: { parentSeesChild: false, childSeesParent: false, parentApproves: false } }),
      parentEdge(`employee-${empA.id}-t1`, `employee-${empA2.id}-t1`, { vacationVisibility: { parentSeesChild: false, childSeesParent: false, parentApproves: false } }),
    ]
    const put = await call('PUT', '/hierarchy', token, { nodes, edges, baseVersion: 0 }, orgA)
    assert.strictEqual(put.status, 200, JSON.stringify(put.data))

    const res = await call('GET', '/hierarchy', token, undefined, orgA)
    assert.strictEqual(res.status, 200)
    const deptEdge = res.data.data.edges.find((e) => e.source === `department-${deptA}-t1`)
    assert.deepStrictEqual(deptEdge.data.vacationVisibility, { parentSeesChild: false, childSeesParent: false, parentApproves: false })
    const userEdge = res.data.data.edges.find((e) => e.source === `employee-${empA.id}-t1`)
    assert.deepStrictEqual(userEdge.data.vacationVisibility, { parentSeesChild: false, childSeesParent: false, parentApproves: false })

    const deptRow = (await query('SELECT parent_id, parent_user_id, vac_parent_sees_child, vac_child_sees_parent, vac_parent_approves FROM departments WHERE id = $1', [deptB])).rows[0]
    assert.strictEqual(deptRow.parent_id, deptA)
    assert.strictEqual(deptRow.parent_user_id, null)
    assert.strictEqual(deptRow.vac_parent_sees_child, false)
    assert.strictEqual(deptRow.vac_child_sees_parent, false)
    assert.strictEqual(deptRow.vac_parent_approves, false)

    const userRow = (await query('SELECT manager_id, vac_parent_sees_child, vac_child_sees_parent, vac_parent_approves FROM users WHERE id = $1', [empA2.id])).rows[0]
    assert.strictEqual(userRow.manager_id, empA.id)
    assert.strictEqual(userRow.vac_parent_sees_child, false)
    assert.strictEqual(userRow.vac_child_sees_parent, false)
    assert.strictEqual(userRow.vac_parent_approves, false)
  })

  it('Then edge без vacationVisibility оставляет флаги departments в true (дефолт)', async () => {
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), deptNode(deptB, 'Отдел Б hier', 400)]
    const edges = [parentEdge(`department-${deptA}-t1`, `department-${deptB}-t1`)]
    const put = await call('PUT', '/hierarchy', token, { nodes, edges, baseVersion: 0 }, orgA)
    assert.strictEqual(put.status, 200)

    const deptRow = (await query('SELECT parent_id, vac_parent_sees_child, vac_child_sees_parent, vac_parent_approves FROM departments WHERE id = $1', [deptB])).rows[0]
    assert.strictEqual(deptRow.parent_id, deptA)
    assert.strictEqual(deptRow.vac_parent_sees_child, true)
    assert.strictEqual(deptRow.vac_child_sees_parent, true)
    assert.strictEqual(deptRow.vac_parent_approves, true)
  })
})

describe('US-Б4. «Отдел-поддерево»', () => {
  it('When GET /department/:id без сохранённой схемы, Then 200 с пустым DEFAULT_DATA', async () => {
    const token = await tokenFor(hrA)
    const res = await call('GET', `/hierarchy/department/${deptA}`, token, undefined, orgA)
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(res.data, { data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, updated_at: null, updated_by: null })
  })

  it('When HR делает PUT /department/:id, Then 200 и GET возвращает поддерево', async () => {
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), empNode(empA.id)]
    const edges = [parentEdge(`employee-${empA.id}-t1`, `department-${deptA}-t1`, { relation: 'plain' })]
    const put = await call('PUT', `/hierarchy/department/${deptA}`, token, { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }, orgA)
    assert.strictEqual(put.status, 200, JSON.stringify(put.data))
    assert.ok(put.data.updated_at)

    const res = await call('GET', `/hierarchy/department/${deptA}`, token, undefined, orgA)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.data.nodes.length, 2)
    assert.strictEqual(res.data.updated_by, hrA.id)
  })

  it('When superadmin делает PUT /department/:id с X-Organization-Id, Then 200 (authorizeRoles пропускает superadmin — факт по коду)', async () => {
    const token = await tokenFor(superadmin)
    const res = await call('PUT', `/hierarchy/department/${deptA}`, token, { nodes: [TEXT_NODE], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, orgA)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
  })

  it('When superadmin делает PUT /department/:id без X-Organization-Id, Then 400 «Не выбрана организация»', async () => {
    const token = await tokenFor(superadmin)
    const res = await call('PUT', `/hierarchy/department/${deptA}`, token, { nodes: [TEXT_NODE], edges: [] }, null)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.error, 'Не выбрана организация')
  })

  it('When PUT /department/999999999, Then 404 «Отдел не найден»; When GET несуществующего, Then 200 c DEFAULT_DATA (не 404 — факт по коду)', async () => {
    const token = await tokenFor(hrA)
    const put = await call('PUT', '/hierarchy/department/999999999', token, { nodes: [], edges: [] }, orgA)
    assert.strictEqual(put.status, 404)
    assert.strictEqual(put.data.error, 'Отдел не найден')

    const get = await call('GET', '/hierarchy/department/999999999', token, undefined, orgA)
    assert.strictEqual(get.status, 200)
    assert.deepStrictEqual(get.data.data.nodes, [])
  })
})

describe('US-Б5. «Целостность»', () => {
  it('When цикл отделов A→B→A, Then 400 «Цикл в иерархии отделов»', async () => {
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), deptNode(deptB, 'Отдел Б hier', 400)]
    const edges = [
      parentEdge(`department-${deptA}-t1`, `department-${deptB}-t1`),
      parentEdge(`department-${deptB}-t1`, `department-${deptA}-t1`),
    ]
    const res = await call('PUT', '/hierarchy', token, { nodes, edges, baseVersion: 0 }, orgA)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.error, 'Цикл в иерархии отделов')
  })

  it('When цикл работников u1→u2→u1, Then 400 «Цикл в иерархии работников»', async () => {
    const token = await tokenFor(hrA)
    const nodes = [empNode(empA.id), empNode(empA2.id, 400)]
    const edges = [
      parentEdge(`employee-${empA.id}-t1`, `employee-${empA2.id}-t1`),
      parentEdge(`employee-${empA2.id}-t1`, `employee-${empA.id}-t1`),
    ]
    const res = await call('PUT', '/hierarchy', token, { nodes, edges, baseVersion: 0 }, orgA)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.error, 'Цикл в иерархии работников')
  })

  it('When у отдела два родителя, Then 400 «У отдела может быть только один родитель»', async () => {
    const token = await tokenFor(hrA)
    const deptC = await mkDept('Отдел В hier', orgA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), deptNode(deptB, 'Отдел Б hier', 400), deptNode(deptC, 'Отдел В hier', 800)]
    const edges = [
      parentEdge(`department-${deptA}-t1`, `department-${deptC}-t1`),
      parentEdge(`department-${deptB}-t1`, `department-${deptC}-t1`),
    ]
    const res = await call('PUT', '/hierarchy', token, { nodes, edges, baseVersion: 0 }, orgA)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.error.includes('У отдела может быть только один родитель'), true)
  })

  it('When куратор отдела — юзер из другой org, Then 400 «Пользователь не состоит в организации»', async () => {
    const foreigner = await mkUser({ email: `foreign${SUFFIX}`, role: 'employee', orgId: orgB })
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), empNode(foreigner.id)]
    const edges = [parentEdge(`employee-${foreigner.id}-t1`, `department-${deptA}-t1`)]
    const res = await call('PUT', '/hierarchy', token, { nodes, edges, baseVersion: 0 }, orgA)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.error, `Пользователь не состоит в организации: Пробников Пётр`)
  })

  it('When родитель-юзер не существует, Then 400 «Пользователь не найден»', async () => {
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), empNode(999999999)]
    const edges = [parentEdge('employee-999999999-t1', `department-${deptA}-t1`)]
    const res = await call('PUT', '/hierarchy', token, { nodes, edges, baseVersion: 0 }, orgA)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.error.includes('Пользователь не найден'), true)
  })

  it('When edge ссылается на отдел чужой org, Then 400 «Отдел не найден в организации»', async () => {
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), { ...deptNode(deptB1, 'Отдел Б1 hier'), position: { x: 400, y: 0 } }]
    const edges = [parentEdge(`department-${deptA}-t1`, `department-${deptB1}-t1`)]
    const res = await call('PUT', '/hierarchy', token, { nodes, edges, baseVersion: 0 }, orgA)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.error.includes('Отдел не найден в организации'), true)
  })

  it('When устаревший baseVersion, Then 409 HIERARCHY_VERSION_CONFLICT; с актуальным — 200 и version растёт', async () => {
    const token = await tokenFor(hrA)
    const first = await call('PUT', '/hierarchy', token, { nodes: [TEXT_NODE], edges: [], baseVersion: 0 }, orgA)
    assert.strictEqual(first.status, 200)
    assert.strictEqual(first.data.version, 1)

    const stale = await call('PUT', '/hierarchy', token, { nodes: [GROUP_NODE], edges: [], baseVersion: 0 }, orgA)
    assert.strictEqual(stale.status, 409)
    assert.strictEqual(stale.data.code, 'HIERARCHY_VERSION_CONFLICT')

    const fresh = await call('PUT', '/hierarchy', token, { nodes: [GROUP_NODE], edges: [], baseVersion: 1 }, orgA)
    assert.strictEqual(fresh.status, 200)
    assert.strictEqual(fresh.data.version, 2)

    const res = await call('GET', '/hierarchy', token, undefined, orgA)
    assert.strictEqual(res.data.version, 2)
    assert.strictEqual(res.data.data.nodes[0].id, 'group-t1')
  })

  it('When payload без baseVersion или без nodes/edges, Then 400', async () => {
    const token = await tokenFor(hrA)
    const noVersion = await call('PUT', '/hierarchy', token, { nodes: [], edges: [] }, orgA)
    assert.strictEqual(noVersion.status, 400)
    assert.strictEqual(noVersion.data.error, 'Не передана версия схемы')

    const noNodes = await call('PUT', '/hierarchy', token, { edges: [], baseVersion: 0 }, orgA)
    assert.strictEqual(noNodes.status, 400)
    assert.strictEqual(noNodes.data.error, 'Поля nodes и edges обязательны')
  })
})

describe('Видимость в разделе «Работники» по связям иерархии', () => {
  const groupsOf = async (user) => {
    const res = await call('GET', '/users/colleagues', await tokenFor(user), undefined, orgA)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    return res.data.groups.map((g) => ({ dept: g.departmentId === null ? null : Number(g.departmentId), isOwn: g.isOwn, ids: g.employees.map((e) => e.id) }))
  }

  it('без галочек каждый видит только свой отдел; «Родитель видит работников подчинённых» открывает дочерний отдел', async () => {
    await query('UPDATE users SET department_id = $1 WHERE id = ANY($2)', [deptA, [empA.id, empA2.id]])
    const empB = await mkUser({ email: `empb${SUFFIX}`, role: 'employee', orgId: orgA, deptId: deptB })
    const token = await tokenFor(hrA)
    const nodes = [deptNode(deptA, 'Отдел А hier'), deptNode(deptB, 'Отдел Б hier', 300)]

    const plain = await call('PUT', '/hierarchy', token, { nodes, edges: [parentEdge(`department-${deptA}-t1`, `department-${deptB}-t1`)], baseVersion: 0 }, orgA)
    assert.strictEqual(plain.status, 200, JSON.stringify(plain.data))
    assert.deepStrictEqual((await groupsOf(empA)).map((g) => g.dept), [deptA])
    assert.deepStrictEqual((await groupsOf(empB)).map((g) => g.dept), [deptB])

    const withFlag = await call('PUT', '/hierarchy', token, {
      nodes,
      edges: [parentEdge(`department-${deptA}-t1`, `department-${deptB}-t1`, { employeeVisibility: { parentSeesChild: true, childSeesParent: false } })],
      baseVersion: plain.data.version,
    }, orgA)
    assert.strictEqual(withFlag.status, 200, JSON.stringify(withFlag.data))
    const flags = (await query('SELECT emp_parent_sees_child, emp_child_sees_parent FROM departments WHERE id = $1', [deptB])).rows[0]
    assert.deepStrictEqual(flags, { emp_parent_sees_child: true, emp_child_sees_parent: false })

    const fromA = await groupsOf(empA)
    assert.deepStrictEqual(fromA.map((g) => [g.dept, g.isOwn]), [[deptA, true], [deptB, false]])
    assert.ok(fromA[0].ids.includes(empA.id) && fromA[0].ids.includes(empA2.id))
    assert.deepStrictEqual(fromA[1].ids, [empB.id])
    assert.deepStrictEqual((await groupsOf(empB)).map((g) => g.dept), [deptB])

    const both = await call('PUT', '/hierarchy', token, {
      nodes,
      edges: [parentEdge(`department-${deptA}-t1`, `department-${deptB}-t1`, { employeeVisibility: { parentSeesChild: true, childSeesParent: true } })],
      baseVersion: withFlag.data.version,
    }, orgA)
    assert.strictEqual(both.status, 200, JSON.stringify(both.data))
    assert.deepStrictEqual((await groupsOf(empB)).map((g) => [g.dept, g.isOwn]), [[deptB, true], [deptA, false]])
  })

  it('связь «руководитель → работник»: руководитель видит работника, работник видит руководителя по своим галочкам', async () => {
    await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptA, empA.id])
    const empB = await mkUser({ email: `empb2${SUFFIX}`, role: 'employee', orgId: orgA, deptId: deptB })
    const token = await tokenFor(hrA)
    const put = await call('PUT', '/hierarchy', token, {
      nodes: [deptNode(deptA, 'Отдел А hier'), deptNode(deptB, 'Отдел Б hier', 300), empNode(empA.id), empNode(empB.id, 700)],
      edges: [parentEdge(`employee-${empA.id}-t1`, `employee-${empB.id}-t1`, { employeeVisibility: { parentSeesChild: true, childSeesParent: false } })],
      baseVersion: 0,
    }, orgA)
    assert.strictEqual(put.status, 200, JSON.stringify(put.data))
    const fromManager = await groupsOf(empA)
    assert.deepStrictEqual(fromManager.map((g) => g.dept), [deptA, deptB])
    assert.deepStrictEqual(fromManager[1].ids, [empB.id])
    assert.deepStrictEqual((await groupsOf(empB)).map((g) => g.dept), [deptB])
  })
})
