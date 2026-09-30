import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import {
  isUserInTarget,
  publishSurvey,
  getSurveyAnalytics,
} from '../services/surveyService.js'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'
import { excludeTest } from '../utils/testScope.js'
import { requirePermission } from '../lib/permissions.js'

const router = express.Router()

/**
 * @swagger
 * /surveys:
 *   get:
 *     tags: [Surveys]
 *     summary: Получить все опросы (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список опросов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Survey' }
 */
// GET /api/surveys — list all (HR/admin)
router.get('/', authenticateToken, requirePermission('surveys:manage'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100))
    const offset = (page - 1) * limit

    const countQuery = orgScopedQuery('SELECT COUNT(*) FROM surveys', [], req)
    const countRes = await query(countQuery.text, countQuery.values)
    const total = parseInt(countRes.rows[0].count)

    const listQuery = orgScopedQuery(
      `SELECT s.*,
        (SELECT COUNT(*) FROM survey_questions WHERE survey_id = s.id) as question_count,
        (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) as response_count,
        CASE
          WHEN s.target_type = 'all' THEN (SELECT COUNT(*) FROM users WHERE status = 'active' ${excludeTest(req, 'users')})
          WHEN s.target_type = 'employees' THEN jsonb_array_length(s.target_ids)
          WHEN s.target_type = 'department' THEN (
            SELECT COUNT(*) FROM users u
            WHERE u.status = 'active' ${excludeTest(req, 'u')}
            AND u.department_id::TEXT IN (SELECT jsonb_array_elements_text(s.target_ids))
          )
          ELSE 0
        END as total_targeted
       FROM surveys s ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
      req
    )
    const result = await query(listQuery.text, listQuery.values)
    res.json({ data: result.rows, total, page, limit })
  } catch (error) {
    res.locals.errorCause = error
    console.error('GET /surveys error:', error)
    res.status(500).json({ error: 'Ошибка загрузки опросов' })
  }
})

/**
 * @swagger
 * /surveys/my:
 *   get:
 *     tags: [Surveys]
 *     summary: Получить активные опросы для текущего пользователя
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список доступных опросов
 */
// GET /api/surveys/my — active surveys for current user (MUST be before /:id)
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const userRes = await query('SELECT department_id FROM users WHERE id = $1', [userId])
    const departmentId = userRes.rows[0]?.department_id

    const surveysQuery = orgScopedQuery("SELECT * FROM surveys WHERE status = 'active' ORDER BY created_at DESC", [], req)
    const surveysRes = await query(surveysQuery.text, surveysQuery.values)

    const surveyIds = surveysRes.rows.map(s => s.id)
    let respondedSet = new Set()
    if (surveyIds.length > 0) {
      const respondedQuery = orgScopedQuery('SELECT survey_id FROM survey_responses WHERE survey_id = ANY($1) AND user_id = $2', [surveyIds, userId], req)
      const respondedRes = await query(respondedQuery.text, respondedQuery.values)
      respondedSet = new Set(respondedRes.rows.map(r => r.survey_id))
    }

    const accessible = []
    for (const s of surveysRes.rows) {
      if (await isUserInTarget(s, userId, departmentId)) {
        accessible.push({ ...s, responded: respondedSet.has(s.id) })
      }
    }
    res.json(accessible)
  } catch (error) {
    res.locals.errorCause = error
    console.error('GET /surveys/my error:', error)
    res.status(500).json({ error: 'Ошибка загрузки опросов' })
  }
})

/**
 * @swagger
 * /surveys/{id}:
 *   get:
 *     tags: [Surveys]
 *     summary: Получить опрос с вопросами (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Опрос с вопросами
 */
// GET /api/surveys/:id — get survey with questions (HR/admin)
router.get('/:id', authenticateToken, requirePermission('surveys:manage'), async (req, res) => {
  try {
    const surveyQuery = orgScopedQuery('SELECT * FROM surveys WHERE id = $1', [req.params.id], req)
    const survey = await query(surveyQuery.text, surveyQuery.values)
    if (!survey.rows.length) return res.status(404).json({ error: 'Опрос не найден' })
    const questionsQuery = orgScopedQuery('SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY order_index', [req.params.id], req)
    const questions = await query(questionsQuery.text, questionsQuery.values)
    res.json({ ...survey.rows[0], questions: questions.rows })
  } catch (error) {
    res.locals.errorCause = error
    console.error('GET /surveys/:id error:', error)
    res.status(500).json({ error: 'Ошибка загрузки опроса' })
  }
})

/**
 * @swagger
 * /surveys:
 *   post:
 *     tags: [Surveys]
 *     summary: Создать опрос (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               targetType: { type: string, enum: [all, department, role, specific] }
 *               targetIds: { type: array, items: { type: integer } }
 *               deadline: { type: string, format: date }
 *               anonymous: { type: boolean }
 *               questions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string, enum: [text, single_choice, multiple_choice, scale, rating] }
 *                     text: { type: string }
 *                     options: { type: array, items: { type: string } }
 *                     scaleMin: { type: integer }
 *                     scaleMax: { type: integer }
 *                     required: { type: boolean }
 *     responses:
 *       201:
 *         description: Опрос создан
 */
// POST /api/surveys — create draft (HR/admin)
router.post('/', authenticateToken, requirePermission('surveys:manage'), async (req, res) => {
  const client = await getClient()
  try {
    const { title, description, targetType, targetIds, deadline, anonymous, questions } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'Название обязательно' })

    await client.query('BEGIN')

    const surveyRes = await client.query(
      `INSERT INTO surveys (title, description, created_by, target_type, target_ids, deadline, anonymous, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, description || null, req.user.id, targetType || 'all', JSON.stringify(targetIds || []),
       deadline || null, anonymous || false, currentOrgId(req)]
    )
    const survey = surveyRes.rows[0]

    if (questions?.length) {
      const values = []
      const params = []
      const orgParamIdx = questions.length * 8 + 1
      questions.forEach((q, i) => {
        const base = i * 8
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${orgParamIdx})`)
        params.push(survey.id, i, q.type, q.text, JSON.stringify(q.options || []),
                    q.scaleMin || 1, q.scaleMax || 5, q.required || false)
      })
      params.push(currentOrgId(req))
      await client.query(
        `INSERT INTO survey_questions (survey_id, order_index, type, text, options, scale_min, scale_max, required, organization_id)
         VALUES ${values.join(', ')}`,
        params
      )
    }

    await client.query('COMMIT')
    res.status(201).json(survey)
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    console.error('POST /surveys error:', error)
    res.status(500).json({ error: 'Ошибка создания опроса' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /surveys/{id}:
 *   put:
 *     tags: [Surveys]
 *     summary: Обновить черновик опроса (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               targetType: { type: string }
 *               targetIds: { type: array, items: { type: integer } }
 *               deadline: { type: string, format: date }
 *               anonymous: { type: boolean }
 *               questions: { type: array, items: { type: object } }
 *     responses:
 *       200:
 *         description: Опрос обновлён
 */
// PUT /api/surveys/:id — update draft (HR/admin)
router.put('/:id', authenticateToken, requirePermission('surveys:manage'), async (req, res) => {
  const client = await getClient()
  try {
    const { title, description, targetType, targetIds, deadline, anonymous, questions } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'Название обязательно' })

    await client.query('BEGIN')

    const updSql = `UPDATE surveys SET title=$1, description=$2, target_type=$3, target_ids=$4,
         deadline=$5, anonymous=$6 WHERE id=$7 AND status='draft' RETURNING *`
    const updValues = [title, description || null, targetType || 'all', JSON.stringify(targetIds || []),
       deadline || null, anonymous || false, req.params.id]
    const updQuery = orgScopedQuery(updSql, updValues, req)
    const surveyRes = await client.query(updQuery.text, updQuery.values)
    if (!surveyRes.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Черновик не найден' })
    }

    const delQQuery = orgScopedQuery('DELETE FROM survey_questions WHERE survey_id = $1', [req.params.id], req)
    await client.query(delQQuery.text, delQQuery.values)
    if (questions?.length) {
      const values = []
      const params = []
      const orgParamIdx = questions.length * 8 + 1
      questions.forEach((q, i) => {
        const base = i * 8
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${orgParamIdx})`)
        params.push(req.params.id, i, q.type, q.text, JSON.stringify(q.options || []),
                    q.scaleMin || 1, q.scaleMax || 5, q.required || false)
      })
      params.push(currentOrgId(req))
      await client.query(
        `INSERT INTO survey_questions (survey_id, order_index, type, text, options, scale_min, scale_max, required, organization_id)
         VALUES ${values.join(', ')}`,
        params
      )
    }

    await client.query('COMMIT')
    res.json(surveyRes.rows[0])
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    console.error('PUT /surveys/:id error:', error)
    res.status(500).json({ error: 'Ошибка обновления опроса' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /surveys/{id}:
 *   delete:
 *     tags: [Surveys]
 *     summary: Удалить опрос (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Опрос удалён
 */
// DELETE /api/surveys/:id (HR/admin)
router.delete('/:id', authenticateToken, requirePermission('surveys:manage'), async (req, res) => {
  try {
    const delQuery = orgScopedQuery('DELETE FROM surveys WHERE id = $1', [req.params.id], req)
    await query(delQuery.text, delQuery.values)
    res.json({ success: true })
  } catch (error) {
    res.locals.errorCause = error
    console.error('DELETE /surveys/:id error:', error)
    res.status(500).json({ error: 'Ошибка удаления' })
  }
})

/**
 * @swagger
 * /surveys/{id}/publish:
 *   post:
 *     tags: [Surveys]
 *     summary: Опубликовать опрос (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Опрос опубликован
 */
// POST /api/surveys/:id/publish (HR/admin)
router.post('/:id/publish', authenticateToken, requirePermission('surveys:manage'), async (req, res) => {
  try {
    const survey = await publishSurvey(req.params.id, req.user.id)
    res.json(survey)
  } catch (error) {
    res.locals.errorCause = error
    console.error('POST /surveys/:id/publish error:', error)
    res.status(500).json({ error: 'Ошибка публикации' })
  }
})

/**
 * @swagger
 * /surveys/{id}/close:
 *   post:
 *     tags: [Surveys]
 *     summary: Закрыть опрос (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Опрос закрыт
 */
// POST /api/surveys/:id/close (HR/admin)
router.post('/:id/close', authenticateToken, requirePermission('surveys:manage'), async (req, res) => {
  try {
    const closeQuery = orgScopedQuery("UPDATE surveys SET status = 'closed' WHERE id = $1 RETURNING *", [req.params.id], req)
    const result = await query(closeQuery.text, closeQuery.values)
    if (!result.rows.length) return res.status(404).json({ error: 'Опрос не найден' })
    res.json(result.rows[0])
  } catch (error) {
    res.locals.errorCause = error
    console.error('POST /surveys/:id/close error:', error)
    res.status(500).json({ error: 'Ошибка закрытия опроса' })
  }
})

/**
 * @swagger
 * /surveys/{id}/view:
 *   get:
 *     tags: [Surveys]
 *     summary: Просмотр опроса для прохождения
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Опрос с вопросами
 *       409:
 *         description: Опрос уже пройден
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/surveys/:id/view — for response page, checks access (any authenticated)
router.get('/:id/view', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const surveyQuery = orgScopedQuery(
      'SELECT s.*, (SELECT COUNT(*) FROM survey_questions WHERE survey_id=s.id) as question_count FROM surveys s WHERE s.id=$1',
      [req.params.id],
      req
    )
    const surveyRes = await query(surveyQuery.text, surveyQuery.values)
    if (!surveyRes.rows.length) return res.status(404).json({ error: 'Опрос не найден' })
    const survey = surveyRes.rows[0]

    if (survey.status !== 'active') return res.status(403).json({ error: 'Опрос недоступен' })

    const userRes = await query('SELECT department_id FROM users WHERE id = $1', [userId])
    const departmentId = userRes.rows[0]?.department_id

    if (!(await isUserInTarget(survey, userId, departmentId))) {
      return res.status(403).json({ error: 'У вас нет доступа к данному опросу' })
    }

    const arQuery = orgScopedQuery('SELECT 1 FROM survey_responses WHERE survey_id=$1 AND user_id=$2', [req.params.id, userId], req)
    const alreadyResponded = await query(arQuery.text, arQuery.values)
    if (alreadyResponded.rows.length) {
      return res.status(409).json({ error: 'Вы уже прошли этот опрос' })
    }

    const questionsQuery = orgScopedQuery('SELECT * FROM survey_questions WHERE survey_id=$1 ORDER BY order_index', [req.params.id], req)
    const questions = await query(questionsQuery.text, questionsQuery.values)
    res.json({ ...survey, questions: questions.rows })
  } catch (error) {
    res.locals.errorCause = error
    console.error('GET /surveys/:id/view error:', error)
    res.status(500).json({ error: 'Ошибка загрузки опроса' })
  }
})

/**
 * @swagger
 * /surveys/{id}/respond:
 *   post:
 *     tags: [Surveys]
 *     summary: Ответить на опрос
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     questionId: { type: integer }
 *                     value: { type: string }
 *                     values: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Ответ принят
 */
// POST /api/surveys/:id/respond (any authenticated)
router.post('/:id/respond', authenticateToken, async (req, res) => {
  const client = await getClient()
  try {
    const userId = req.user.id
    const { answers } = req.body

    const surveyQuery = orgScopedQuery('SELECT * FROM surveys WHERE id=$1', [req.params.id], req)
    const surveyRes = await query(surveyQuery.text, surveyQuery.values)
    if (!surveyRes.rows.length) return res.status(404).json({ error: 'Опрос не найден' })
    const survey = surveyRes.rows[0]

    if (survey.status !== 'active') return res.status(403).json({ error: 'Опрос недоступен' })

    const userRes = await query('SELECT department_id FROM users WHERE id=$1', [userId])
    if (!(await isUserInTarget(survey, userId, userRes.rows[0]?.department_id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }

    const storedUserId = survey.anonymous ? null : userId

    await client.query('BEGIN')
    const responseRes = await client.query(
      'INSERT INTO survey_responses (survey_id, user_id, organization_id) VALUES ($1, $2, $3) RETURNING id',
      [req.params.id, storedUserId, currentOrgId(req)]
    )
    const responseId = responseRes.rows[0].id

    if (answers?.length) {
      const values = []
      const params = []
      const ansOrgParamIdx = answers.length * 4 + 1
      answers.forEach((a, i) => {
        const base = i * 4
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${ansOrgParamIdx})`)
        params.push(responseId, a.questionId, a.value ?? null, a.values ? JSON.stringify(a.values) : null)
      })
      params.push(currentOrgId(req))
      await client.query(
        `INSERT INTO survey_answers (response_id, question_id, value, values, organization_id) VALUES ${values.join(', ')}`,
        params
      )
    }
    await client.query('COMMIT')
    res.status(201).json({ success: true })
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    if (error.code === '23505') return res.status(409).json({ error: 'Вы уже прошли этот опрос' })
    console.error('POST /surveys/:id/respond error:', error)
    res.status(500).json({ error: 'Ошибка отправки ответа' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /surveys/{id}/analytics:
 *   get:
 *     tags: [Surveys]
 *     summary: Получить аналитику опроса (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Аналитика опроса
 */
// GET /api/surveys/:id/analytics (HR/admin)
router.get('/:id/analytics', authenticateToken, requirePermission('surveys:manage'), async (req, res) => {
  try {
    const analytics = await getSurveyAnalytics(req.params.id)
    res.json(analytics)
  } catch (error) {
    res.locals.errorCause = error
    console.error('GET /surveys/:id/analytics error:', error)
    res.status(500).json({ error: 'Ошибка аналитики' })
  }
})

export default router
