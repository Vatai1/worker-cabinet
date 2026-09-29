import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const SUFFIX = `@bulk-actions-${Date.now()}.test`
const users = []
let fromDept
let toDept

async function mkUser(tag) {
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date, status)
     VALUES ($1, $2, 'Иван', 'Массовый', 'Стажёр', 'employee', $3, '2020-01-01', 'active') RETURNING id`,
    [`${tag}${SUFFIX}`, hash, fromDept]
  )).rows[0].id
  await query("INSERT INTO user_organizations (user_id, org_id, org_role, department_id, is_active) VALUES ($1, 1, 'employee', $2, true)", [id, fromDept])
  return id
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

describe('Массовые действия: должность и отдел', () => {
  before(async () => {
    fromDept = (await query("INSERT INTO departments (name, organization_id) VALUES ($1, 1) RETURNING id", [`Массовый исходный ${Date.now()}`])).rows[0].id
    toDept = (await query("INSERT INTO departments (name, organization_id) VALUES ($1, 1) RETURNING id", [`Массовый целевой ${Date.now()}`])).rows[0].id
    users.push(await mkUser('a'), await mkUser('b'))
  })

  after(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
    await query('DELETE FROM departments WHERE id = ANY($1)', [[fromDept, toDept]])
  })

  it('смена должности у выбранных', async () => {
    const res = await call('PUT', '/users/bulk-position', 'admin@example.com', { userIds: users, position: '  Ведущий специалист  ' })
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    assert.strictEqual(res.data.updated, 2)
    const rows = (await query('SELECT position FROM users WHERE id = ANY($1)', [users])).rows
    assert.ok(rows.every((r) => r.position === 'Ведущий специалист'))
  })

  it('пустая должность и пустой список отклоняются, сотрудник — 403', async () => {
    assert.strictEqual((await call('PUT', '/users/bulk-position', 'admin@example.com', { userIds: users, position: ' ' })).status, 400)
    assert.strictEqual((await call('PUT', '/users/bulk-position', 'admin@example.com', { userIds: [], position: 'X' })).status, 400)
    assert.strictEqual((await call('PUT', '/users/bulk-position', 'ivanov@example.com', { userIds: users, position: 'X' })).status, 403)
  })

  it('перевод выбранных в другой отдел с синхронизацией членства', async () => {
    const res = await call('POST', `/dictionaries/departments/${toDept}/members`, 'admin@example.com', { userIds: users })
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    const rows = (await query(
      'SELECT u.department_id, uo.department_id AS org_dept FROM users u JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = 1 WHERE u.id = ANY($1)',
      [users]
    )).rows
    assert.ok(rows.every((r) => r.department_id === toDept && r.org_dept === toDept))
  })
})
