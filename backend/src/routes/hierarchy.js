import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'
import { excludeTest } from '../utils/testScope.js'

const router = express.Router()

const DEFAULT_DATA = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }

const AUTO_NODE_GAP_X = 320
const AUTO_NODE_GAP_Y = 220

const AUTO_EDGE_STYLE = { stroke: '#6b7280', strokeWidth: 2 }

function buildAutoHierarchy(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const nodeOf = new Map()
  for (const r of rows) {
    nodeOf.set(r.id, `department-${r.id}-auto`)
  }

  const curatorNodes = new Map()
  for (const r of rows) {
    if (r.parent_user_id && r.parent_user_first_name) {
      curatorNodes.set(r.parent_user_id, {
        id: `employee-${r.parent_user_id}-auto`,
        type: 'employee',
        position: { x: 0, y: 0 },
        data: {
          id: r.parent_user_id,
          firstName: r.parent_user_first_name,
          lastName: r.parent_user_last_name || '',
          position: r.parent_user_position || '',
        },
      })
    }
  }

  const levelOf = new Map()
  for (const r of rows) {
    const visited = new Set()
    let cur = r
    let level = 0
    while (cur?.parent_id && !visited.has(cur.id)) {
      visited.add(cur.id)
      cur = byId.get(cur.parent_id)
      level += 1
    }
    if (r.parent_user_id) level = Math.max(level, 1)
    levelOf.set(r.id, level)
  }

  const counterByLevel = new Map()
  const nodes = []
  for (const cn of curatorNodes.values()) {
    const idx = counterByLevel.get(0) || 0
    counterByLevel.set(0, idx + 1)
    nodes.push({ ...cn, position: { x: idx * AUTO_NODE_GAP_X, y: 0 } })
  }
  for (const r of rows) {
    const level = levelOf.get(r.id) || 0
    const idx = counterByLevel.get(level) || 0
    counterByLevel.set(level, idx + 1)
    nodes.push({
      id: nodeOf.get(r.id),
      type: 'department',
      position: { x: idx * AUTO_NODE_GAP_X, y: level * AUTO_NODE_GAP_Y },
      data: {
        id: r.id,
        name: r.name,
        employeeCount: Number(r.employee_count) || 0,
        managerName: r.manager_name || null,
      },
    })
  }

  const edges = []
  for (const r of rows) {
    if (r.parent_id && nodeOf.has(r.parent_id)) {
      edges.push({
        id: `e-auto-${r.parent_id}-${r.id}`,
        source: nodeOf.get(r.parent_id),
        target: nodeOf.get(r.id),
        style: AUTO_EDGE_STYLE,
        markerEnd: { type: 'arrowclosed', color: '#6b7280' },
        data: { relation: 'parent' },
      })
    }
    const curator = curatorNodes.get(r.parent_user_id)
    if (curator) {
      edges.push({
        id: `e-auto-u${r.parent_user_id}-${r.id}`,
        source: curator.id,
        target: nodeOf.get(r.id),
        style: AUTO_EDGE_STYLE,
        markerEnd: { type: 'arrowclosed', color: '#6b7280' },
        data: { relation: 'parent' },
      })
    }
  }

  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }
}

