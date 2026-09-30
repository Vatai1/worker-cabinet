import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login, headersJSON, getHrToken } from './helpers.js'

const STAMP = Date.now()
const EMAIL = `multi-mgr-${STAMP}@multi-dept.test`
let managerId
const deptIds = []
const timesheetIds = []

const call = async (method, path, body, token) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: headersJSON(token), body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => null) }
}

describe('Руководитель нескольких отделов', () => {
  before(async () => {
    const hash = await bcrypt.hash('password123', 4)
    managerId = (await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
       VALUES ($1, $2, 'Мультин', 'Руководов', 'Руководитель', 'manager', '2015-01-01', 'active') RETURNING id`,
      [EMAIL, hash]
    )).rows[0].id
    await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'manager', true)", [managerId])
    for (const name of ['А', 'Б', 'В']) {
      deptIds.push((await query('INSERT INTO departments (name, organization_id) VALUES ($1, 1) RETURNING id', [`Мульти ${name} ${STAMP}`])).rows[0].id)
    }
  })

  after(async () => {
    await query('DELETE FROM timesheet_entries WHERE timesheet_id = ANY($1)', [timesheetIds])
    await query('DELETE FROM timesheets WHERE id = ANY($1)', [timesheetIds])
    await query('UPDATE departments SET manager_id = NULL WHERE id = ANY($1)', [deptIds])
    await query('DELETE FROM departments WHERE id = ANY($1)', [deptIds])
    await query('DELETE FROM users WHERE id = $1', [managerId])
  })

  it('HR назначает одного работника руководителем двух отделов', async () => {
    const hr = await getHrToken()
    for (const id of deptIds.slice(0, 2)) {
      const res = await call('PUT', `/dictionaries/departments/${id}`, { name: (await query('SELECT name FROM departments WHERE id = $1', [id])).rows[0].name, manager_id: managerId }, hr)
      assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    }
    const managed = (await query('SELECT id FROM departments WHERE manager_id = $1 ORDER BY id', [managerId])).rows.map((r) => r.id)
    assert.deepStrictEqual(managed, deptIds.slice(0, 2))
  })

  it('табель: видит оба отдела, создаёт табель для каждого, без отдела — просьба указать, чужой — 403', async () => {
    const token = await login(EMAIL)
    const mine = await call('GET', '/timesheet/my-departments', undefined, token)
    assert.strictEqual(mine.status, 200)
    assert.deepStrictEqual(mine.data.map((d) => d.id).sort(), deptIds.slice(0, 2).sort())

    const noDept = await call('POST', '/timesheet', { year: 2031, month: 3 }, token)
    assert.strictEqual(noDept.status, 400)
    assert.match(noDept.data.error, /несколькими отделами/)

    for (const id of deptIds.slice(0, 2)) {
      const res = await call('POST', '/timesheet', { department_id: id, year: 2031, month: 3 }, token)
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      timesheetIds.push(res.data.id)
    }
    const foreign = await call('POST', '/timesheet', { department_id: deptIds[2], year: 2031, month: 3 }, token)
    assert.strictEqual(foreign.status, 403)

    const list = await call('GET', '/timesheet', undefined, token)
    assert.deepStrictEqual(list.data.filter((t) => timesheetIds.includes(t.id)).map((t) => t.department_id).sort(), deptIds.slice(0, 2).sort())
  })
})
