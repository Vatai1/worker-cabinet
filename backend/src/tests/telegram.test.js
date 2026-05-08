import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getEmployeeToken } from './helpers.js'

describe('Telegram API', () => {
  let adminToken, employeeToken

  before(async () => {
    ;[adminToken, employeeToken] = await Promise.all([getAdminToken(), getEmployeeToken()])
  })

  it('GET /telegram/bot-info returns bot info', async () => {
    const res = await fetch(`${BASE}/telegram/bot-info`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(data.available !== undefined)
  })

  it('GET /telegram/user-status returns connection status', async () => {
    const res = await fetch(`${BASE}/telegram/user-status`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(data.connected !== undefined)
  })

  it('POST /telegram/disconnect disconnects account', async () => {
    const res = await fetch(`${BASE}/telegram/disconnect`, {
      method: 'POST',
      headers: headersJSON(adminToken),
    })
    assert.strictEqual(res.status, 200)
  })

  it('POST /telegram/toggle-notifications toggles notifications', async () => {
    const res = await fetch(`${BASE}/telegram/toggle-notifications`, {
      method: 'POST',
      headers: headersJSON(adminToken),
      body: JSON.stringify({ enabled: true }),
    })
    assert.ok(res.status === 200 || res.status === 400)
  })

  it('POST /telegram/connect attempts connection', async () => {
    const res = await fetch(`${BASE}/telegram/connect`, {
      method: 'POST',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ username: 'test_user_not_real' }),
    })
    assert.ok(res.status === 200 || res.status === 400 || res.status === 404)
  })

  it('GET /telegram/bot-info returns 401 without token', async () => {
    const res = await fetch(`${BASE}/telegram/bot-info`)
    assert.strictEqual(res.status, 401)
  })
})