async function buildDepartmentParentChanges(nodes, edges, req) {
  const deptNodes = (Array.isArray(nodes) ? nodes : []).filter(
    (n) => n?.type === 'department' && n?.data && n.data.id != null
  )
  const deptIdByNode = new Map()
  const nameByDept = new Map()
  for (const n of deptNodes) {
    const deptId = Number(n.data.id)
    deptIdByNode.set(n.id, deptId)
    nameByDept.set(deptId, n.data.name || `Отдел #${deptId}`)
  }

  const userIdByNode = new Map()
  const nameByUser = new Map()
  for (const n of (Array.isArray(nodes) ? nodes : [])) {
    if (n?.type === 'employee' && n?.data && n.data.id != null) {
      const userId = Number(n.data.id)
      userIdByNode.set(n.id, userId)
      nameByUser.set(userId, `${n.data.lastName || ''} ${n.data.firstName || ''}`.trim() || `Пользователь #${userId}`)
    }
  }

  const parentsByDept = new Map()
  const parentUserByDept = new Map()
  const parentUserByUser = new Map()
  const visByDept = new Map()
  const visByUser = new Map()
  for (const e of Array.isArray(edges) ? edges : []) {
    if (e?.data?.relation === 'plain') continue
    const sourceDept = deptIdByNode.get(e?.source)
    const targetDept = deptIdByNode.get(e?.target)
    const sourceUser = userIdByNode.get(e?.source)
    const targetUser = userIdByNode.get(e?.target)
    if (sourceDept != null && targetDept != null) {
      if (!parentsByDept.has(targetDept)) parentsByDept.set(targetDept, new Set())
      parentsByDept.get(targetDept).add(sourceDept)
    } else if (sourceUser != null && targetDept != null) {
      const existing = parentUserByDept.get(targetDept)
      if (existing != null && existing !== sourceUser) {
        const err = new Error(`У отдела может быть только один родитель: ${nameByDept.get(targetDept)}`)
        err.statusCode = 400
        throw err
      }
      parentUserByDept.set(targetDept, sourceUser)
    } else if (sourceUser != null && targetUser != null && sourceUser !== targetUser) {
      const existing = parentUserByUser.get(targetUser)
      if (existing != null && existing !== sourceUser) {
        const err = new Error(`У сотрудника может быть только один родитель: ${nameByUser.get(targetUser)}`)
        err.statusCode = 400
        throw err
      }
      parentUserByUser.set(targetUser, sourceUser)
    } else {
      continue
    }
    if (e?.data?.vacationVisibility) {
      if (targetDept != null) visByDept.set(targetDept, e.data.vacationVisibility)
      else if (targetUser != null) visByUser.set(targetUser, e.data.vacationVisibility)
    }
  }

  for (const [childDept, parents] of parentsByDept) {
    if (parents.size > 1 || parentUserByDept.has(childDept)) {
      const err = new Error(`У отдела может быть только один родитель: ${nameByDept.get(childDept)}`)
      err.statusCode = 400
      throw err
    }
  }

  for (const childUser of parentUserByUser.keys()) {
    const visited = new Set()
    let cur = childUser
    while (cur != null && !visited.has(cur)) {
      visited.add(cur)
      cur = parentUserByUser.get(cur) ?? null
    }
    if (cur != null) {
      const err = new Error('Цикл в иерархии сотрудников')
      err.statusCode = 400
      throw err
    }
  }

  for (const childDept of parentsByDept.keys()) {
    const visited = new Set()
    let cur = childDept
    while (cur != null && !visited.has(cur)) {
      visited.add(cur)
      const parents = parentsByDept.get(cur)
      cur = parents && parents.size > 0 ? [...parents][0] : null
    }
    if (cur != null) {
      const err = new Error('Цикл в иерархии отделов')
      err.statusCode = 400
      throw err
    }
  }

  const involved = new Set()
  for (const [childDept, parents] of parentsByDept) {
    involved.add(childDept)
    for (const p of parents) involved.add(p)
  }

  if (involved.size > 0) {
    const { text, values } = orgScopedQuery(
      'SELECT id, name FROM departments WHERE id = ANY($1)',
      [[...involved]],
      req
    )
    const found = await query(text, values)
    const foundIds = new Set(found.rows.map((r) => r.id))
    for (const deptId of involved) {
      if (!foundIds.has(deptId)) {
        const err = new Error(`Отдел не найден в организации: ${nameByDept.get(deptId)}`)
        err.statusCode = 400
        throw err
      }
    }
  }

  if (parentUserByDept.size > 0 || parentUserByUser.size > 0) {
    const involvedUsers = [...new Set([
      ...parentUserByDept.values(),
      ...parentUserByUser.keys(),
      ...parentUserByUser.values(),
    ])]
    const userCheck = await query('SELECT id FROM users WHERE id = ANY($1)', [involvedUsers])
    const foundUserIds = new Set(userCheck.rows.map((r) => r.id))
    for (const userId of involvedUsers) {
      if (!foundUserIds.has(userId)) {
        const err = new Error(`Пользователь не найден: ${nameByUser.get(userId)}`)
        err.statusCode = 400
        throw err
      }
    }
    if (req.org) {
      const memberCheck = await query(
        'SELECT user_id FROM user_organizations WHERE org_id = $1 AND user_id = ANY($2) AND is_active = true',
        [req.org.org_id, involvedUsers]
      )
      const memberIds = new Set(memberCheck.rows.map((r) => r.user_id))
      for (const userId of involvedUsers) {
        if (!memberIds.has(userId)) {
          const err = new Error(`Пользователь не состоит в организации: ${nameByUser.get(userId)}`)
          err.statusCode = 400
          throw err
        }
      }
    }
  }

  const deptChanges = []
  for (const n of deptNodes) {
    const deptId = Number(n.data.id)
    const parents = parentsByDept.get(deptId)
    const vis = visByDept.get(deptId)
    deptChanges.push({
      deptId,
      parentId: parents && parents.size > 0 ? [...parents][0] : null,
      parentUserId: parentUserByDept.get(deptId) ?? null,
      vacParentSeesChild: vis?.parentSeesChild !== false,
      vacChildSeesParent: vis?.childSeesParent !== false,
      vacParentApproves: vis?.parentApproves !== false,
    })
  }

  const userChanges = []
  const seenUserIds = new Set()
  for (const n of (Array.isArray(nodes) ? nodes : [])) {
    if (n?.type !== 'employee' || !n?.data || n.data.id == null) continue
    const userId = Number(n.data.id)
    if (seenUserIds.has(userId)) continue
    seenUserIds.add(userId)
    const vis = visByUser.get(userId)
    userChanges.push({
      userId,
      managerId: parentUserByUser.get(userId) ?? null,
      vacParentSeesChild: vis?.parentSeesChild !== false,
      vacChildSeesParent: vis?.childSeesParent !== false,
      vacParentApproves: vis?.parentApproves !== false,
    })
  }
  return { deptChanges, userChanges }
}

