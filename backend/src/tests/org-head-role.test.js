import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const SUFFIX = `@org-head-${Date.now()}.test`
let originalHeadId
const createdDepts = []

async function mkUser(tag, role = 'employee') {
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
     VALUES ($1, $2, 'Иван', 'Руководящий', 'Директор', $3, '2020-01-01', 'active') RETURNING id`,
    [`${tag}${SUFFIX}`, hash, role]
  )).rows[0].id
  await query('INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, $2, true)', [id, role])
  return id
}

async function setHead(headId) {
  const token = await login('admin@example.com')
  const res = await fetch(`${BASE}/organizations/1`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
    body: JSON.stringify({ head_id: headId }),
  })
  assert.strictEqual(res.status, 200, JSON.stringify(await res.json().catch(() => null)))
}

async function roles(userId) {
  const r = await query(
    'SELECT u.role, uo.org_role FROM users u JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = 1 WHERE u.id = $1',
    [userId]
  )
  return r.rows[0]
}

describe('Руководитель учреждения — роль руководителя', () => {
  before(async () => {
    originalHeadId = (await query('SELECT head_id FROM organizations WHERE id = 1')).rows[0].head_id
  })

  after(async () => {
    await query('UPDATE organizations SET head_id = $1 WHERE id = 1', [originalHeadId])
    await query('DELETE FROM departments WHERE id = ANY($1)', [createdDepts])
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
  })

  it('назначение выдаёт роль, снятие — забирает', async () => {
    const u = await mkUser('head')
    await setHead(u)
    assert.deepStrictEqual(await roles(u), { role: 'manager', org_role: 'manager' })
    await setHead(null)
    assert.deepStrictEqual(await roles(u), { role: 'employee', org_role: 'employee' })
  })

  it('смена руководителя: новому выдаётся, прежнему снимается', async () => {
    const a = await mkUser('head-a')
    const b = await mkUser('head-b')
    await setHead(a)
    await setHead(b)
    assert.deepStrictEqual(await roles(a), { role: 'employee', org_role: 'employee' })
    assert.deepStrictEqual(await roles(b), { role: 'manager', org_role: 'manager' })
    await setHead(null)
  })

  it('руководитель отдела сохраняет роль после снятия с учреждения', async () => {
    const u = await mkUser('head-dept')
    const dept = (await query("INSERT INTO departments (name, organization_id, manager_id) VALUES ('Руководящий отдел', 1, $1) RETURNING id", [u])).rows[0].id
    createdDepts.push(dept)
    await setHead(u)
    await setHead(null)
    assert.deepStrictEqual(await roles(u), { role: 'manager', org_role: 'manager' })
  })

  it('HR и админ не понижаются', async () => {
    const hr = await mkUser('head-hr', 'hr')
    await setHead(hr)
    assert.deepStrictEqual(await roles(hr), { role: 'hr', org_role: 'hr' })
    await setHead(null)
    assert.deepStrictEqual(await roles(hr), { role: 'hr', org_role: 'hr' })
  })
})
