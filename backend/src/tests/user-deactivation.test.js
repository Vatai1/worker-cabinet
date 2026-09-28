import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const SUFFIX = `@deactivation-${Date.now()}.test`

async function mkUser(tag) {
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
     VALUES ($1, $2, 'Иван', 'Деактивируемый', 'Специалист', 'employee', '2020-01-01', 'active') RETURNING id`,
    [`${tag}${SUFFIX}`, hash]
  )).rows[0].id
  await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'employee', true)", [id])
  return { id, email: `${tag}${SUFFIX}` }
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' }
}

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => null) }
}

async function passwordLogin(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
    body: JSON.stringify({ email, password: 'password123' }),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const activeSessions = async (userId) =>
  (await query('SELECT count(*)::int c FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL', [userId])).rows[0].c

describe('Деактивация сотрудника', () => {
  after(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
  })

  it('массовая деактивация: старый токен отклоняется, вход запрещён, сессии отозваны, в списке — отключён', async () => {
    const u = await mkUser('bulk')
    const userToken = await login(u.email)
    const admin = await login('admin@example.com')

    const res = await call('PUT', '/users/bulk-status', admin, { userIds: [u.id], status: 'inactive' })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(await activeSessions(u.id), 0)

    const me = await call('GET', '/auth/me', userToken)
    assert.strictEqual(me.status, 401)
    assert.strictEqual(me.data.code, 'ACCOUNT_DISABLED')

    const relogin = await passwordLogin(u.email)
    assert.strictEqual(relogin.status, 403)
    assert.match(relogin.data.error, /деактивирована/)

    const disabled = await call('GET', '/users/search?q=Деактивируемый&orgIsActive=false&limit=100', admin)
    const rows = disabled.data.users ?? disabled.data.rows ?? disabled.data
    assert.ok(rows.some((r) => r.id === u.id))
    const enabled = await call('GET', '/users/search?q=Деактивируемый&orgIsActive=true&limit=100', admin)
    const enabledRows = enabled.data.users ?? enabled.data.rows ?? enabled.data
    assert.ok(!enabledRows.some((r) => r.id === u.id))
  })

  it('деактивация и активация по одному через админку', async () => {
    const u = await mkUser('single')
    const admin = await login('admin@example.com')
    assert.strictEqual((await call('PUT', `/admin/users/${u.id}/status`, admin, { status: 'inactive' })).status, 200)
    assert.strictEqual((await passwordLogin(u.email)).status, 403)
    assert.strictEqual((await call('PUT', `/admin/users/${u.id}/status`, admin, { status: 'active' })).status, 200)
    assert.strictEqual((await passwordLogin(u.email)).status, 200)
  })

  it('статус «в отпуске» не блокирует вход', async () => {
    const u = await mkUser('leave')
    const admin = await login('admin@example.com')
    assert.strictEqual((await call('PUT', '/users/bulk-status', admin, { userIds: [u.id], status: 'on_leave' })).status, 200)
    assert.strictEqual((await passwordLogin(u.email)).status, 200)
  })
})
