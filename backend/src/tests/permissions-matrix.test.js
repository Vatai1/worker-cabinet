import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { BASE, headers, headersJSON, getAdminToken, getEmployeeToken, getHrToken } from './helpers.js'

const call = async (method, path, token, body) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: body ? headersJSON(token) : headers(token), body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => null) }
}

async function roleWithPermissions(name) {
  const roles = (await call('GET', '/admin/roles', await getAdminToken())).data
  return roles.find((r) => r.name === name)
}

async function setRolePermissions(name, codes) {
  const role = await roleWithPermissions(name)
  const perms = (await call('GET', '/admin/permissions', await getAdminToken())).data
  const ids = perms.filter((p) => codes.includes(p.code)).map((p) => p.id)
  const res = await call('PUT', `/admin/roles/${role.id}`, await getAdminToken(), { permissionIds: ids })
  assert.strictEqual(res.status, 200, JSON.stringify(res.data))
}

describe('Матрица доступов управляет правами', () => {
  let employeeCodes
  let hrCodes
  let moduleWasEnabled

  before(async () => {
    const perms = (await call('GET', '/admin/permissions', await getAdminToken())).data
    const codeOf = new Map(perms.map((p) => [p.id, p.code]))
    const idsOf = (role) => role.permissions.map((p) => (typeof p === 'object' ? p.code ?? codeOf.get(p.id) : codeOf.get(p)))
    employeeCodes = idsOf(await roleWithPermissions('employee'))
    hrCodes = idsOf(await roleWithPermissions('hr'))
    moduleWasEnabled = (await query("SELECT is_enabled FROM modules WHERE code = 'day_offs' AND organization_id IS NULL")).rows[0].is_enabled
  })

  after(async () => {
    await setRolePermissions('employee', employeeCodes)
    await setRolePermissions('hr', hrCodes)
    await query("UPDATE modules SET is_enabled = $1 WHERE code = 'day_offs' AND organization_id IS NULL", [moduleWasEnabled])
  })

  it('права по умолчанию совпадают с прежним поведением и приходят в /auth/me', async () => {
    const me = await call('GET', '/auth/me', await getEmployeeToken())
    assert.ok(me.data.permissions.includes('day_off:take'))
    assert.ok(me.data.permissions.includes('users:view'))
    assert.ok(!me.data.permissions.includes('hr:access'))
    assert.ok(!me.data.permissions.includes('timesheet:view'))
    const admin = await call('GET', '/auth/me', await getAdminToken())
    assert.ok(admin.data.permissions.includes('admin:roles'))
  })

  it('снятое у роли право закрывает маршрут, возвращённое — открывает', async () => {
    const hr = await getHrToken()
    assert.strictEqual((await call('GET', '/surveys', hr)).status, 200)
    await setRolePermissions('hr', hrCodes.filter((c) => c !== 'surveys:manage'))
    assert.strictEqual((await call('GET', '/surveys', hr)).status, 403)
    await setRolePermissions('hr', hrCodes)
    assert.strictEqual((await call('GET', '/surveys', hr)).status, 200)
  })

  it('выданное право открывает раздел роли, у которой его не было', async () => {
    const employee = await getEmployeeToken()
    assert.strictEqual((await call('GET', '/timesheet', employee)).status, 403)
    await setRolePermissions('employee', [...employeeCodes, 'timesheet:view'])
    assert.notStrictEqual((await call('GET', '/timesheet', employee)).status, 403)
    await setRolePermissions('employee', employeeCodes)
  })

  it('отгулы: без права — 403 при оформлении, при выключенном модуле — 403 при начислении', async () => {
    const employee = await getEmployeeToken()
    await setRolePermissions('employee', employeeCodes.filter((c) => c !== 'day_off:take'))
    const take = await call('POST', '/vacation/requests', employee, { startDate: '2031-03-03', endDate: '2031-03-03', vacationType: 'day_off' })
    assert.strictEqual(take.status, 403)
    assert.match(take.data.error, /нет права/)
    await setRolePermissions('employee', employeeCodes)

    await query("UPDATE modules SET is_enabled = false WHERE code = 'day_offs' AND organization_id IS NULL")
    const all = await call('GET', '/vacation/adjustments/all', await getHrToken())
    assert.strictEqual(all.status, 403)
    assert.match(all.data.error, /отключены/)
  })
})
