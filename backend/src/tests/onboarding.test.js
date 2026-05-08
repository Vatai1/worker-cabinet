import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getHrToken, getEmployeeToken } from './helpers.js'

describe('Onboarding API', () => {
  let adminToken, hrToken, employeeToken
  let createdTemplateId
  let createdOnboardingId

  before(async () => {
    ;[adminToken, hrToken, employeeToken] = await Promise.all([
      getAdminToken(), getHrToken(), getEmployeeToken()
    ])
  })

  describe('Templates', () => {
    it('GET /onboarding/templates returns list for HR', async () => {
      const res = await fetch(`${BASE}/onboarding/templates`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('GET /onboarding/templates denied for employee', async () => {
      const res = await fetch(`${BASE}/onboarding/templates`, { headers: headers(employeeToken) })
      assert.strictEqual(res.status, 403)
    })

    it('POST /onboarding/templates creates template (HR)', async () => {
      const res = await fetch(`${BASE}/onboarding/templates`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          title: 'Тестовый шаблон ' + Date.now(),
          content_text: 'Описание шаблона',
          type: 'document',
        }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      assert.ok(data.id)
      createdTemplateId = data.id
    })

    it('PUT /onboarding/templates/:id updates template', async () => {
      if (!createdTemplateId) return
      const res = await fetch(`${BASE}/onboarding/templates/${createdTemplateId}`, {
        method: 'PUT',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          title: 'Обновленный шаблон',
          content_text: 'Новое описание',
        }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('DELETE /onboarding/templates/:id removes template', async () => {
      const createRes = await fetch(`${BASE}/onboarding/templates`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          title: 'Для удаления ' + Date.now(),
          content_text: 'Описание',
          type: 'document',
        }),
      })
      const created = await createRes.json()

      const res = await fetch(`${BASE}/onboarding/templates/${created.id}`, {
        method: 'DELETE',
        headers: headers(hrToken),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Onboarding Records', () => {
    it('GET /onboarding returns list for HR', async () => {
      const res = await fetch(`${BASE}/onboarding`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('GET /onboarding denied for employee', async () => {
      const res = await fetch(`${BASE}/onboarding`, { headers: headers(employeeToken) })
      assert.strictEqual(res.status, 403)
    })

    it('POST /onboarding creates onboarding (HR)', async () => {
      const res = await fetch(`${BASE}/onboarding`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          email: `onboard-test-${Date.now()}@example.com`,
          first_name: 'Тест',
          last_name: 'Онбординг',
          position: 'Разработчик',
          department_id: 1,
          template_ids: createdTemplateId ? [createdTemplateId] : [],
          password: 'password123',
        }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      assert.ok(data.id)
      createdOnboardingId = data.id
    })

    it('GET /onboarding/:id returns onboarding detail', async () => {
      if (!createdOnboardingId) return
      const res = await fetch(`${BASE}/onboarding/${createdOnboardingId}`, { headers: headers(hrToken) })
      assert.strictEqual(res.status, 200)
    })

    it('DELETE /onboarding/:id cancels onboarding', async () => {
      if (!createdOnboardingId) return
      const res = await fetch(`${BASE}/onboarding/${createdOnboardingId}`, {
        method: 'DELETE',
        headers: headers(hrToken),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Onboarding Self-service', () => {
    it('GET /onboarding/me returns onboarding for onboarding role', async () => {
      const createRes = await fetch(`${BASE}/onboarding`, {
        method: 'POST',
        headers: headersJSON(hrToken),
        body: JSON.stringify({
          email: `onboard-self-${Date.now()}@example.com`,
          first_name: 'Сам',
          last_name: 'Тест',
          position: 'Тестировщик',
          department_id: 1,
          template_ids: createdTemplateId ? [createdTemplateId] : [],
          password: 'password123',
        }),
      })
      if (createRes.status !== 201) return
      const created = await createRes.json()

      const loginRes = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: created.email, password: 'password123' }),
      })
      if (loginRes.status !== 200) {
        await fetch(`${BASE}/onboarding/${created.id}`, { method: 'DELETE', headers: headers(hrToken) })
        return
      }
      const { token } = await loginRes.json()

      const meRes = await fetch(`${BASE}/onboarding/me`, { headers: headers(token) })
      assert.strictEqual(meRes.status, 200)

      await fetch(`${BASE}/onboarding/${created.id}`, { method: 'DELETE', headers: headers(hrToken) })
    })
  })

  it('GET /onboarding without token returns 401', async () => {
    const res = await fetch(`${BASE}/onboarding`)
    assert.strictEqual(res.status, 401)
  })
})
