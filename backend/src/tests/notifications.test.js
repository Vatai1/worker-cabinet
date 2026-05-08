import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getEmployeeToken, getEmployeeUser } from './helpers.js'

describe('Notifications API', () => {
  let adminToken, employeeToken, employeeUser

  before(async () => {
    ;[adminToken, employeeToken] = await Promise.all([getAdminToken(), getEmployeeToken()])
    employeeUser = await getEmployeeUser()
  })

  it('GET /notifications returns list for authenticated user', async () => {
    const res = await fetch(`${BASE}/notifications`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /notifications/unread-count returns number', async () => {
    const res = await fetch(`${BASE}/notifications/unread-count`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(typeof data.count === 'number')
  })

  it('PATCH /notifications/read-all marks all as read', async () => {
    const res = await fetch(`${BASE}/notifications/read-all`, {
      method: 'PATCH',
      headers: headers(employeeToken),
    })
    assert.strictEqual(res.status, 200)
  })

  it('POST /notifications creates a notification', async () => {
    const res = await fetch(`${BASE}/notifications`, {
      method: 'POST',
      headers: headersJSON(adminToken),
      body: JSON.stringify({
        userId: employeeUser.id,
        title: 'Тестовое уведомление',
        message: 'Тест',
        type: 'info',
      }),
    })
    assert.strictEqual(res.status, 201)
    const data = await res.json()
    assert.ok(data.id)
    return data.id
  })

  it('PATCH /notifications/:id/read marks as read', async () => {
    const createRes = await fetch(`${BASE}/notifications`, {
      method: 'POST',
      headers: headersJSON(adminToken),
      body: JSON.stringify({
        userId: employeeUser.id,
        title: 'Для прочтения',
        message: 'Тест',
        type: 'info',
      }),
    })
    const created = await createRes.json()

    const res = await fetch(`${BASE}/notifications/${created.id}/read`, {
      method: 'PATCH',
      headers: headers(employeeToken),
    })
    assert.strictEqual(res.status, 200)
  })

  it('DELETE /notifications/:id deletes notification', async () => {
    const createRes = await fetch(`${BASE}/notifications`, {
      method: 'POST',
      headers: headersJSON(adminToken),
      body: JSON.stringify({
        userId: employeeUser.id,
        title: 'Для удаления',
        message: 'Тест',
        type: 'info',
      }),
    })
    const created = await createRes.json()

    const res = await fetch(`${BASE}/notifications/${created.id}`, {
      method: 'DELETE',
      headers: headers(employeeToken),
    })
    assert.strictEqual(res.status, 200)
  })

  it('GET /notifications returns 401 without token', async () => {
    const res = await fetch(`${BASE}/notifications`)
    assert.strictEqual(res.status, 401)
  })
})
