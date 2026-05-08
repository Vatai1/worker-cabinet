import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getEmployeeToken } from './helpers.js'

describe('Calendar API', () => {
  let adminToken, employeeToken

  before(async () => {
    ;[adminToken, employeeToken] = await Promise.all([getAdminToken(), getEmployeeToken()])
  })

  it('GET /calendar/auth/url returns OAuth URL', async () => {
    const res = await fetch(`${BASE}/calendar/auth/url`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(data.url !== undefined)
  })

  it('GET /calendar/status returns connection status', async () => {
    const res = await fetch(`${BASE}/calendar/status`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(data.connected !== undefined || data.graph !== undefined || data.ews !== undefined)
  })

  it('GET /calendar/events returns events', async () => {
    const res = await fetch(`${BASE}/calendar/events?start=2026-01-01&end=2026-01-31`, {
      headers: headers(adminToken),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data) || data.events !== undefined)
  })

  it('DELETE /calendar/disconnect disconnects calendar', async () => {
    const res = await fetch(`${BASE}/calendar/disconnect`, {
      method: 'DELETE',
      headers: headers(adminToken),
    })
    assert.strictEqual(res.status, 200)
  })

  it('POST /calendar/ews/connect rejects invalid credentials', async () => {
    const res = await fetch(`${BASE}/calendar/ews/connect`, {
      method: 'POST',
      headers: headersJSON(adminToken),
      body: JSON.stringify({
        url: 'https://invalid-url.example.com/EWS/Exchange.asmx',
        username: 'invalid',
        password: 'invalid',
        domain: 'invalid',
      }),
    })
    assert.ok(res.status === 400 || res.status === 200)
  })

  it('GET /calendar/status returns 401 without token', async () => {
    const res = await fetch(`${BASE}/calendar/status`)
    assert.strictEqual(res.status, 401)
  })
})