/**
 * @swagger
 * /hierarchy:
 *   get:
 *     tags: [Hierarchy]
 *     summary: Получить организационную структуру
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Organization-Id
 *         schema: { type: integer }
 *         description: 'Для ролей hr, admin, superadmin — читать структуру указанной организации (просмотр глобальной иерархии); для остальных ролей заголовок игнорируется'
 *     responses:
 *       200:
 *         description: Данные иерархии (ReactFlow)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     nodes: { type: array, items: { type: object } }
 *                     edges: { type: array, items: { type: object } }
 *                     viewport: { type: object }
 *                 updated_at: { type: string, format: date-time, nullable: true }
 *                 updated_by: { type: integer, nullable: true }
 *                 version:
 *                   type: integer
 *                   description: 'Текущая версия сохранённой схемы; 0 если строки нет (авто-дерево). Передаётся обратно в PUT как baseVersion.'
 *       400:
 *         description: Организация не выбрана (нет X-Organization-Id и активной организации)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const headerOrg = parseInt(req.headers['x-organization-id'])
    const canReadAnyOrg = ['hr', 'admin', 'superadmin'].includes(req.user.role)
    const targetOrgId = canReadAnyOrg && headerOrg ? headerOrg : (req.org?.org_id ?? null)
    if (!targetOrgId) {
      return res.status(400).json({ error: 'Не выбрана организация' })
    }
    const result = targetOrgId
      ? await query('SELECT data, updated_at, updated_by, version FROM hr_hierarchy WHERE organization_id = $1', [targetOrgId])
      : { rows: [] }
    if (result.rows.length === 0) {
      const deptResult = await query(
        `SELECT d.id, d.name, d.parent_id, d.parent_user_id,
                m.first_name || ' ' || m.last_name as manager_name,
                pu.first_name as parent_user_first_name,
                pu.last_name as parent_user_last_name,
                pu.position as parent_user_position,
                (SELECT COUNT(*) FROM users WHERE department_id = d.id ${excludeTest(req, 'users')}) as employee_count
         FROM departments d
         LEFT JOIN users m ON d.manager_id = m.id
         LEFT JOIN users pu ON d.parent_user_id = pu.id${targetOrgId ? ' WHERE d.organization_id = $1' : ''}
         ${excludeTest(req, 'd', targetOrgId ? 'AND' : 'WHERE')}
         ORDER BY d.name`,
        targetOrgId ? [targetOrgId] : []
      )
      const auto = buildAutoHierarchy(deptResult.rows)
      return res.json({ data: auto, updated_at: null, updated_by: null, version: 0 })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('GET /hierarchy error:', error)
    res.status(500).json({ error: 'Не удалось загрузить иерархию' })
  }
})

/**
 * @swagger
 * /hierarchy:
 *   put:
 *     tags: [Hierarchy]
 *     summary: Сохранить организационную структуру (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nodes, edges, baseVersion]
 *             properties:
 *               nodes: { type: array, items: { type: object } }
 *               edges: { type: array, items: { type: object } }
 *               viewport: { type: object }
 *               orgPositions:
 *                 type: object
 *                 description: 'Позиции карточек организаций на схеме (orgPositions[orgId] = {x, y})'
 *               baseVersion:
 *                 type: integer
 *                 description: 'Версия схемы, полученная из GET /hierarchy (0 для авто-дерева). Обязательно. Оптимистическая блокировка.'
 *     responses:
 *       200:
 *         description: 'Структура сохранена; в ответе updated_at и новая version (version = предыдущая + 1, свежая строка = 1); рёбра relation=parent применены к departments.parent_id / parent_user_id, relation=plain игнорируется'
 *       400:
 *         description: 'Ошибка валидации рёбер (второй родитель, цикл, чужая организация) либо не передана baseVersion — сейв отклонён целиком'
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: 'Конфликт версий (code=HIERARCHY_VERSION_CONFLICT) — схема изменена другим пользователем, нужно перезагрузить'
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/', authenticateToken, authorizeRoles('hr', 'admin', 'superadmin'), async (req, res) => {
  const { nodes, edges, viewport, orgPositions, baseVersion } = req.body
  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Поля nodes и edges обязательны' })
  }
  if (typeof baseVersion !== 'number' || !Number.isFinite(baseVersion)) {
    return res.status(400).json({ error: 'Не передана версия схемы' })
  }
  const orgId = currentOrgId(req)
  if (!orgId) {
    return res.status(400).json({ error: 'Не выбрана организация' })
  }

  let parentChanges
  try {
    parentChanges = await buildDepartmentParentChanges(nodes, edges, req)
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message })
    }
    console.error('PUT /hierarchy validation error:', error)
    return res.status(500).json({ error: 'Не удалось сохранить иерархию' })
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')

    const existing = await client.query(
      'SELECT version FROM hr_hierarchy WHERE organization_id = $1 FOR UPDATE',
      [orgId]
    )
    if (existing.rows.length > 0 && existing.rows[0].version !== baseVersion) {
      await client.query('ROLLBACK').catch(() => {})
      return res.status(409).json({
        error: 'Схема была изменена другим пользователем. Обновите страницу',
        code: 'HIERARCHY_VERSION_CONFLICT',
      })
    }

    const data = JSON.stringify({
      nodes,
      edges,
      viewport: viewport ?? DEFAULT_DATA.viewport,
      orgPositions: orgPositions && typeof orgPositions === 'object' && !Array.isArray(orgPositions) ? orgPositions : {},
    })
    const result = await client.query(
      `INSERT INTO hr_hierarchy (id, data, updated_at, updated_by, organization_id)
       VALUES ($4, $1, NOW(), $2, $3)
       ON CONFLICT (organization_id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by,
             version = hr_hierarchy.version + 1
       RETURNING updated_at, version`,
      [data, req.user.id, orgId, orgId]
    )

    for (const { deptId, parentId, parentUserId, vacParentSeesChild, vacChildSeesParent, vacParentApproves } of parentChanges.deptChanges) {
      const { text, values } = orgScopedQuery(
        'UPDATE departments SET parent_id = $1, parent_user_id = $2, vac_parent_sees_child = $3, vac_child_sees_parent = $4, vac_parent_approves = $5 WHERE id = $6',
        [parentId, parentUserId, vacParentSeesChild, vacChildSeesParent, vacParentApproves, deptId],
        req
      )
      await client.query(text, values)
    }

    for (const { userId, managerId, vacParentSeesChild, vacChildSeesParent, vacParentApproves } of parentChanges.userChanges) {
      await client.query(
        'UPDATE users SET manager_id = $1, vac_parent_sees_child = $2, vac_child_sees_parent = $3, vac_parent_approves = $4 WHERE id = $5',
        [managerId, vacParentSeesChild, vacChildSeesParent, vacParentApproves, userId]
      )
    }

    await client.query('COMMIT')
    res.json({ updated_at: result.rows[0].updated_at, version: result.rows[0].version })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('PUT /hierarchy error:', error)
    res.status(500).json({ error: 'Не удалось сохранить иерархию' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /hierarchy/global:
 *   get:
 *     tags: [Hierarchy]
 *     summary: Получить глобальную иерархию организаций (ReactFlow layout)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные глобальной иерархии
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     nodes: { type: array, items: { type: object } }
 *                     edges: { type: array, items: { type: object } }
 *                     viewport: { type: object }
 *                 updated_at: { type: string, format: date-time, nullable: true }
 */
