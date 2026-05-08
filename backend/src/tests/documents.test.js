import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, getAdminToken, getEmployeeToken } from './helpers.js'

describe('Documents API', () => {
  let adminToken, employeeToken

  before(async () => {
    ;[adminToken, employeeToken] = await Promise.all([getAdminToken(), getEmployeeToken()])
  })

  it('GET /documents returns list for authenticated user', async () => {
    const res = await fetch(`${BASE}/documents`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /documents returns empty or populated array for employee', async () => {
    const res = await fetch(`${BASE}/documents`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /documents returns 401 without token', async () => {
    const res = await fetch(`${BASE}/documents`)
    assert.strictEqual(res.status, 401)
  })
})
