import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const SUFFIX = `@dept-scheme-${Date.now()}.test`
const depts = {}
const users = {}

async function mkUser(tag) {
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
     VALUES ($1, $2, 'Иван', 'Схемный', 'Специалист', 'employee', '2020-01-01', 'active') RETURNING id`,
    [`${tag}${SUFFIX}`, hash]
  )).rows[0].id
  await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'employee', true)", [id])
  return id
}

async function mkDept(name, parentId, managerId) {
  return (await query('INSERT INTO departments (name, organization_id, parent_id, manager_id) VALUES ($1, 1, $2, $3) RETURNING id', [name, parentId, managerId])).rows[0].id
}

async function call(method, path, email, body) {
  const token = await login(email)
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const scheme = { nodes: [{ id: 't1', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Схема' } }], edges: [] }

describe('Внутренняя схема отдела — права руководителя', () => {
  before(async () => {
    users.boss = await mkUser('boss')
    users.other = await mkUser('other')
    users.plain = await mkUser('plain')
    depts.top = await mkDept(`Схема: верх ${Date.now()}`, null, users.other)
    depts.x = await mkDept(`Схема: X ${Date.now()}`, depts.top, users.boss)
    depts.child = await mkDept(`Схема: дочерний ${Date.now()}`, depts.x, null)
    depts.grandchild = await mkDept(`Схема: внучатый ${Date.now()}`, depts.child, null)
    depts.side = await mkDept(`Схема: соседний ${Date.now()}`, null, users.other)
  })

  after(async () => {
    const ids = Object.values(depts)
    await query('DELETE FROM department_hierarchy WHERE department_id = ANY($1)', [ids])
    await query('UPDATE departments SET parent_id = NULL WHERE id = ANY($1)', [ids])
    await query('DELETE FROM departments WHERE id = ANY($1)', [ids])
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
  })

  it('руководитель X редактирует X и все нижестоящие', async () => {
    const boss = `boss${SUFFIX}`
    for (const id of [depts.x, depts.child, depts.grandchild]) {
      const put = await call('PUT', `/hierarchy/department/${id}`, boss, scheme)
      assert.strictEqual(put.status, 200, JSON.stringify(put.data))
      const get = await call('GET', `/hierarchy/department/${id}`, boss)
      assert.strictEqual(get.data.can_edit, true)
      assert.strictEqual(get.data.data.nodes.length, 1)
    }
    const mine = await call('GET', '/hierarchy/my-departments', boss)
    assert.deepStrictEqual(mine.data.map((d) => d.id).sort((a, b) => a - b), [depts.x, depts.child, depts.grandchild].sort((a, b) => a - b))
  })

  it('вышестоящий и соседний отдел руководителю X недоступны', async () => {
    const boss = `boss${SUFFIX}`
    for (const id of [depts.top, depts.side]) {
      const put = await call('PUT', `/hierarchy/department/${id}`, boss, scheme)
      assert.strictEqual(put.status, 403)
      const get = await call('GET', `/hierarchy/department/${id}`, boss)
      assert.strictEqual(get.status, 200)
      assert.strictEqual(get.data.can_edit, false)
    }
  })

  it('обычный сотрудник только смотрит, HR — редактирует', async () => {
    const put = await call('PUT', `/hierarchy/department/${depts.x}`, `plain${SUFFIX}`, scheme)
    assert.strictEqual(put.status, 403)
    const mine = await call('GET', '/hierarchy/my-departments', `plain${SUFFIX}`)
    assert.deepStrictEqual(mine.data, [])
    const hr = await call('PUT', `/hierarchy/department/${depts.side}`, 'admin@example.com', scheme)
    assert.strictEqual(hr.status, 200)
  })
})