router.get('/global', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT data, updated_at FROM global_hierarchy WHERE id = 1')
    if (result.rows.length === 0) {
      return res.json({ data: null, updated_at: null })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('GET /hierarchy/global error:', error)
    res.status(500).json({ error: 'Не удалось загрузить глобальную иерархию' })
  }
})

/**
 * @swagger
 * /hierarchy/global:
 *   put:
 *     tags: [Hierarchy]
 *     summary: 'Сохранить глобальную иерархию организаций (роли: superadmin)'
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nodes: { type: array, items: { type: object } }
 *               edges: { type: array, items: { type: object } }
 *               viewport: { type: object }
 *     responses:
 *       200:
 *         description: Сохранено
 *       400:
 *         description: Ошибка валидации
 */
router.put('/global', authenticateToken, authorizeRoles('superadmin'), async (req, res) => {
  const { nodes, edges, viewport } = req.body
  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Поля nodes и edges обязательны' })
  }
  try {
    const data = JSON.stringify({ nodes, edges, viewport: viewport ?? { x: 0, y: 0, zoom: 1 } })
    const result = await query(
      `INSERT INTO global_hierarchy (id, data, updated_at, updated_by)
       VALUES (1, $1, NOW(), $2)
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by
       RETURNING updated_at`,
      [data, req.user.id]
    )
    res.json({ updated_at: result.rows[0].updated_at })
  } catch (error) {
    console.error('PUT /hierarchy/global error:', error)
    res.status(500).json({ error: 'Не удалось сохранить глобальную иерархию' })
  }
})

