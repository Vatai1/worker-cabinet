import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getEmployeeToken, getEmployeeUser } from './helpers.js'

describe('Projects API', () => {
  let adminToken, employeeToken, employeeUser
  let createdProjectId
  let createdFolderId
  let createdRoadmapItemId

  before(async () => {
    ;[adminToken, employeeToken] = await Promise.all([getAdminToken(), getEmployeeToken()])
    employeeUser = await getEmployeeUser()
  })

  describe('Project CRUD', () => {
    it('GET /projects returns list', async () => {
      const res = await fetch(`${BASE}/projects`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })

    it('POST /projects creates a project', async () => {
      const res = await fetch(`${BASE}/projects`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({
          name: 'Тестовый проект ' + Date.now(),
          description: 'Описание тестового проекта',
          status: 'active',
        }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      assert.ok(data.id)
      createdProjectId = data.id
    })

    it('GET /projects/:id returns project detail', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.strictEqual(data.id, createdProjectId)
      assert.ok(Array.isArray(data.members))
    })

    it('PUT /projects/:id updates project', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ description: 'Обновленное описание' }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('GET /projects returns 401 without token', async () => {
      const res = await fetch(`${BASE}/projects`)
      assert.strictEqual(res.status, 401)
    })
  })

  describe('Project Members', () => {
    it('POST /projects/:id/members adds member', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/members`, {
        method: 'POST',
        headers: headersJSON(adminToken),
      body: JSON.stringify({ userId: employeeUser.id, role: 'participant' }),
    })
    assert.ok(res.status === 200 || res.status === 201)
    })

    it('DELETE /projects/:id/members/:userId removes member', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/members/${employeeUser.id}`, {
        method: 'DELETE',
        headers: headers(adminToken),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Project Folders', () => {
    it('POST /projects/:id/folders creates folder', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/folders`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ name: 'Тестовая папка', path: '/' }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      createdFolderId = data.id
    })

    it('GET /projects/:id/folders returns folders', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/folders?path=/`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('PUT /projects/:id/folders/:folderId renames folder', async () => {
      if (!createdProjectId || !createdFolderId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/folders/${createdFolderId}`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ name: 'Переименованная папка' }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('DELETE /projects/:id/folders removes folder', async () => {
      if (!createdProjectId || !createdFolderId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/folders`, {
        method: 'DELETE',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ path: '/Переименованная папка' }),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Project Documents', () => {
    it('GET /projects/:id/documents returns list', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/documents`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data))
    })
  })

  describe('Project Roadmap', () => {
    it('GET /projects/:id/roadmap returns items', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/roadmap`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('POST /projects/:id/roadmap creates item', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/roadmap`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({
          title: 'Тестовый элемент',
          description: 'Описание',
          due_date: '2026-03-01',
        }),
      })
      assert.strictEqual(res.status, 201)
      const data = await res.json()
      createdRoadmapItemId = data.id
    })

    it('PUT /projects/:id/roadmap/:itemId updates item', async () => {
      if (!createdProjectId || !createdRoadmapItemId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/roadmap/${createdRoadmapItemId}`, {
        method: 'PUT',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ title: 'Обновленный элемент' }),
      })
      assert.strictEqual(res.status, 200)
    })

    it('DELETE /projects/:id/roadmap/:itemId removes item', async () => {
      if (!createdProjectId || !createdRoadmapItemId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/roadmap/${createdRoadmapItemId}`, {
        method: 'DELETE',
        headers: headers(adminToken),
      })
      assert.strictEqual(res.status, 200)
    })
  })

  describe('Project Roadmap V2 (Rows & Tasks)', () => {
    it('GET /projects/:id/roadmap/rows returns rows', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/roadmap/rows`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('POST /projects/:id/roadmap/rows creates row', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/roadmap/rows`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({ title: 'Тестовая строка' }),
      })
      assert.strictEqual(res.status, 201)
    })

    it('GET /projects/:id/roadmap/tasks returns tasks', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}/roadmap/tasks`, { headers: headers(adminToken) })
      assert.strictEqual(res.status, 200)
    })

    it('POST /projects/:id/roadmap/tasks creates task', async () => {
      if (!createdProjectId) return
      const rowsRes = await fetch(`${BASE}/projects/${createdProjectId}/roadmap/rows`, { headers: headers(adminToken) })
      const rows = await rowsRes.json()
      const rowId = rows[0]?.id || 1

      const res = await fetch(`${BASE}/projects/${createdProjectId}/roadmap/tasks`, {
        method: 'POST',
        headers: headersJSON(adminToken),
        body: JSON.stringify({
          row_id: rowId,
          title: 'Тестовая задача',
          status: 'pending',
          start_month: 1,
          end_month: 3,
        }),
      })
      assert.ok(res.status === 201 || res.status === 200)
    })
  })

  describe('Project Cleanup', () => {
    it('DELETE /projects/:id removes project', async () => {
      if (!createdProjectId) return
      const res = await fetch(`${BASE}/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: headers(adminToken),
      })
      assert.strictEqual(res.status, 200)
    })
  })
})
