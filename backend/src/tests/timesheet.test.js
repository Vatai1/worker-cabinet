import { describe, it, before } from 'node:test'
import assert from 'node:assert'

const BASE = 'http://localhost:5000/api'

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  })
  const data = await res.json()
  return data.token
}

describe('Timesheet API', () => {
  let managerToken
  let hrToken
  let employeeToken
  let timesheetId

  before(async () => {
    hrToken = await login('admin@example.com')
    managerToken = await login('alekseyfilippov0@example.com')
    employeeToken = await login('sofiyastepanova0@example.com')
  })

  it('GET /timesheet returns 401 without token', async () => {
    const res = await fetch(`${BASE}/timesheet`)
    assert.strictEqual(res.status, 401)
  })

  it('GET /timesheet returns 403 for employee', async () => {
    const res = await fetch(`${BASE}/timesheet`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    })
    assert.strictEqual(res.status, 403)
  })

  it('GET /timesheet returns array for HR', async () => {
    const res = await fetch(`${BASE}/timesheet`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('POST /timesheet creates timesheet with auto-fill (HR)', async () => {
    const deptRes = await fetch(`${BASE}/departments`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const depts = await deptRes.json()
    assert.ok(depts.length > 0, 'Need at least one department in seed')
    const deptId = depts[0].id

    const res = await fetch(`${BASE}/timesheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_id: deptId, year: 2025, month: 1 }),
    })
    assert.strictEqual(res.status, 201)
    const data = await res.json()
    assert.ok(data.id)
    assert.strictEqual(data.status, 'draft')
    timesheetId = data.id
  })

  it('POST /timesheet returns 409 on duplicate', async () => {
    const deptRes = await fetch(`${BASE}/departments`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const depts = await deptRes.json()
    const deptId = depts[0].id
    const res = await fetch(`${BASE}/timesheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_id: deptId, year: 2025, month: 1 }),
    })
    assert.strictEqual(res.status, 409)
  })

  it('GET /timesheet/:id returns timesheet with entries', async () => {
    const res = await fetch(`${BASE}/timesheet/${timesheetId}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data.entries))
  })

  it('PUT /timesheet/:id/entries updates cells', async () => {
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const ts = await tsRes.json()
    assert.ok(ts.entries.length > 0, 'Need entries to update')
    const vacationCodes = ['ОТ', 'ОС', 'ДО']
    const entry = ts.entries.find(e => !vacationCodes.includes(e.code))
    assert.ok(entry, 'Need non-vacation entry to update')

    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ employee_id: entry.employee_id, date: entry.date, code: 'Б', hours: null }]),
    })
    assert.strictEqual(res.status, 200)
  })

  it('PUT /timesheet/:id/entries returns 400 for out-of-range date', async () => {
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const ts = await tsRes.json()
    assert.ok(ts.entries.length > 0, 'Need entries to update')
    const vacationCodes = ['ОТ', 'ОС', 'ДО']
    const entry = ts.entries.find(e => !vacationCodes.includes(e.code))
    assert.ok(entry, 'Need non-vacation entry to update')

    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ employee_id: entry.employee_id, date: '2020-01-01', code: 'Я', hours: 8 }]),
    })
    assert.strictEqual(res.status, 400)
  })

  it('PUT /timesheet/:id/status draft→approved is forbidden for HR (must go via submitted)', async () => {
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    assert.strictEqual(res.status, 403)
  })

  it('PUT /timesheet/:id/status draft→submitted is forbidden for HR', async () => {
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'submitted' }),
    })
    assert.strictEqual(res.status, 403)
  })

  it('PUT /timesheet/:id/entries returns 403 for employee', async () => {
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const ts = await tsRes.json()
    const entry = ts.entries[0]

    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ employee_id: entry.employee_id, date: entry.date, code: 'Б', hours: null }]),
    })
    assert.strictEqual(res.status, 403)
  })
})
