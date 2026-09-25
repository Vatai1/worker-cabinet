import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { createSession } from '../lib/sessionTokens.js'
import { BASE } from './helpers.js'

async function refresh(rawToken) {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'test-csrf',
      Cookie: `csrf_token=test-csrf; auth_refresh_token=${rawToken}`,
    },
  })
  const setCookies = res.headers.getSetCookie().filter(c => c.startsWith('auth_'))
  const refreshCookie = setCookies.find(c => c.startsWith('auth_refresh_token='))
  const newToken = refreshCookie ? decodeURIComponent(refreshCookie.split(';')[0].split('=')[1]) : null
  return { status: res.status, setCookies, newToken }
}

describe('POST /auth/refresh rotation grace', () => {
  let sessionId
  let firstToken

  before(async () => {
    const user = await query(`SELECT id FROM users WHERE email = 'ivanov@example.com'`)
    const created = await createSession({ userId: user.rows[0].id, loginMethod: 'password', refreshLifetimeDays: 1 })
    sessionId = created.sessionId
    firstToken = created.rawToken
  })

  after(async () => {
    if (sessionId) await query('DELETE FROM user_sessions WHERE id = $1', [sessionId])
  })

  it('rotates, then accepts the just-rotated token without clearing cookies, then rejects it after grace', async () => {
    const first = await refresh(firstToken)
    assert.strictEqual(first.status, 200)
    assert.ok(first.newToken)
    assert.notStrictEqual(first.newToken, firstToken)

    const stale = await refresh(firstToken)
    assert.strictEqual(stale.status, 200)
    assert.strictEqual(stale.setCookies.length, 0)

    const second = await refresh(first.newToken)
    assert.strictEqual(second.status, 200)
    assert.ok(second.newToken)

    await query(`UPDATE user_sessions SET rotated_at = NOW() - interval '5 minutes' WHERE id = $1`, [sessionId])
    const expired = await refresh(first.newToken)
    assert.strictEqual(expired.status, 401)
    assert.ok(expired.setCookies.some(c => c.startsWith('auth_refresh_token=;')))
  })

  it('rejects a token two rotations old', async () => {
    const res = await refresh(firstToken)
    assert.strictEqual(res.status, 401)
  })

  it('rejects an unknown token', async () => {
    const res = await refresh('deadbeef')
    assert.strictEqual(res.status, 401)
  })
})
