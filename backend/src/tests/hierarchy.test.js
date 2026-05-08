import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getHrToken, getEmployeeToken, getFirstDepartment } from './helpers.js'

describe('Hierarchy API', () => {
  let hrToken, employeeToken, dept

  before(async () => {
    ;[hrToken, employeeToken] = await Promise.all([getHrToken(), getEmployeeToken()])
    dept = await getFirstDepartment()
  })

  it('GET /hierarchy returns hierarchy data', async () => {
    const res = await fetch(`${BASE}/hierarchy`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(data.data !== undefined)
  })

  it('PUT /hierarchy saves hierarchy (HR)', async () => {
    const res = await fetch(`${BASE}/hierarchy`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify({
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    })
    assert.strictEqual(res.status, 200)
  })

  it('GET /hierarchy/department/:id returns department hierarchy', async () => {
    const res = await fetch(`${BASE}/hierarchy/department/${dept.id}`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
  })

  it('PUT /hierarchy/department/:id saves department hierarchy (HR)', async () => {
    const res = await fetch(`${BASE}/hierarchy/department/${dept.id}`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify({
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    })
    assert.strictEqual(res.status, 200)
  })

  it('PUT /hierarchy denied for employee', async () => {
    const res = await fetch(`${BASE}/hierarchy`, {
      method: 'PUT',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
    })
    assert.strictEqual(res.status, 403)
  })

  it('GET /hierarchy returns 401 without token', async () => {
    const res = await fetch(`${BASE}/hierarchy`)
    assert.strictEqual(res.status, 401)
  })
})
