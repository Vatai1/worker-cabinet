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

describe('Templates API', () => {
  let hrToken
  let employeeToken

  before(async () => {
    employeeToken = await login('ivanov@example.com')
    hrToken = await login('elena@example.com')
  })

  it('GET /templates returns array for authenticated user', async () => {
    const res = await fetch(`${BASE}/templates`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /templates returns 401 without token', async () => {
    const res = await fetch(`${BASE}/templates`)
    assert.strictEqual(res.status, 401)
  })

  it('POST /templates returns 403 for employee role', async () => {
    const formData = new FormData()
    formData.append('name', 'Test')
    formData.append('category', 'hr')
    const res = await fetch(`${BASE}/templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}` },
      body: formData,
    })
    assert.strictEqual(res.status, 403)
  })

  it('GET /templates returns 200 for HR user', async () => {
    const res = await fetch(`${BASE}/templates`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('PUT /templates/:id returns 403 for employee role', async () => {
    const listRes = await fetch(`${BASE}/templates`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const templates = await listRes.json()
    if (!templates.length) return
    const res = await fetch(`${BASE}/templates/${templates[0].id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hack', category: 'hr' }),
    })
    assert.strictEqual(res.status, 403)
  })
})
