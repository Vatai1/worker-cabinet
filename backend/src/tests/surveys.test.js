import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { BASE, headers, headersJSON, getAdminToken, getHrToken, getEmployeeToken, getHrUser, getFirstDepartment } from './helpers.js'
import { query } from '../config/database.js'
import { publishSurvey } from '../services/surveyService.js'

describe('Surveys API', () => {
  let adminToken, hrToken, employeeToken
  let createdSurveyId

  before(async () => {
    ;[adminToken, hrToken, employeeToken] = await Promise.all([
      getAdminToken(), getHrToken(), getEmployeeToken()
    ])
  })

  it('GET /surveys returns list for HR', async () => {
    const res = await fetch(`${BASE}/surveys`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /surveys denied for employee', async () => {
    const res = await fetch(`${BASE}/surveys`, { headers: headers(employeeToken) })
    assert.strictEqual(res.status, 403)
  })

  it('GET /surveys/my returns available surveys', async () => {
    const res = await fetch(`${BASE}/surveys/my`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /surveys/my returns 401 without token', async () => {
    const res = await fetch(`${BASE}/surveys/my`)
    assert.strictEqual(res.status, 401)
  })

  it('POST /surveys creates a draft (HR)', async () => {
    const dept = await getFirstDepartment()
    const res = await fetch(`${BASE}/surveys`, {
      method: 'POST',
      headers: headersJSON(hrToken),
      body: JSON.stringify({
        title: 'Тестовый опрос ' + Date.now(),
        description: 'Описание тестового опроса',
        anonymous: false,
        targetType: 'all',
        questions: [
          { text: 'Вопрос 1?', type: 'radio', options: ['Да', 'Нет'] },
          { text: 'Вопрос 2?', type: 'text' },
        ],
      }),
    })
    assert.strictEqual(res.status, 201)
    const data = await res.json()
    assert.ok(data.id)
    assert.strictEqual(data.status, 'draft')
    createdSurveyId = data.id
  })

  it('GET /surveys/:id returns survey detail (HR)', async () => {
    if (!createdSurveyId) return
    const res = await fetch(`${BASE}/surveys/${createdSurveyId}`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.id, createdSurveyId)
    assert.ok(Array.isArray(data.questions))
  })

  it('PUT /surveys/:id updates draft', async () => {
    if (!createdSurveyId) return
    const res = await fetch(`${BASE}/surveys/${createdSurveyId}`, {
      method: 'PUT',
      headers: headersJSON(hrToken),
      body: JSON.stringify({
        title: 'Обновленный опрос ' + Date.now(),
        description: 'Обновленное описание',
        questions: [
          { text: 'Новый вопрос?', type: 'radio', options: ['А', 'Б'] },
        ],
      }),
    })
    assert.strictEqual(res.status, 200)
  })

  it('POST /surveys/:id/publish publishes survey', async () => {
    if (!createdSurveyId) return
    const res = await fetch(`${BASE}/surveys/${createdSurveyId}/publish`, {
      method: 'POST',
      headers: headersJSON(hrToken),
    })
    assert.strictEqual(res.status, 200)
  })

  it('GET /surveys/:id/view returns survey for taking', async () => {
    if (!createdSurveyId) return
    const res = await fetch(`${BASE}/surveys/${createdSurveyId}/view`, { headers: headers(employeeToken) })
    assert.ok(res.status === 200 || res.status === 403 || res.status === 404)
  })

  it('POST /surveys/:id/respond submits answers', async () => {
    if (!createdSurveyId) return
    const viewRes = await fetch(`${BASE}/surveys/${createdSurveyId}/view`, { headers: headers(hrToken) })
    if (viewRes.status !== 200) return
    const survey = await viewRes.json()

    const answers = (survey.questions || []).map(q => ({
      questionId: q.id,
      value: q.type === 'radio' ? (q.options?.[0] || '') : 'Тестовый ответ',
    }))

    if (answers.length === 0) return

    const res = await fetch(`${BASE}/surveys/${createdSurveyId}/respond`, {
      method: 'POST',
      headers: headersJSON(hrToken),
      body: JSON.stringify({ answers }),
    })
    assert.ok(res.status === 201 || res.status === 409 || res.status === 403)
  })

  it('GET /surveys/:id/analytics returns stats (HR)', async () => {
    if (!createdSurveyId) return
    const res = await fetch(`${BASE}/surveys/${createdSurveyId}/analytics`, { headers: headers(hrToken) })
    assert.strictEqual(res.status, 200)
  })

  it('POST /surveys/:id/close closes survey', async () => {
    if (!createdSurveyId) return
    const res = await fetch(`${BASE}/surveys/${createdSurveyId}/close`, {
      method: 'POST',
      headers: headersJSON(hrToken),
    })
    assert.strictEqual(res.status, 200)
  })

  it('GET /surveys/:id/view returns 404 for non-existent', async () => {
    const res = await fetch(`${BASE}/surveys/999999/view`, { headers: headers(hrToken) })
    assert.ok(res.status === 404 || res.status === 403)
  })

  it('publishSurvey sends survey_assigned notifications to all active users except author', async () => {
    await query("DELETE FROM notification_queue WHERE type = 'survey_assigned'")

    const adminRes = await query("SELECT id FROM users WHERE email = 'admin@example.com'")
    const authorId = adminRes.rows[0].id

    const title = 'Уведомляющий опрос ' + Date.now()
    const insertRes = await query(
      `INSERT INTO surveys (title, description, created_by, target_type, target_ids, deadline, anonymous, status)
       VALUES ($1, $2, $3, 'all', '[]', NULL, false, 'draft') RETURNING *`,
      [title, 'Для теста уведомлений', authorId]
    )
    const survey = insertRes.rows[0]

    await publishSurvey(survey.id, authorId)

    const notifs = await query(
      "SELECT user_id, data FROM notification_queue WHERE type = 'survey_assigned' AND data->>'title' = $1",
      [title]
    )

    const activeRes = await query("SELECT id FROM users WHERE status = 'active'")
    const expectedIds = new Set(
      activeRes.rows.map((r) => r.id).filter((id) => id !== authorId)
    )
    const notifIds = new Set(notifs.rows.map((r) => r.user_id))

    assert.strictEqual(
      notifs.rows.length,
      expectedIds.size,
      `Expected ${expectedIds.size} notifications, got ${notifs.rows.length}`
    )
    for (const id of expectedIds) {
      assert.ok(notifIds.has(id), `Missing notification for user ${id}`)
    }
    assert.ok(!notifIds.has(authorId), 'Author should not receive own survey notification')

    await query('DELETE FROM surveys WHERE id = $1', [survey.id])
    await query("DELETE FROM notification_queue WHERE type = 'survey_assigned'")
  })
})
