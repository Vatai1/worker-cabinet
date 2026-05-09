import { query } from '../config/database.js'

// Check if a user is in a survey's target audience
export async function isUserInTarget(survey, userId, departmentId) {
  if (survey.target_type === 'all') return true
  const ids = survey.target_ids || []
  if (survey.target_type === 'department') return ids.map(String).includes(String(departmentId))
  if (survey.target_type === 'employees') return ids.map(String).includes(String(userId))
  return false
}

// Get list of user IDs in target
async function resolveTargetUserIds(survey, excludeUserId = null) {
  let rows
  if (survey.target_type === 'all') {
    const r = await query("SELECT id FROM users WHERE status = 'active'")
    rows = r.rows
  } else if (survey.target_type === 'department') {
    const r = await query(
      "SELECT id FROM users WHERE department_id = ANY($1::int[]) AND status = 'active'",
      [survey.target_ids]
    )
    rows = r.rows
  } else {
    const r = await query('SELECT id FROM users WHERE id = ANY($1::int[])', [survey.target_ids])
    rows = r.rows
  }
  return rows.map((r) => r.id).filter((id) => id !== excludeUserId)
}

// Count users in target
export async function countTargetUsers(survey) {
  const ids = await resolveTargetUserIds(survey)
  return ids.length
}

// Publish survey: set status + send notifications
export async function publishSurvey(surveyId, publisherUserId) {
  const result = await query(
    "UPDATE surveys SET status = 'active' WHERE id = $1 AND status = 'draft' RETURNING *",
    [surveyId]
  )
  if (!result.rows.length) throw new Error('Опрос не найден или уже опубликован')
  const survey = result.rows[0]

  return survey
}

// Get analytics for a survey
export async function getSurveyAnalytics(surveyId) {
  const surveyRes = await query('SELECT * FROM surveys WHERE id = $1', [surveyId])
  if (!surveyRes.rows.length) throw new Error('Опрос не найден')
  const survey = surveyRes.rows[0]

  const totalTargeted = (await resolveTargetUserIds(survey)).length
  const respondedRes = await query(
    'SELECT COUNT(*) FROM survey_responses WHERE survey_id = $1',
    [surveyId]
  )
  const totalResponded = parseInt(respondedRes.rows[0].count, 10)

  const questionsRes = await query(
    'SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY order_index',
    [surveyId]
  )

  const questions = []
  for (const q of questionsRes.rows) {
    const base = { id: q.id, text: q.text, type: q.type }

    if (q.type === 'radio') {
      const answersRes = await query(
        `SELECT value, COUNT(*) as cnt FROM survey_answers
         WHERE question_id = $1 AND value IS NOT NULL GROUP BY value`,
        [q.id]
      )
      const countMap = Object.fromEntries(answersRes.rows.map((r) => [r.value, parseInt(r.cnt, 10)]))
      const opts = (q.options || []).map((label) => ({
        label,
        count: countMap[label] || 0,
        percent: totalResponded > 0 ? Math.round(((countMap[label] || 0) / totalResponded) * 100 * 10) / 10 : 0,
      }))
      questions.push({ ...base, options: opts })
    } else if (q.type === 'checkbox') {
      const answersRes = await query(
        'SELECT values FROM survey_answers WHERE question_id = $1 AND values IS NOT NULL',
        [q.id]
      )
      const countMap = {}
      for (const row of answersRes.rows) {
        for (const v of row.values || []) {
          countMap[v] = (countMap[v] || 0) + 1
        }
      }
      const opts = (q.options || []).map((label) => ({
        label,
        count: countMap[label] || 0,
        percent: totalResponded > 0 ? Math.round(((countMap[label] || 0) / totalResponded) * 100 * 10) / 10 : 0,
      }))
      questions.push({ ...base, options: opts })
    } else if (q.type === 'scale') {
      const answersRes = await query(
        'SELECT value FROM survey_answers WHERE question_id = $1 AND value IS NOT NULL',
        [q.id]
      )
      const values = answersRes.rows.map((r) => parseInt(r.value, 10))
      const average = values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null
      const distribution = {}
      for (let i = q.scale_min; i <= q.scale_max; i++) distribution[i] = 0
      for (const v of values) distribution[v] = (distribution[v] || 0) + 1
      questions.push({ ...base, average, distribution })
    } else if (q.type === 'text') {
      const answersRes = await query(
        "SELECT value FROM survey_answers WHERE question_id = $1 AND value IS NOT NULL AND value != ''",
        [q.id]
      )
      questions.push({ ...base, answers: answersRes.rows.map((r) => r.value) })
    }
  }

  return { total_targeted: totalTargeted, total_responded: totalResponded, questions }
}
