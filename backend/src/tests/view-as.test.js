import { describe, it } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const CSRF = 'view-as-csrf'

function headers(token, extraCookie = '') {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Organization-Id': '1',
    'X-CSRF-Token': CSRF,
    Cookie: `csrf_token=${CSRF}${extraCookie ? `; ${extraCookie}` : ''}`,
  }
}

async function call(method, path, token, body, cookie = '') {
  const res = await fetch(`${BASE}${path}`, { method, headers: headers(token, cookie), body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => null)
  const impCookie = res.headers.getSetCookie().find((c) => c.startsWith('imp_user=') && !c.startsWith('imp_user=;'))
  return { status: res.status, data, impCookie: impCookie ? impCookie.split(';')[0] : null }
}

const userId = async (email) => (await query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id

describe('Просмотр кабинета от лица пользователя (view-as)', () => {
  it('суперадмин видит кабинет реального сотрудника, изменения запрещены, выход работает, всё в аудите', async () => {
    const su = await login('superadmin@example.com')
    const suId = await userId('superadmin@example.com')
    const ivanovId = await userId('ivanov@example.com')
    const auditBefore = (await query("SELECT COALESCE(MAX(id), 0)::int AS m FROM audit_log")).rows[0].m

    const found = await call('GET', '/auth/view-as/search?q=Иванов', su)
    assert.strictEqual(found.status, 200)
    assert.ok(found.data.some((u) => u.id === ivanovId))
    assert.ok(found.data.every((u) => u.id !== suId))

    const start = await call('POST', '/auth/view-as', su, { userId: ivanovId })
    assert.strictEqual(start.status, 200, JSON.stringify(start.data))
    assert.strictEqual(start.data.viewOnly, true)
    assert.ok(start.impCookie)

    const me = await call('GET', '/auth/me', su, null, start.impCookie)
    assert.strictEqual(me.data.id, ivanovId)
    assert.strictEqual(me.data.isImpersonated, true)
    assert.strictEqual(me.data.viewOnly, true)
    assert.match(me.data.realUserName, /Админ/)

    const read = await call('GET', `/vacation/balance/${ivanovId}?year=2026`, su, null, start.impCookie)
    assert.strictEqual(read.status, 200)

    const write = await call('POST', '/vacation/requests', su, { startDate: '2026-12-01', endDate: '2026-12-03', vacationType: 'annual_paid' }, start.impCookie)
    assert.strictEqual(write.status, 403)
    assert.strictEqual(write.data.code, 'VIEW_ONLY')
    const del = await call('DELETE', '/vacation/restrictions/1', su, null, start.impCookie)
    assert.strictEqual(del.status, 403)

    const stop = await call('POST', '/auth/impersonate/stop', su, null, start.impCookie)
    assert.strictEqual(stop.status, 200)
    const meAfter = await call('GET', '/auth/me', su)
    assert.strictEqual(meAfter.data.role, 'superadmin')
    assert.strictEqual(meAfter.data.viewOnly, false)

    const audit = (await query(
      `SELECT action, entity_id, details FROM audit_log WHERE id > $1 AND action LIKE 'impersonation_%' ORDER BY id`, [auditBefore]
    )).rows
    assert.deepStrictEqual(audit.map((a) => a.action), ['impersonation_start', 'impersonation_stop'])
    assert.ok(audit.every((a) => a.entity_id === String(ivanovId)))
    assert.strictEqual(audit[0].details.mode, 'view')
  })

  it('нельзя войти за себя и за неактивного; обычный админ не может', async () => {
    const su = await login('superadmin@example.com')
    const suId = await userId('superadmin@example.com')
    const self = await call('POST', '/auth/view-as', su, { userId: suId })
    assert.strictEqual(self.status, 400)

    const inactive = (await query("SELECT id FROM users WHERE status <> 'active' AND role <> 'superadmin' LIMIT 1")).rows[0]
    if (inactive) {
      const res = await call('POST', '/auth/view-as', su, { userId: inactive.id })
      assert.strictEqual(res.status, 400)
    }

    const admin = await login('admin@example.com')
    const denied = await call('POST', '/auth/view-as', admin, { userId: await userId('ivanov@example.com') })
    assert.ok([401, 403].includes(denied.status), String(denied.status))
    const deniedSearch = await call('GET', '/auth/view-as/search?q=Иванов', admin)
    assert.ok([401, 403].includes(deniedSearch.status), String(deniedSearch.status))
  })

  it('можно смотреть кабинет за другого суперадмина — только просмотр', async () => {
    const su = await login('superadmin@example.com')
    const email = 'tmp.viewas-super@wc.test'
    await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, hire_date, role, status, is_test)
       VALUES ($1, 'x', 'Второй', 'Суперадмин', 'Super Administrator', CURRENT_DATE, 'superadmin', 'active', false)
       ON CONFLICT (email) DO UPDATE SET status = 'active', is_test = false, role = 'superadmin'`,
      [email]
    )
    try {
      const targetId = await userId(email)
      const found = await call('GET', '/auth/view-as/search?q=Суперадмин', su)
      assert.strictEqual(found.status, 200)
      assert.ok(found.data.some((u) => u.id === targetId && u.role === 'superadmin'))

      const start = await call('POST', '/auth/view-as', su, { userId: targetId })
      assert.strictEqual(start.status, 200, JSON.stringify(start.data))
      assert.strictEqual(start.data.viewOnly, true)

      const me = await call('GET', '/auth/me', su, null, start.impCookie)
      assert.strictEqual(me.data.id, targetId)
      assert.strictEqual(me.data.role, 'superadmin')
      assert.strictEqual(me.data.viewOnly, true)

      const write = await call('POST', '/vacation/requests', su, { startDate: '2026-12-01', endDate: '2026-12-03', vacationType: 'annual_paid' }, start.impCookie)
      assert.strictEqual(write.status, 403)
      assert.strictEqual(write.data.code, 'VIEW_ONLY')

      const stop = await call('POST', '/auth/impersonate/stop', su, null, start.impCookie)
      assert.strictEqual(stop.status, 200)
    } finally {
      await query('DELETE FROM users WHERE email = $1', [email])
    }
  })

  it('за тестового пользователя — полный доступ (не режим просмотра)', async () => {
    const su = await login('superadmin@example.com')
    const testUser = (await query("SELECT id FROM users WHERE is_test = true AND status = 'active' LIMIT 1")).rows[0]
    if (!testUser) return
    const start = await call('POST', '/auth/view-as', su, { userId: testUser.id })
    assert.strictEqual(start.status, 200)
    assert.strictEqual(start.data.viewOnly, false)
    const me = await call('GET', '/auth/me', su, null, start.impCookie)
    assert.strictEqual(me.data.viewOnly, false)
    assert.strictEqual(me.data.isImpersonated, true)
    await call('POST', '/auth/impersonate/stop', su, null, start.impCookie)
  })
})
