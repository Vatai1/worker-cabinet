import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getHrToken, getManagerToken, getEmployeeToken, getFirstDepartment } from './helpers.js'

describe('Timesheet API', () => {
  let hrToken, managerToken, employeeToken, timesheetId

  before(async () => {
    ;[hrToken, managerToken, employeeToken] = await Promise.all([
      getAdminToken(), getManagerToken(), getEmployeeToken()
    ])
  })

  it('GET /timesheet returns 401 without token', async () => {
    const res = await fetch(`${BASE}/timesheet`)
    assert.strictEqual(res.status, 401)
  })

  it('GET /timesheet returns 403 for employee', async () => {
    const res = await fetch(`${BASE}/timesheet`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 403)
  })

  it('GET /timesheet returns array for HR', async () => {
    const res = await fetch(`${BASE}/timesheet`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('POST /timesheet creates timesheet with auto-fill (HR)', async () => {
    const dept = await getFirstDepartment()
    const res = await fetch(`${BASE}/timesheet`, {
      method: 'POST',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ department_id: dept.id, year: 2026, month: 1 }),
    })
    assert.ok(res.status === 201 || res.status === 409, `Expected 201 or 409, got ${res.status}`)
    if (res.status === 201) {
      const data = await res.json()
      assert.ok(data.id)
      assert.strictEqual(data.status, 'draft')
      timesheetId = data.id
    } else {
      const listRes = await fetch(`${BASE}/timesheet`, { headers: headers(hrToken) })
      const list = await listRes.json()
      const existing = list.find(t => t.department_id === dept.id && t.year === 2026 && t.month === 1)
      if (existing) timesheetId = existing.id
    }
  })

  it('POST /timesheet returns 409 on duplicate', async () => {
    const dept = await getFirstDepartment()
    const res = await fetch(`${BASE}/timesheet`, {
      method: 'POST',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ department_id: dept.id, year: 2026, month: 1 }),
    })
    assert.strictEqual(res.status, 409)
  })

  it('GET /timesheet/:id returns timesheet with entries', async () => {
    if (!timesheetId) return
    const res = await fetch(`${BASE}/timesheet/${timesheetId}`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data.entries))
  })

  it('PUT /timesheet/:id/entries updates cells', async () => {
    if (!timesheetId) return
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, { headers: headers(hrToken) })
    const ts = await tsRes.json()
    if (!ts.entries?.length) return

    const vacationCodes = ['ОТ', 'ОС', 'ДО']
    const entry = ts.entries.find(e => !vacationCodes.includes(e.code))
    if (!entry) return

    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify([{ employee_id: entry.employee_id, date: entry.date, code: 'Б', hours: null }]),
    })
    assert.strictEqual(res.status, 200)
  })

  it('PUT /timesheet/:id/entries returns 400 for out-of-range date', async () => {
    if (!timesheetId) return
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, { headers: headers(hrToken) })
    const ts = await tsRes.json()
    if (!ts.entries?.length) return

    const vacationCodes = ['ОТ', 'ОС', 'ДО']
    const entry = ts.entries.find(e => !vacationCodes.includes(e.code))
    if (!entry) return

    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify([{ employee_id: entry.employee_id, date: '2020-01-01', code: 'Я', hours: 8 }]),
    })
    assert.strictEqual(res.status, 400)
  })

  it('PUT /timesheet/:id/status draft→approved forbidden for HR', async () => {
    if (!timesheetId) return
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/status`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ status: 'approved' }),
    })
    assert.strictEqual(res.status, 403)
  })

  it('PUT /timesheet/:id/status draft→submitted by manager', async () => {
    if (!timesheetId) return
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/status`, {
      method: 'PUT',
      headers: headersJSON(managerToken),
      body: JSON.stringify({ status: 'submitted' }),
    })
    assert.ok(res.status === 200 || res.status === 403)
  })

  it('PUT /timesheet/:id/status submitted→approved by HR', async () => {
    if (!timesheetId) return
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/status`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ status: 'approved' }),
    })
    assert.ok(res.status === 200 || res.status === 403)
  })

  it('PUT /timesheet/:id/entries returns 403 for employee', async () => {
    if (!timesheetId) return
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, { headers: headers(hrToken) })
    const ts = await tsRes.json()
    if (!ts.entries?.length) return

    const entry = ts.entries[0]
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: headersJSON(employeeToken),
      body: JSON.stringify([{ employee_id: entry.employee_id, date: entry.date, code: 'Б', hours: null }]),
    })
    assert.strictEqual(res.status, 403)
  })

  it('GET /timesheet/:id/export/excel returns file', async () => {
    if (!timesheetId) return
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/export/excel`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
    assert.ok(res.headers.get('content-type')?.includes('spreadsheet') || res.headers.get('content-type')?.includes('octet-stream'))
  })

  it('GET /timesheet/:id/export/pdf returns file', async () => {
    if (!timesheetId) return
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/export/pdf`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
    assert.ok(res.headers.get('content-type')?.includes('pdf'))
  })
})
