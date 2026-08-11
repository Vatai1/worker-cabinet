import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers as _baseHeaders, headersJSON as _baseHeadersJSON, getEmployeeToken, getEmployee2Token, getEmployee2User } from './helpers.js'
const headers = (t) => ({ ..._baseHeaders(t), 'x-organization-id': '1' })
const headersJSON = (t) => ({ ..._baseHeadersJSON(t), 'x-organization-id': '1' })

describe('User Documents API', () => {
  let employeeToken, employee2Token, employee2User

  before(async () => {
    ;[employeeToken, employee2Token] = await Promise.all([getEmployeeToken(), getEmployee2Token()])
    employee2User = await getEmployee2User()
  })

  it('GET /user-documents returns own documents', async () => {
    const res = await fetch(`${BASE}/user-documents`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /user-documents returns 401 without token', async () => {
    const res = await fetch(`${BASE}/user-documents`)
    assert.strictEqual(res.status, 401)
  })

  it('GET /user-documents/:id/download returns 404 for non-existent', async () => {
    const res = await fetch(`${BASE}/user-documents/999999/download`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 404)
  })

  it('GET /user-documents/:id/preview returns 404 for non-existent', async () => {
    const res = await fetch(`${BASE}/user-documents/999999/preview`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 404)
  })

  it('DELETE /user-documents/:id returns 404 for non-existent', async () => {
    const res = await fetch(`${BASE}/user-documents/999999`, {
      method: 'DELETE',
      headers: headers(employeeToken),
    })
    assert.strictEqual(res.status, 404)
  })
})
