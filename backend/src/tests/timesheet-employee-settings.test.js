import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'
import { BASE } from './helpers.js'

const stamp = Date.now()
const ids = []
let orgId, departmentId, hr, manager, first, second, unassigned, foreign, inactive
const user = async (role, dept, org = orgId, status = 'active') => {
  const { rows: [created] } = await query(
    "INSERT INTO users (email,password_hash,first_name,last_name,position,role,department_id,hire_date,status) VALUES ($1,'','Тест',$2,'Специалист',$3,$4,'2020-01-01',$5) RETURNING id",
    [`${ids.length}-${stamp}@ts-settings.invalid`, `Сотрудник ${ids.length}`, role, dept, status])
  ids.push(created.id)
  await query('INSERT INTO user_organizations (user_id,org_id,org_role,department_id) VALUES ($1,$2,$3,$4)', [created.id, org, role, dept])
  return { ...created, orgId: org, token: jwt.sign({ id: created.id }, process.env.JWT_SECRET) }
}
const call = async (method, person, body) => {
  const res = await fetch(`${BASE}/timesheet/employees/settings`, {
    method, headers: { Authorization: `Bearer ${person.token}`, 'x-organization-id': String(person.orgId), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

before(async () => {
  orgId = (await query('INSERT INTO organizations (name,slug) VALUES ($1,$2) RETURNING id', ['Настройки табеля', `ts-settings-${stamp}`])).rows[0].id
  departmentId = (await query('INSERT INTO departments (name,organization_id) VALUES ($1,$2) RETURNING id', ['Тестовый отдел', orgId])).rows[0].id
  hr = await user('hr', null); manager = await user('manager', departmentId)
  first = await user('employee', departmentId); second = await user('employee', departmentId)
  unassigned = await user('employee', null); foreign = await user('employee', null, 1); inactive = await user('employee', departmentId, orgId, 'inactive')
  await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [manager.id, departmentId])
})
after(async () => {
  await query('DELETE FROM users WHERE id = ANY($1)', [ids])
  await query('DELETE FROM departments WHERE id = $1', [departmentId])
  await query('DELETE FROM organizations WHERE id = $1', [orgId])
})

describe('Сотрудники табеля', () => {
  it('HR видит сотрудников своего учреждения без создания табеля, включая сотрудников без отдела', async () => {
    const response = await call('GET', hr)
    assert.equal(response.status, 200)
    assert.deepEqual(new Set(response.data.map(item => item.id)), new Set([hr.id, manager.id, first.id, second.id, unassigned.id]))
    assert.equal(response.data.find(item => item.id === unassigned.id).department_id, null)
    assert.equal(response.data.find(item => item.id === first.id).hourly, false)
    assert.equal(response.data.some(item => item.id === foreign.id || item.id === inactive.id), false)
    assert.equal((await call('GET', manager)).status, 403)
    assert.equal((await query('SELECT COUNT(*)::int AS count FROM timesheets WHERE organization_id = $1', [orgId])).rows[0].count, 0)
  })

  it('сохраняет несколько номеров и почасовой режим одной операцией, поддерживает обмен номерами', async () => {
    const response = await call('PUT', hr, [{ employee_id: first.id, staff_number: '001', hourly: true }, { employee_id: second.id, staff_number: '002', hourly: true }])
    assert.equal(response.status, 200, JSON.stringify(response))
    assert.equal(response.data.updated.length, 2)
    const swapped = await call('PUT', hr, [{ employee_id: first.id, staff_number: '002' }, { employee_id: second.id, staff_number: '001' }])
    assert.equal(swapped.status, 200)
    const changed = await call('PUT', hr, [{ employee_id: first.id, hourly: false }, { employee_id: second.id, hourly: false }])
    assert.equal(changed.status, 200)
    assert.deepEqual(changed.data.updated.find(item => item.employee_id === first.id), { employee_id: first.id, staff_number: '002', staff_numbers: ['002'], hourly: false })
    assert.deepEqual(changed.data.updated.find(item => item.employee_id === second.id), { employee_id: second.id, staff_number: '001', staff_numbers: ['001'], hourly: false })
  })

  it('конфликт номера или чужой сотрудник отменяют все изменения', async () => {
    assert.equal((await call('PUT', hr, [{ employee_id: first.id, staff_number: '002' }, { employee_id: second.id, staff_number: '002' }])).status, 409)
    assert.equal((await call('PUT', hr, [{ employee_id: first.id, hourly: true }, { employee_id: unassigned.id, staff_number: '001' }])).status, 409)
    assert.equal((await call('PUT', hr, [{ employee_id: first.id, hourly: true }, { employee_id: foreign.id, hourly: true }])).status, 403)
    assert.equal((await call('PUT', hr, [{ employee_id: first.id, hourly: true }, { employee_id: inactive.id, hourly: true }])).status, 403)
    const list = await call('GET', hr)
    assert.equal(list.data.find(item => item.id === first.id).hourly, false)
    assert.equal(list.data.find(item => item.id === second.id).staff_number, '001')
    assert.equal(list.data.find(item => item.id === unassigned.id).staff_number, null)
  })

  it('проверяет поля и права, позволяет настраивать сотрудника без отдела', async () => {
    assert.equal((await call('PUT', manager, [{ employee_id: first.id, hourly: true }])).status, 403)
    for (const body of [[], [{ employee_id: first.id }], [{ employee_id: first.id, hourly: 'true' }], [{ employee_id: first.id, staff_number: '1'.repeat(65) }], [{ employee_id: first.id, hourly: true }, { employee_id: first.id, hourly: false }]]) {
      assert.equal((await call('PUT', hr, body)).status, 400)
    }
    const largeBatch = Array.from({ length: 1000 }, (_, index) => ({ employee_id: 2000000000 + index, staff_number: String(index).padStart(64, '0'), hourly: true }))
    assert.equal((await call('PUT', hr, largeBatch)).status, 403)
    assert.equal((await call('PUT', hr, [{ employee_id: unassigned.id, staff_number: ' 003 ', hourly: true }])).status, 200)
    const result = (await call('GET', hr)).data.find(item => item.id === unassigned.id)
    assert.equal(result.staff_number, '003')
    assert.equal(result.hourly, true)
    const audit = await query("SELECT data FROM timesheet_audit WHERE department_id = $1 AND action = 'Настройки работника'", [departmentId])
    assert.ok(audit.rows.some(item => item.data.employee_id === first.id && item.data.after.staff_number === '002'))
  })
})
