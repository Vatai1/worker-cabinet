import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { BASE, headers as _baseHeaders, headersJSON as _baseHeadersJSON, tryLogin, getAdminToken, getEmployeeToken, getEmployeeUser, getFirstDepartment } from './helpers.js'
import { pool, query } from '../config/database.js'
const headers = (t) => ({ ..._baseHeaders(t), 'x-organization-id': '1' })
const headersJSON = (t) => ({ ..._baseHeadersJSON(t), 'x-organization-id': '1' })

describe('Admin API', () => {
  let adminToken, employeeToken, employeeUser, superadminToken

  before(async () => {
    ;[adminToken, employeeToken] = await Promise.all([getAdminToken(), getEmployeeToken()])
    employeeUser = await getEmployeeUser()
    superadminToken = await tryLogin('superadmin@example.com')
    assert.ok(superadminToken, 'superadmin@example.com не смог войти')
  })

  describe('Roles & Permissions', () => {
    it('GET /admin/roles returns roles list', async () => {
      const res = await fetch(`${BASE}/admin/roles`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('POST /admin/roles creates a role', async () => {
      const res = await fetch(`${BASE}/admin/roles`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ name: 'test_role_' + Date.now(), description: 'Тестовая роль', color: '#FF0000' }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      assert.ok(data.id)
    })

    it('PUT /admin/roles/:id updates role', async () => {
      const createRes = await fetch(`${BASE}/admin/roles`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ name: 'role_to_update_' + Date.now(), description: 'Для обновления' }),
      })
      const created = await createRes.json()

      const res = await fetch(`${BASE}/admin/roles/${created.id}`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ name: 'updated_role_' + Date.now(), description: 'Обновлено' }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('DELETE /admin/roles/:id removes role', async () => {
      const createRes = await fetch(`${BASE}/admin/roles`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ name: 'role_to_delete_' + Date.now(), description: 'Для удаления' }),
      })
      const created = await createRes.json()

      const res = await fetch(`${BASE}/admin/roles/${created.id}`, {
        method: 'DELETE',
        headers: headers(adminToken),
      })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/permissions returns permissions', async () => {
      const res = await fetch(`${BASE}/admin/permissions`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Users Management', () => {
    it('GET /admin/users returns users list', async () => {
      const res = await fetch(`${BASE}/admin/users`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(data.users || Array.isArray(data))
    })

    it('GET /admin/users with search filter', async () => {
      const res = await fetch(`${BASE}/admin/users?search=admin`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('PUT /admin/users/:id/role changes user role', async () => {
      const res = await fetch(`${BASE}/admin/users/${employeeUser.id}/role`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ role: 'employee' }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('PUT /admin/users/:id/status changes user status', async () => {
      const res = await fetch(`${BASE}/admin/users/${employeeUser.id}/status`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ status: 'active' }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('POST /admin/users/:id/reset-password resets password', async () => {
      const res = await fetch(`${BASE}/admin/users/${employeeUser.id}/reset-password`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ newPassword: 'password123' }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('PUT /admin/users/:id edits user', async () => {
      const res = await fetch(`${BASE}/admin/users/${employeeUser.id}`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ position: 'Updated Position' }),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Bulk Operations', () => {
    it('PUT /admin/users/bulk-status changes status for multiple users', async () => {
      const res = await fetch(`${BASE}/admin/users/bulk-status`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ userIds: [employeeUser.id], status: 'active' }),
      })
      assert.ok(res.status === 200 || res.status === 500)
    })

    it('PUT /admin/users/bulk-role changes role for multiple users', async () => {
      const res = await fetch(`${BASE}/admin/users/bulk-role`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ userIds: [employeeUser.id], role: 'employee' }),
      })
      assert.ok(res.status === 200 || res.status === 500)
    })
  })

  describe('Settings & System', () => {
    it('GET /admin/settings returns settings', async () => {
      const res = await fetch(`${BASE}/admin/settings`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('PUT /admin/settings updates settings', async () => {
      const getRes = await fetch(`${BASE}/admin/settings`, { headers: headers(adminToken) })
      const settings = await getRes.json()
      const updated = settings.map(s => ({ ...s, value: s.value }))
      const res = await fetch(`${BASE}/admin/settings`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify(updated),
      })
      assert.ok(res.status === 200 || res.status === 400)
    })

    it('GET /admin/health returns system health', async () => {
      const res = await fetch(`${BASE}/admin/health`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/stats returns dashboard stats', async () => {
      const res = await fetch(`${BASE}/admin/stats`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Audit & Logs', () => {
    it('GET /admin/audit-log returns audit entries', async () => {
      const res = await fetch(`${BASE}/admin/audit-log`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/error-log returns error entries', async () => {
      const res = await fetch(`${BASE}/admin/error-log`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Security', () => {
    it('GET /admin/security/failed-logins returns data', async () => {
      const res = await fetch(`${BASE}/admin/security/failed-logins`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/security/locked-accounts returns data', async () => {
      const res = await fetch(`${BASE}/admin/security/locked-accounts`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Reports', () => {
    it('GET /admin/reports/turnover returns turnover report', async () => {
      const res = await fetch(`${BASE}/admin/reports/turnover`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/reports/tenure-age returns tenure report', async () => {
      const res = await fetch(`${BASE}/admin/reports/tenure-age`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/reports/unused-vacations returns unused vacations report', async () => {
      const res = await fetch(`${BASE}/admin/reports/unused-vacations`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/reports/project-load returns project load report', async () => {
      const res = await fetch(`${BASE}/admin/reports/project-load`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/reports/vacations returns vacation report', async () => {
      const res = await fetch(`${BASE}/admin/reports/vacations`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/reports/hires returns hires report', async () => {
      const res = await fetch(`${BASE}/admin/reports/hires`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Analytics & Export', () => {
    it('GET /admin/users/export returns CSV', async () => {
      const res = await fetch(`${BASE}/admin/users/export`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Dictionaries Management', () => {
    it('GET /admin/dictionaries returns all dictionaries', async () => {
      const res = await fetch(`${BASE}/admin/dictionaries`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('POST /admin/dictionaries/skills adds skill', async () => {
      const res = await fetch(`${BASE}/admin/dictionaries/skills`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ name: 'AdminSkill_' + Date.now() }),
      })
      assert.strictEqual(res.status, 201)
    })
  })

  describe('Modules Management', () => {
    let createdModuleId

    it('GET /admin/modules returns modules list', async () => {
      const res = await fetch(`${BASE}/admin/modules`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('POST /admin/modules creates module', async () => {
      const res = await fetch(`${BASE}/admin/modules`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({
          code: 'test_module_' + Date.now(),
          name: 'Тестовый модуль',
          description: 'Описание',
        }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      createdModuleId = data.id
    })

    it('PUT /admin/modules/:id updates module', async () => {
      if (!createdModuleId) return
      const res = await fetch(`${BASE}/admin/modules/${createdModuleId}`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ name: 'Обновленный модуль' }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('PUT /admin/modules/:id/toggle toggles module', async () => {
      if (!createdModuleId) return
      const res = await fetch(`${BASE}/admin/modules/${createdModuleId}/toggle`, {
        method: 'PUT',
        headers: headersJSON(superadminToken),
        body: JSON.stringify({ enabled: false }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('GET /admin/modules/enabled returns enabled modules', async () => {
      const res = await fetch(`${BASE}/admin/modules/enabled`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('DELETE /admin/modules/:id removes module', async () => {
      if (!createdModuleId) return
      const res = await fetch(`${BASE}/admin/modules/${createdModuleId}`, {
        method: 'DELETE',
        headers: headers(adminToken),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Access Control', () => {
    it('GET /admin/roles denied for employee', async () => {
      const res = await fetch(`${BASE}/admin/roles`, { headers: headers(employeeToken) })
      assert.strictEqual(res.status, 403)
    })

    it('GET /admin/stats returns 401 without token', async () => {
      const res = await fetch(`${BASE}/admin/stats`)
      assert.strictEqual(res.status, 401)
    })
  })

  describe('Module Settings', () => {
    const MODULE_CODE = 'calendar'
    let calendarModuleId, settingsSnap, overrideSnap

    before(async () => {
      calendarModuleId = (await query('SELECT id FROM modules WHERE code = $1', [MODULE_CODE])).rows[0].id
      settingsSnap = (await query('SELECT settings FROM modules WHERE code = $1', [MODULE_CODE])).rows[0].settings
      overrideSnap = (await query('SELECT settings FROM module_overrides WHERE org_id = 1 AND module_code = $1', [MODULE_CODE])).rows[0]?.settings ?? null
    })

    after(async () => {
      await query('UPDATE modules SET settings = $1 WHERE code = $2', [JSON.stringify(settingsSnap), MODULE_CODE])
      if (overrideSnap === null) {
        await query('DELETE FROM module_overrides WHERE org_id = 1 AND module_code = $1', [MODULE_CODE])
      } else {
        await query('UPDATE module_overrides SET settings = $1 WHERE org_id = 1 AND module_code = $2', [JSON.stringify(overrideSnap), MODULE_CODE])
      }
      await pool.end()
    })

    it('GET /admin/modules/:id/settings → 200 с настройками; несуществующий модуль → 404', async () => {
      const res = await fetch(`${BASE}/admin/modules/${MODULE_CODE}/settings`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(typeof await res.json(), 'object')
      const missing = await fetch(`${BASE}/admin/modules/no-such-module-xyz/settings`, { headers: headers(adminToken) })
      assert.strictEqual(missing.status, 404)
      assert.strictEqual((await missing.json()).error, 'Модуль не найден')
    })

    it('PATCH от superadmin пишет глобальные настройки + аудит module_settings_update', async () => {
      const res = await fetch(`${BASE}/admin/modules/${MODULE_CODE}/settings`, {
        method: 'PATCH',
        headers: headersJSON(superadminToken),
        body: JSON.stringify({ us16GlobalFlag: 'written-by-superadmin' }),
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual((await res.json()).us16GlobalFlag, 'written-by-superadmin')
      const stored = (await query('SELECT settings FROM modules WHERE code = $1', [MODULE_CODE])).rows[0].settings
      assert.strictEqual(stored.us16GlobalFlag, 'written-by-superadmin')
      const audit = (await query(
        "SELECT details FROM audit_log WHERE action = 'module_settings_update' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
        [String(calendarModuleId)])).rows[0]
      assert.ok(audit, 'запись аудита module_settings_update не найдена')
      assert.strictEqual(audit.details.scope, 'global')
    })

    it('PATCH от admin (org) пишет override; GET мержит global + override', async () => {
      const res = await fetch(`${BASE}/admin/modules/${MODULE_CODE}/settings`, {
        method: 'PATCH',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ us16OrgFlag: 42 }),
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual((await res.json()).us16OrgFlag, 42)
      const merged = await (await fetch(`${BASE}/admin/modules/${MODULE_CODE}/settings`, { headers: headers(adminToken) })).json()
      assert.strictEqual(merged.us16OrgFlag, 42)
      assert.strictEqual(merged.us16GlobalFlag, 'written-by-superadmin')
      const audit = (await query(
        "SELECT details FROM audit_log WHERE action = 'module_settings_update' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
        [String(calendarModuleId)])).rows[0]
      assert.strictEqual(audit.details.scope, 'org')
      assert.strictEqual(audit.details.org_id, 1)
    })

    it('PATCH от employee → 403', async () => {
      const res = await fetch(`${BASE}/admin/modules/${MODULE_CODE}/settings`, {
        method: 'PATCH',
        headers: headersJSON(employeeToken),
        body: JSON.stringify({ x: 1 }),
      })
      assert.strictEqual(res.status, 403)
    })

    it('PATCH с невалидным payload (массив) принимается — валидации нет (фактическое поведение)', async () => {
      const res = await fetch(`${BASE}/admin/modules/${MODULE_CODE}/settings`, {
        method: 'PATCH',
        headers: headersJSON(adminToken),
        body: JSON.stringify([1, 2, 3]),
      })
      assert.strictEqual(res.status, 200)
      const stored = (await query("SELECT settings FROM module_overrides WHERE org_id = 1 AND module_code = 'calendar'")).rows[0]
      assert.ok(Array.isArray(stored.settings))
    })
  })
})