/**
 * @swagger
 * /hierarchy/department/{id}:
 *   get:
 *     tags: [Hierarchy]
 *     summary: Получить иерархию отдела
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Данные иерархии отдела
 */
router.get('/department/:id', authenticateToken, async (req, res) => {
  const { id } = req.params
  try {
    const { text, values } = orgScopedQuery(
      'SELECT data, updated_at, updated_by FROM department_hierarchy WHERE department_id = $1',
      [id],
      req
    )
    const result = await query(text, values)
    if (result.rows.length === 0) {
      return res.json({ data: DEFAULT_DATA, updated_at: null, updated_by: null })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('GET /hierarchy/department/:id error:', error)
    res.status(500).json({ error: 'Не удалось загрузить иерархию отдела' })
  }
})

/**
 * @swagger
 * /hierarchy/department/{id}:
 *   put:
 *     tags: [Hierarchy]
 *     summary: Сохранить иерархию отдела (HR/admin)
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
 *             required: [nodes, edges]
 *             properties:
 *               nodes: { type: array, items: { type: object } }
 *               edges: { type: array, items: { type: object } }
 *               viewport: { type: object }
 *     responses:
 *       200:
 *         description: Иерархия сохранена
 *       400:
 *         description: Не выбрана организация или отсутствуют nodes/edges
 *       403:
 *         description: Отдел принадлежит другой организации
 *       404:
 *         description: Отдел не найден
 */
router.put('/department/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  const { id } = req.params
  const { nodes, edges, viewport } = req.body
  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Поля nodes и edges обязательны' })
  }
  try {
    const deptRow = await query('SELECT id, organization_id FROM departments WHERE id = $1', [id])
    if (deptRow.rows.length === 0) {
      return res.status(404).json({ error: 'Отдел не найден' })
    }
    const orgId = currentOrgId(req)
    if (!orgId) {
      return res.status(400).json({ error: 'Не выбрана организация' })
    }
    if (deptRow.rows[0].organization_id !== orgId) {
      return res.status(403).json({ error: 'Нет доступа к этому отделу' })
    }
    const data = JSON.stringify({ nodes, edges, viewport: viewport ?? DEFAULT_DATA.viewport })
    const result = await query(
      `INSERT INTO department_hierarchy (department_id, data, updated_at, updated_by, organization_id)
       VALUES ($1, $2, NOW(), $3, $4)
       ON CONFLICT (department_id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by
       RETURNING updated_at`,
      [id, data, req.user.id, currentOrgId(req)]
    )
    res.json({ updated_at: result.rows[0].updated_at })
  } catch (error) {
    console.error('PUT /hierarchy/department/:id error:', error)
    res.status(500).json({ error: 'Не удалось сохранить иерархию отдела' })
  }
})

export default router
