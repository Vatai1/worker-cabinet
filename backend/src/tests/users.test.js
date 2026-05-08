import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getHrToken, getManagerToken, getManagerUser, getEmployeeToken, getEmployeeUser, getEmployee2User } from './helpers.js'

describe('Users API', () => {
  let adminToken, hrToken, managerToken, employeeToken
  let managerUser, employeeUser, employee2User

  before(async () => {
    ;[adminToken, hrToken, managerToken, employeeToken] = await Promise.all([
      getAdminToken(), getHrToken(), getManagerToken(), getEmployeeToken()
    ])
    ;[managerUser, employeeUser, employee2User] = await Promise.all([
      getManagerUser(), getEmployeeUser(), getEmployee2User()
    ])
  })

  it('GET /users returns list for admin', async () => {
    const res = await fetch(`${BASE}/users`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
    assert.ok(data.length > 0)
  })

  it('GET /users returns own profile for employee', async () => {
    const res = await fetch(`${BASE}/users`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /users/search finds users by name', async () => {
    const res = await fetch(`${BASE}/users/search?q=${employeeUser.first_name}`, {
      headers: headers(adminToken),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /users/skills/all returns skills list', async () => {
    const res = await fetch(`${BASE}/users/skills/all`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /users/positions/all returns positions list', async () => {
    const res = await fetch(`${BASE}/users/positions/all`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /users/:id returns own profile', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.id, employeeUser.id)
  })

  it('GET /users/:id denies employee from viewing other profile', async () => {
    const res = await fetch(`${BASE}/users/${managerUser.id}`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 403)
  })

  it('PUT /users/:id updates own profile', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}`, {
      method: 'PUT',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ phone: '+79990001122' }),
    })
    assert.strictEqual(res.status, 200)
  })

  it('POST /users/:id/skills adds a skill', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}/skills`, {
      method: 'POST',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ skill: 'TestSkill_Unique_12345' }),
    })
    assert.ok(res.status === 200 || res.status === 201)
  })

  it('DELETE /users/:id/skills removes a skill', async () => {
    await fetch(`${BASE}/users/${employeeUser.id}/skills`, {
      method: 'POST',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ skill: 'TestSkill_Remove_12345' }),
    })

    const res = await fetch(`${BASE}/users/${employeeUser.id}/skills`, {
      method: 'DELETE',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ skill: 'TestSkill_Remove_12345' }),
    })
    assert.strictEqual(res.status, 200)
  })

  it('POST /users/:id/projects adds a personal project', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}/projects`, {
      method: 'POST',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ name: 'Test Project', description: 'Test desc', role: 'developer' }),
    })
    assert.ok(res.status === 201 || res.status === 200)
    const data = await res.json()
    assert.ok(data.id)
  })

  it('GET /users/:id returns 401 without token', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}`)
    assert.strictEqual(res.status, 401)
  })
})
