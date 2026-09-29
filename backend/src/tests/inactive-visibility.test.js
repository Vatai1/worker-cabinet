import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const SUFFIX = `@inactive-vis-${Date.now()}.test`
const MARK = `Невидимов${Date.now() % 100000}`
let dept
let active
let inactive
let project

async function mkUser(tag, status) {
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date, status)
     VALUES ($1, $2, 'Иван', $3, 'Специалист', 'employee', $4, '2020-01-01', $5) RETURNING id`,
    [`${tag}${SUFFIX}`, hash, MARK, dept, status]
  )).rows[0].id
  await query("INSERT INTO user_organizations (user_id, org_id, org_role, department_id, is_active) VALUES ($1, 1, 'employee', $2, true)", [id, dept])
  return id
}

async function get(path) {
  const token = await login('admin@example.com')
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, 'X-Organization-Id': '1' } })
  assert.strictEqual(res.status, 200, path)
  return res.json()
}

const ids = (rows) => rows.map((r) => r.id).filter((id) => id === active || id === inactive)

describe('Неактивные сотрудники скрыты', () => {
  before(async () => {
    dept = (await query('INSERT INTO departments (name, organization_id) VALUES ($1, 1) RETURNING id', [`Отдел ${MARK}`])).rows[0].id
    active = await mkUser('active', 'active')
    inactive = await mkUser('inactive', 'inactive')
    project = (await query(
      "INSERT INTO company_projects (name, organization_id, created_by) VALUES ($1, 1, $2) RETURNING id",
      [`Проект ${MARK}`, active]
    ).catch(() => ({ rows: [{}] }))).rows[0].id
    if (project) {
      await query("INSERT INTO company_project_members (project_id, user_id, role) VALUES ($1, $2, 'member'), ($1, $3, 'member')", [project, active, inactive])
    }
  })

  after(async () => {
    if (project) await query('DELETE FROM company_projects WHERE id = $1', [project])
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
    await query('DELETE FROM departments WHERE id = $1', [dept])
  })

  it('список работников, отдел и счётчик — только активные', async () => {
    assert.deepStrictEqual(ids(await get('/users')), [active])
    const d = await get(`/departments/${dept}`)
    assert.deepStrictEqual(ids(d.employees), [active])
    const all = await get('/departments')
    const row = all.find((x) => x.id === dept)
    assert.strictEqual(Number(row.employee_count), 1)
    assert.deepStrictEqual(ids(row.employees), [active])
  })

  it('поиск по умолчанию скрывает, фильтр «Отключён» находит', async () => {
    assert.deepStrictEqual(ids(await get(`/users/search?q=${encodeURIComponent(MARK)}`)), [active])
    assert.deepStrictEqual(ids(await get(`/users/search?q=${encodeURIComponent(MARK)}&orgIsActive=false`)), [inactive])
  })

  it('участники проекта — только активные', async () => {
    if (!project) return
    const projects = await get('/projects')
    const p = projects.find((x) => x.id === project)
    assert.ok(p)
    assert.deepStrictEqual(p.members.map((m) => m.id ?? m.user_id).filter((id) => id === active || id === inactive), [active])
  })
})
