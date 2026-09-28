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

async function del(deptId) {
  const token = await login('admin@example.com')
  const res = await fetch(`${BASE}/dictionaries/departments/${deptId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

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
})
