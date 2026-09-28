import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const SUFFIX = `@dept-delete-${Date.now()}.test`
const createdDepts = []

async function mkDept(name) {
  const id = (await query('INSERT INTO departments (name, organization_id) VALUES ($1, 1) RETURNING id', [name])).rows[0].id
  createdDepts.push(id)
  return id
}

async function mkUser(email, deptId, status = 'active', lastName = 'Удаляев') {
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date, status)
     VALUES ($1, $2, 'Иван', $3, 'Специалист', 'employee', $4, '2020-01-01', $5) RETURNING id`,
    [email, hash, lastName, deptId, status]
  )).rows[0].id
  await query('INSERT INTO user_organizations (user_id, org_id, org_role, department_id, is_active) VALUES ($1, 1, $2, $3, $4)', [id, 'employee', deptId, status === 'active'])
  return id
}

async function call(method, path, body) {
  const token = await login('admin@example.com')
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const del = (deptId, transferTo) => call('DELETE', `/dictionaries/departments/${deptId}${transferTo ? `?transfer_to=${transferTo}` : ''}`)
const deptOf = async (userId) => (await query('SELECT department_id FROM users WHERE id = $1', [userId])).rows[0].department_id
const membershipDeptOf = async (userId) => (await query('SELECT department_id FROM user_organizations WHERE user_id = $1 AND org_id = 1', [userId])).rows[0].department_id

describe('Удаление отдела', () => {
  after(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
    await query('DELETE FROM timesheets WHERE department_id = ANY($1)', [createdDepts])
    await query('DELETE FROM departments WHERE id = ANY($1)', [createdDepts])
  })

  it('с действующим работником → 409 с фамилией', async () => {
    const dept = await mkDept('Удаление: с работником')
    await mkUser(`active${SUFFIX}`, dept, 'active', 'Работающий')
    const res = await del(dept)
    assert.strictEqual(res.status, 409)
    assert.match(res.data.error, /есть работники — Работающий И\./)
  })

  it('только деактивированный работник, неактивное членство и черновик табеля → удаляется, ссылки очищены', async () => {
    const dept = await mkDept('Удаление: бывшие')
    const former = await mkUser(`former${SUFFIX}`, dept, 'inactive', 'Уволенный')
    await query("INSERT INTO timesheets (department_id, year, month, status, organization_id) VALUES ($1, 2026, 9, 'draft', 1)", [dept])
    const res = await del(dept)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    assert.strictEqual((await query('SELECT count(*)::int c FROM departments WHERE id = $1', [dept])).rows[0].c, 0)
    assert.strictEqual((await query('SELECT department_id FROM users WHERE id = $1', [former])).rows[0].department_id, null)
    assert.strictEqual((await query('SELECT count(*)::int c FROM timesheets WHERE department_id = $1', [dept])).rows[0].c, 0)
  })

  it('с утверждённым табелем → 409 с периодом', async () => {
    const dept = await mkDept('Удаление: табель')
    await query("INSERT INTO timesheets (department_id, year, month, status, organization_id) VALUES ($1, 2026, 8, 'approved', 1)", [dept])
    const res = await del(dept)
    assert.strictEqual(res.status, 409)
    assert.match(res.data.error, /табели — август 2026/)
  })

  it('пустой отдел → удаляется', async () => {
    const dept = await mkDept('Удаление: пустой')
    const res = await del(dept)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
  })

  it('переведённый через профиль работник не мешает удалению (членство в учреждении синхронизируется)', async () => {
    const from = await mkDept('Удаление: откуда')
    const to = await mkDept('Удаление: куда')
    const user = await mkUser(`moved${SUFFIX}`, from, 'active', 'Переведённый')
    const upd = await call('PUT', `/admin/users/${user}`, { department_id: to })
    assert.strictEqual(upd.status, 200, JSON.stringify(upd.data))
    assert.strictEqual(await membershipDeptOf(user), to)
    const res = await del(from)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
  })

  it('устаревшее членство в учреждении не блокирует удаление', async () => {
    const stale = await mkDept('Удаление: устаревшее')
    const other = await mkDept('Удаление: актуальное')
    const user = await mkUser(`stale${SUFFIX}`, other, 'active', 'Устаревший')
    await query('UPDATE user_organizations SET department_id = $1 WHERE user_id = $2', [stale, user])
    const res = await del(stale)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    assert.strictEqual(await membershipDeptOf(user), null)
    assert.strictEqual(await deptOf(user), other)
  })

  it('удаление с переводом работников в другой отдел', async () => {
    const from = await mkDept('Удаление: с переводом')
    const to = await mkDept('Удаление: приёмник')
    const a = await mkUser(`transfer-a${SUFFIX}`, from, 'active', 'Первый')
    const b = await mkUser(`transfer-b${SUFFIX}`, from, 'active', 'Второй')
    const res = await del(from, to)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    assert.strictEqual(res.data.moved, 2)
    for (const u of [a, b]) {
      assert.strictEqual(await deptOf(u), to)
      assert.strictEqual(await membershipDeptOf(u), to)
    }
    const self = await del(to, to)
    assert.strictEqual(self.status, 400)
  })

  it('состав отдела: список и перевод выбранных', async () => {
    const from = await mkDept('Состав: исходный')
    const to = await mkDept('Состав: целевой')
    const a = await mkUser(`members-a${SUFFIX}`, from, 'active', 'Составной')
    await mkUser(`members-gone${SUFFIX}`, from, 'inactive', 'Ушедший')
    const list = await call('GET', `/dictionaries/departments/${from}/members`)
    assert.strictEqual(list.status, 200)
    assert.deepStrictEqual(list.data.map((m) => m.id), [a])
    const move = await call('POST', `/dictionaries/departments/${to}/members`, { userIds: [a] })
    assert.strictEqual(move.status, 200, JSON.stringify(move.data))
    assert.strictEqual(await deptOf(a), to)
    assert.strictEqual(await membershipDeptOf(a), to)
    const empty = await call('POST', `/dictionaries/departments/${to}/members`, { userIds: [] })
    assert.strictEqual(empty.status, 400)
  })

  it('настройки отдела: запрет отпусков, флаги видимости, описание сохраняется', async () => {
    const parent = await mkDept('Настройки: родитель')
    const child = await mkDept('Настройки: дочерний')
    await query("UPDATE departments SET parent_id = $1, description = 'Старое описание' WHERE id = $2", [parent, child])
    const res = await call('PUT', `/dictionaries/departments/${child}`, {
      name: 'Настройки: дочерний', manager_id: null,
      vacation_requests_blocked: true, vac_parent_approves: false, emp_parent_sees_child: true,
    })
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    const row = (await query('SELECT * FROM departments WHERE id = $1', [child])).rows[0]
    assert.strictEqual(row.vacation_requests_blocked, true)
    assert.strictEqual(row.vac_parent_approves, false)
    assert.strictEqual(row.emp_parent_sees_child, true)
    assert.strictEqual(row.parent_id, parent)
    assert.strictEqual(row.description, 'Старое описание')
    const list = await call('GET', '/dictionaries/departments')
    const item = list.data.find((d) => d.id === child)
    assert.strictEqual(item.parent_name, 'Настройки: родитель')
    assert.strictEqual(typeof item.employee_count, 'number')
  })
})
