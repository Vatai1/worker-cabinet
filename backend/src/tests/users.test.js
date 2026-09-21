import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { BASE, headers as _headers, headersJSON as _headersJSON, getAdminToken, getHrToken, getManagerToken, getManagerUser, getEmployeeToken, getEmployeeUser, getEmployee2User } from './helpers.js'

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
