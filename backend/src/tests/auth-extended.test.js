import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, headers, headersJSON } from './helpers.js'

describe('Auth API (Extended)', () => {
  let testUserId
  const TEST_EMAIL = `test-register-${Date.now()}@example.com`
  const TEST_PASSWORD = 'TestPassword123!'

  afterEach(async () => {
    try {
      if (testUserId) {
        await query('DELETE FROM vacation_balances WHERE user_id = $1', [testUserId])
        await query('DELETE FROM users WHERE id = $1', [testUserId])
      }
    } catch {}
  })

  describe('POST /auth/register', () => {
    it('registers a new user successfully', async () => {
      const res = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          firstName: 'Тест',
          lastName: 'Регистрация',
          position: 'Разработчик',
          departmentId: 1,
          hireDate: '2026-01-01',
        }),
      })
      assert.ok(res.status === 201 || res.status === 429, `Expected 201 or 429, got ${res.status}`)
      if (res.status === 201) {
        const data = await res.json()
        assert.ok(data.token)
        assert.ok(data.user)
        assert.strictEqual(data.user.email, TEST_EMAIL)
        testUserId = data.user.id
      }
    })

    it('rejects duplicate email', async () => {
      const dupEmail = `dup-${Date.now()}@example.com`
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, position, department_id, role, hire_date)
         VALUES ($1, $2, 'Test', 'Dup', 'Dev', 1, 'employee', CURRENT_DATE) RETURNING id`,
        [dupEmail, passwordHash]
      )
      const dupId = result.rows[0].id

      const res = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: dupEmail,
          password: TEST_PASSWORD,
          firstName: 'Dup',
          lastName: 'Test',
          position: 'Dev',
          departmentId: 1,
        }),
      })
      assert.ok(res.status === 400 || res.status === 429, `Expected 400 or 429, got ${res.status}`)

      await query('DELETE FROM vacation_balances WHERE user_id = $1', [dupId])
      await query('DELETE FROM users WHERE id = $1', [dupId])
    })

    it('rejects invalid registration data', async () => {
      const res = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid', password: '123' }),
      })
      assert.ok(res.status === 400 || res.status === 500 || res.status === 429)
    })
  })

  describe('GET /auth/me', () => {
    it('returns current user profile', async () => {
      const loginRes = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
      })
      assert.ok(loginRes.status === 200, `Login failed: ${loginRes.status}`)
      if (loginRes.status !== 200) return
      const { token } = await loginRes.json()

      const res = await fetch(`${BASE}/auth/me`, { headers: headers(token) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.strictEqual(data.email, 'admin@example.com')
    })

    it('returns 401 without token', async () => {
      const res = await fetch(`${BASE}/auth/me`)
      assert.strictEqual(res.status, 401)
    })
  })
})
