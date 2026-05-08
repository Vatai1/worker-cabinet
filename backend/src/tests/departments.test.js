import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getHrToken, getEmployeeToken, getFirstDepartment } from './helpers.js'

describe('Departments API', () => {
  let adminToken, hrToken, employeeToken, dept

  before(async () => {
    ;[adminToken, hrToken, employeeToken] = await Promise.all([
      getAdminToken(), getHrToken(), getEmployeeToken()
    ])
    dept = await getFirstDepartment()
  })

  it('GET /departments returns list for authenticated user', async () => {
    const res = await fetch(`${BASE}/departments`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
    assert.ok(data.length > 0)
  })

  it('GET /departments/:id returns department', async () => {
    const res = await fetch(`${BASE}/departments/${dept.id}`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.id, dept.id)
    assert.ok(data.name)
  })

  it('GET /departments/:id returns 404 for non-existent', async () => {
    const res = await fetch(`${BASE}/departments/999999`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 404)
  })

  it('PATCH /departments/:id/vacation-block blocks vacations (HR)', async () => {
    const res = await fetch(`${BASE}/departments/${dept.id}/vacation-block`, {
      method: 'PATCH',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ blocked: true }),
    })
    assert.ok(res.status === 200 || res.status === 400)

    const unblock = await fetch(`${BASE}/departments/${dept.id}/vacation-block`, {
      method: 'PATCH',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ blocked: false }),
    })
    assert.ok(unblock.status === 200 || unblock.status === 400)
  })

  it('PATCH /departments/:id/vacation-block denied for employee', async () => {
    const res = await fetch(`${BASE}/departments/${dept.id}/vacation-block`, {
      method: 'PATCH',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ blocked: true }),
    })
    assert.strictEqual(res.status, 403)
  })

  it('PATCH /departments/vacation-block-all (HR)', async () => {
    const res = await fetch(`${BASE}/departments/vacation-block-all`, {
      method: 'PATCH',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ blocked: false }),
    })
    assert.ok(res.status === 200 || res.status === 400)
  })

  it('GET /departments returns 401 without token', async () => {
    const res = await fetch(`${BASE}/departments`)
    assert.strictEqual(res.status, 401)
  })
})
