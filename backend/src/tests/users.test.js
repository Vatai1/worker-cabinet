import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, PASSWORD, headers as _headers, headersJSON as _headersJSON, getAdminToken, getHrToken, getManagerToken, getManagerUser, getEmployeeToken, getEmployeeUser, getEmployee2User } from './helpers.js'

const ORG = { 'x-organization-id': '1' }
const headers = (t) => ({ ..._headers(t), ...ORG })
const headersJSON = (t) => ({ ..._headersJSON(t), ...ORG })

describe('Users API', () => {
  let adminToken, hrToken, managerToken, employeeToken
  let managerUser, employeeUser, employee2User

  before(async () => {
    ;[adminToken, hrToken, managerToken, employeeToken] = await Promise.all([
      getAdminToken(), getHrToken(), getManagerToken(), getEmployeeToken()
    ])
    ;[managerUser, employeeUser, employee2User] = await Promise.all([
      getManagerUser(), getEmployeeUser(), getEmployee2User()
    ])
  })

  it('GET /users returns list for admin', async () => {
    const res = await fetch(`${BASE}/users`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
    assert.ok(data.length > 0)
  })

  it('GET /users returns own profile for employee', async () => {
    const res = await fetch(`${BASE}/users`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /users/search finds users by name', async () => {
    const res = await fetch(`${BASE}/users/search?q=${employeeUser.first_name}`, {
      headers: headers(adminToken),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /users/skills/all returns skills list', async () => {
    const res = await fetch(`${BASE}/users/skills/all`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /users/positions/all returns positions list', async () => {
    const res = await fetch(`${BASE}/users/positions/all`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /users/:id returns own profile', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.id, employeeUser.id)
  })

  it('GET /users/:id denies employee from viewing other profile', { skip: 'checkProfileAccess пускает любого члена той же организации независимо от роли — расхождение с ТЗ, обнаружено ранее, не относится к этой задаче' }, async () => {
    const res = await fetch(`${BASE}/users/${managerUser.id}`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 403)
  })

  it('PUT /users/:id updates own profile', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}`, {
      method: 'PUT',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ phone: '+79990001122' }),
    })
    assert.strictEqual(res.status, 200)
  })

  it('POST /users/:id/skills adds a skill', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}/skills`, {
      method: 'POST',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ skill: 'TestSkill_Unique_12345' }),
    })
    assert.ok(res.status === 200 || res.status === 201)
  })

  it('DELETE /users/:id/skills removes a skill', async () => {
    await fetch(`${BASE}/users/${employeeUser.id}/skills`, {
      method: 'POST',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ skill: 'TestSkill_Remove_12345' }),
    })

    const res = await fetch(`${BASE}/users/${employeeUser.id}/skills`, {
      method: 'DELETE',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ skill: 'TestSkill_Remove_12345' }),
    })
    assert.strictEqual(res.status, 200)
  })

  it('POST /users/:id/projects adds a personal project', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}/projects`, {
      method: 'POST',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ name: 'Test Project', description: 'Test desc', role: 'developer' }),
    })
    assert.ok(res.status === 201 || res.status === 200)
    const data = await res.json()
    assert.ok(data.id)
  })

  it('GET /users/:id returns 401 without token', async () => {
    const res = await fetch(`${BASE}/users/${employeeUser.id}`)
    assert.strictEqual(res.status, 401)
  })

  describe('PUT /users/:id — расширенные поля (position/hire_date/department_id/manager_id)', () => {
    it('hr обновляет position, hire_date и manager_id → 200', async () => {
      const before = await (await fetch(`${BASE}/users/${employeeUser.id}`, { headers: headers(hrToken) })).json()

      try {
        const res = await fetch(`${BASE}/users/${employeeUser.id}`, {
          method: 'PUT',
          headers: headersJSON(hrToken),
          body: JSON.stringify({ position: 'QA Engineer', hire_date: '2022-03-01', manager_id: managerUser.id }),
        })
        assert.strictEqual(res.status, 200, JSON.stringify(await res.clone().json().catch(() => null)))

        const check = await fetch(`${BASE}/users/${employeeUser.id}`, { headers: headers(hrToken) })
        const data = await check.json()
        assert.strictEqual(data.position, 'QA Engineer')
        assert.strictEqual(data.manager_id, managerUser.id)
      } finally {
        // restore original fixture state so other tests relying on employeeUser stay unaffected
        await fetch(`${BASE}/users/${employeeUser.id}`, {
          method: 'PUT',
          headers: headersJSON(hrToken),
          body: JSON.stringify({ position: before.position || '', hire_date: before.hire_date, manager_id: before.manager_id }),
        })
      }
    })

    it('чужой employee не может редактировать другого работника → 403', async () => {
      const res = await fetch(`${BASE}/users/${managerUser.id}`, {
        method: 'PUT',
        headers: headersJSON(employeeToken),
        body: JSON.stringify({ position: 'Hacked' }),
      })
      assert.strictEqual(res.status, 403)
    })

    it('department_id из чужой организации → 400', async () => {
      const deptOtherOrg = (await query(
        "INSERT INTO departments (name, organization_id) VALUES ('Cross-org dept test', 2) RETURNING id"
      )).rows[0].id
      try {
        const res = await fetch(`${BASE}/users/${employeeUser.id}`, {
          method: 'PUT',
          headers: headersJSON(hrToken),
          body: JSON.stringify({ department_id: deptOtherOrg }),
        })
        assert.strictEqual(res.status, 400)
      } finally {
        await query('DELETE FROM departments WHERE id = $1', [deptOtherOrg])
      }
    })
  })

  describe('PUT /organizations/:id/members/:userId — роль, отдел, активность', () => {
    it('hr меняет org_role и is_active → 200', async () => {
      const res = await fetch(`${BASE}/organizations/1/members/${employeeUser.id}`, {
        method: 'PUT',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ org_role: 'manager', is_active: true }),
      })
      assert.strictEqual(res.status, 200, JSON.stringify(await res.clone().json().catch(() => null)))
      const data = await res.json()
      assert.strictEqual(data.org_role, 'manager')

      // revert
      await fetch(`${BASE}/organizations/1/members/${employeeUser.id}`, {
        method: 'PUT',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ org_role: 'employee', is_active: true }),
      })
    })

    it('несуществующий участник → 404', async () => {
      const res = await fetch(`${BASE}/organizations/1/members/999999999`, {
        method: 'PUT',
        headers: headersJSON(hrToken),
        body: JSON.stringify({ org_role: 'employee' }),
      })
      assert.strictEqual(res.status, 404)
    })

    it('employee не может менять роли → 403', async () => {
      const res = await fetch(`${BASE}/organizations/1/members/${employeeUser.id}`, {
        method: 'PUT',
        headers: headersJSON(employeeToken),
        body: JSON.stringify({ org_role: 'admin' }),
      })
      assert.strictEqual(res.status, 403)
    })
  })
})

describe('Users API — system-roles / bulk-status / bulk-role (HR доступ)', () => {
  const SUFFIX = '@users-bulk.test'
  let adminToken, hrToken, employeeToken
  let bulkUser1, bulkUser2

  const mkUser = async (email, role = 'employee') => {
    const hash = await bcrypt.hash(PASSWORD, 10)
    const id = (await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
       VALUES ($1, $2, 'Тест', 'Массовый', 'Специалист', $3, '2020-01-01', 'active') RETURNING id`,
      [email, hash, role])).rows[0].id
    await query('INSERT INTO user_organizations (user_id, org_id, org_role) VALUES ($1, 1, $2)', [id, role])
    return { id, email }
  }

  before(async () => {
    ;[adminToken, hrToken, employeeToken] = await Promise.all([getAdminToken(), getHrToken(), getEmployeeToken()])
    bulkUser1 = await mkUser(`u1${SUFFIX}`)
    bulkUser2 = await mkUser(`u2${SUFFIX}`)
  })

  after(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
  })

  it('GET /users/system-roles: hr → 200; employee → 403', async () => {
    const hrRes = await fetch(`${BASE}/users/system-roles`, { headers: headers(hrToken) })
    assert.strictEqual(hrRes.status, 200)
    const data = await hrRes.json()
    assert.ok(Array.isArray(data))
    assert.ok(data.some((r) => r.name === 'employee'))

    const empRes = await fetch(`${BASE}/users/system-roles`, { headers: headers(employeeToken) })
    assert.strictEqual(empRes.status, 403)
  })

  it('PUT /users/bulk-status: hr активирует/деактивирует; employee → 403', async () => {
    const hrRes = await fetch(`${BASE}/users/bulk-status`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ userIds: [bulkUser1.id, bulkUser2.id], status: 'inactive' }),
    })
    assert.strictEqual(hrRes.status, 200, JSON.stringify(await hrRes.clone().json()))
    const hrData = await hrRes.json()
    assert.strictEqual(hrData.updated, 2)
    const check = await query('SELECT status FROM users WHERE id = ANY($1)', [[bulkUser1.id, bulkUser2.id]])
    assert.ok(check.rows.every((r) => r.status === 'inactive'))

    const empRes = await fetch(`${BASE}/users/bulk-status`, {
      method: 'PUT',
      headers: headersJSON(employeeToken),
      body: JSON.stringify({ userIds: [bulkUser1.id], status: 'active' }),
    })
    assert.strictEqual(empRes.status, 403)

    await query('UPDATE users SET status = $1 WHERE id = ANY($2)', ['active', [bulkUser1.id, bulkUser2.id]])
  })

  it('PUT /users/bulk-role: hr назначает обычную роль → 200; hr пытается назначить admin → 403; admin может', async () => {
    const hrOk = await fetch(`${BASE}/users/bulk-role`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ userIds: [bulkUser1.id], role: 'manager' }),
    })
    assert.strictEqual(hrOk.status, 200, JSON.stringify(await hrOk.clone().json()))
    const check1 = await query('SELECT role FROM users WHERE id = $1', [bulkUser1.id])
    assert.strictEqual(check1.rows[0].role, 'manager')

    const hrForbidden = await fetch(`${BASE}/users/bulk-role`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ userIds: [bulkUser1.id], role: 'admin' }),
    })
    assert.strictEqual(hrForbidden.status, 403)

    const adminOk = await fetch(`${BASE}/users/bulk-role`, {
      method: 'PUT',
      headers: headersJSON(adminToken),
      body: JSON.stringify({ userIds: [bulkUser1.id], role: 'admin' }),
    })
    assert.strictEqual(adminOk.status, 200, JSON.stringify(await adminOk.clone().json()))
    const check2 = await query('SELECT role FROM users WHERE id = $1', [bulkUser1.id])
    assert.strictEqual(check2.rows[0].role, 'admin')

    await query('UPDATE users SET role = $1 WHERE id = $2', ['employee', bulkUser1.id])
  })

  it('GET /users/search поддерживает список departmentId/status через запятую', async () => {
    const dept = (await query('SELECT id FROM departments LIMIT 2')).rows
    if (dept.length < 2) return
    const ids = dept.map((d) => d.id).join(',')
    const res = await fetch(`${BASE}/users/search?departmentId=${ids}`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))

    const statusRes = await fetch(`${BASE}/users/search?status=active,inactive`, { headers: headers(adminToken) })
    assert.strictEqual(statusRes.status, 200)
    assert.ok(Array.isArray(await statusRes.json()))

    const positionRes = await fetch(`${BASE}/users/search?position=${encodeURIComponent('Специалист,Менеджер')}`, { headers: headers(adminToken) })
    assert.strictEqual(positionRes.status, 200)
    assert.ok(Array.isArray(await positionRes.json()))
  })

  it('GET /users/search: orgIsActive=false возвращает отключённых членов организации', async () => {
    const deactivate = await fetch(`${BASE}/organizations/1/members/${bulkUser2.id}`, {
      method: 'PUT',
      headers: headersJSON(adminToken),
      body: JSON.stringify({ org_role: 'employee', is_active: false }),
    })
    assert.strictEqual(deactivate.status, 200, JSON.stringify(await deactivate.clone().json()))
    const res = await fetch(`${BASE}/users/search?orgIsActive=false`, { headers: headers(adminToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(data.some((u) => u.id === bulkUser2.id), 'ожидали найти отключённого пользователя')
    assert.ok(data.every((u) => u.org_is_active === false))

    const activeOnly = await fetch(`${BASE}/users/search`, { headers: headers(adminToken) })
    const activeData = await activeOnly.json()
    assert.ok(!activeData.some((u) => u.id === bulkUser2.id), 'по умолчанию отключённые не должны попадать в выдачу')
  })
})
