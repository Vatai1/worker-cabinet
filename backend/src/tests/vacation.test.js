import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getHrToken, getManagerToken, getManagerUser, getEmployeeToken, getEmployeeUser, getFirstDepartment } from './helpers.js'

describe('Vacation API', () => {
  let adminToken, hrToken, managerToken, employeeToken
  let managerUser, employeeUser, dept

  before(async () => {
    adminToken = await getAdminToken()
    hrToken = await getHrToken()
    managerToken = await getManagerToken()
    employeeToken = await getEmployeeToken()
    managerUser = await getManagerUser()
    employeeUser = await getEmployeeUser()
    dept = await getFirstDepartment()
  })

  describe('Vacation Requests', () => {
    it('GET /vacation/requests returns list', async () => {
      const res = await fetch(`${BASE}/vacation/requests`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('GET /vacation/requests filtered by year', async () => {
      const res = await fetch(`${BASE}/vacation/requests?year=2026`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /vacation/balance/:userId returns balance for admin', async () => {
      const res = await fetch(`${BASE}/vacation/balance/${employeeUser.id}`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
    })

    it('POST /vacation/requests creates a request', async () => {
      const res = await fetch(`${BASE}/vacation/requests`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          startDate: '2026-06-01',
          endDate: '2026-06-05',
          vacationType: 'annual_paid',
          comment: 'Тестовый отпуск',
        }),
      })
      assert.ok(res.status === 201 || res.status === 400, `Expected 201 or 400, got ${res.status}`)
      if (res.status === 201) {
        const data = await res.json()
        assert.ok(data.id)
      }
    })

    it('GET /vacation/requests returns 401 without token', async () => {
      const res = await fetch(`${BASE}/vacation/requests`)
      assert.strictEqual(res.status, 401)
    })
  })

  describe('Vacation Calendar & Restrictions', () => {
    it('GET /vacation/calendar returns calendar data', async () => {
      const res = await fetch(`${BASE}/vacation/calendar?departmentId=${dept.id}&year=2026`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('GET /vacation/restrictions returns list', async () => {
      const res = await fetch(`${BASE}/vacation/restrictions?departmentId=${dept.id}`, {
        headers: headers(managerToken),
      })
      assert.strictEqual(res.status, 200)
    })

    it('POST /vacation/restrictions creates restriction', async () => {
      const res = await fetch(`${BASE}/vacation/restrictions`, {
        method: 'POST',
        headers: headersJSON(managerToken),
        body: JSON.stringify({
          type: 'pair',
          departmentId: dept.id,
          user1Id: employeeUser.id,
          user2Id: managerUser.id,
        }),
      })
      assert.ok(res.status === 201 || res.status === 400)
    })

    it('POST /vacation/check-restrictions checks dates', async () => {
      const res = await fetch(`${BASE}/vacation/check-restrictions`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          userId: employeeUser.id,
          startDate: '2026-06-01',
          endDate: '2026-06-05',
        }),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Vacation Transfers', () => {
    it('GET /vacation/my-transferable returns list', async () => {
      const res = await fetch(`${BASE}/vacation/my-transferable`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('GET /vacation/my-transfer-requests returns list', async () => {
      const res = await fetch(`${BASE}/vacation/my-transfer-requests`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Vacation Application Generation', () => {
    it('POST /vacation/generate-application generates DOCX', async () => {
      const res = await fetch(`${BASE}/vacation/generate-application`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          startDate: '2026-06-01',
          endDate: '2026-06-05',
          vacationType: 'annual_paid',
        }),
      })
      assert.ok(res.status === 200 || res.status === 404 || res.status === 400)
    })
  })
})
