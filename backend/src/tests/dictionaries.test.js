import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getHrToken, getEmployeeToken } from './helpers.js'

describe('Dictionaries API', () => {
  let hrToken, employeeToken

  before(async () => {
    ;[hrToken, employeeToken] = await Promise.all([getHrToken(), getEmployeeToken()])
  })

  describe('Departments Dictionary', () => {
    it('GET /dictionaries/departments returns list (HR)', async () => {
      const res = await fetch(`${BASE}/dictionaries/departments`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('POST /dictionaries/departments creates department', async () => {
      const res = await fetch(`${BASE}/dictionaries/departments`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ name: 'Тестовый отдел ' + Date.now() }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      assert.ok(data.id)
    })

    it('PUT /dictionaries/departments/:id updates department', async () => {
      const createRes = await fetch(`${BASE}/dictionaries/departments`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ name: 'Для обновления ' + Date.now() }),
      })
      const created = await createRes.json()

      const res = await fetch(`${BASE}/dictionaries/departments/${created.id}`, {
        method: 'PUT',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ name: 'Обновленный отдел ' + Date.now() }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('DELETE /dictionaries/departments/:id removes empty department', async () => {
      const createRes = await fetch(`${BASE}/dictionaries/departments`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ name: 'Для удаления ' + Date.now() }),
      })
      const created = await createRes.json()

      const res = await fetch(`${BASE}/dictionaries/departments/${created.id}`, {
        method: 'DELETE',
        headers: headers(hrToken),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Skills Dictionary', () => {
    it('GET /dictionaries/skills returns list (HR)', async () => {
      const res = await fetch(`${BASE}/dictionaries/skills`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('POST /dictionaries/skills creates skill', async () => {
      const res = await fetch(`${BASE}/dictionaries/skills`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ name: 'TestSkill_Dict_' + Date.now() }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      assert.ok(data.id)
    })

    it('PUT /dictionaries/skills/:id updates skill', async () => {
      const createRes = await fetch(`${BASE}/dictionaries/skills`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ name: 'SkillToUpdate_' + Date.now() }),
      })
      const created = await createRes.json()

      const res = await fetch(`${BASE}/dictionaries/skills/${created.id}`, {
        method: 'PUT',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ name: 'UpdatedSkill_' + Date.now() }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('DELETE /dictionaries/skills/:id removes unused skill', async () => {
      const createRes = await fetch(`${BASE}/dictionaries/skills`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ name: 'SkillToDelete_' + Date.now() }),
      })
      const created = await createRes.json()

      const res = await fetch(`${BASE}/dictionaries/skills/${created.id}`, {
        method: 'DELETE',
        headers: headers(hrToken),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Vacation Types Dictionary', () => {
    it('GET /dictionaries/vacation-types returns list (HR)', async () => {
      const res = await fetch(`${BASE}/dictionaries/vacation-types`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('POST /dictionaries/vacation-types creates type', async () => {
      const res = await fetch(`${BASE}/dictionaries/vacation-types`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          code: 'TEST_' + Date.now(),
          name: 'Тестовый тип отпуска',
          description: 'Тест',
        }),
      })
      assert.ok(res.status === 201 || res.status === 409)
    })
  })

  describe('Other Dictionaries', () => {
    it('GET /dictionaries/positions returns list (HR)', async () => {
      const res = await fetch(`${BASE}/dictionaries/positions`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('GET /dictionaries/doc-templates returns list (HR)', async () => {
      const res = await fetch(`${BASE}/dictionaries/doc-templates`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('GET /dictionaries/managers returns list (HR)', async () => {
      const res = await fetch(`${BASE}/dictionaries/managers`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })
  })

  describe('Access Control', () => {
    it('GET /dictionaries/departments denied for employee', async () => {
      const res = await fetch(`${BASE}/dictionaries/departments`, { headers: headers(employeeToken) })
      assert.strictEqual(res.status, 403)
    })

    it('GET /dictionaries/departments returns 401 without token', async () => {
      const res = await fetch(`${BASE}/dictionaries/departments`)
      assert.strictEqual(res.status, 401)
    })
  })
})
