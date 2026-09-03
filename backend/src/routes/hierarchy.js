import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'

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
  const visByDept = new Map()
  for (const e of Array.isArray(edges) ? edges : []) {
    if (e?.data?.relation === 'plain') continue
    const sourceDept = deptIdByNode.get(e?.source)
    const targetDept = deptIdByNode.get(e?.target)
    const sourceUser = userIdByNode.get(e?.source)
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
    } else {
      continue
    }
    if (targetDept != null && e?.data?.vacationVisibility) {
      visByDept.set(targetDept, e.data.vacationVisibility)
    }
  }

  for (const [childDept, parents] of parentsByDept) {
    if (parents.size > 1 || parentUserByDept.has(childDept)) {
      const err = new Error(`У отдела может быть только один родитель: ${nameByDept.get(childDept)}`)
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

  if (parentUserByDept.size > 0) {
    const involvedUsers = [...new Set(parentUserByDept.values())]
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

  const changes = []
  for (const n of deptNodes) {
    const deptId = Number(n.data.id)
    const parents = parentsByDept.get(deptId)
    const vis = visByDept.get(deptId)
    changes.push({
      deptId,
      parentId: parents && parents.size > 0 ? [...parents][0] : null,
      parentUserId: parentUserByDept.get(deptId) ?? null,
      vacParentSeesChild: vis?.parentSeesChild !== false,
      vacChildSeesParent: vis?.childSeesParent !== false,
    })
  }
  return changes
}

/**
 * @swagger
 * /hierarchy:
 *   get:
 *     tags: [Hierarchy]
 *     summary: Получить организационную структуру
 *     security:
 *       - bearerAuth: []
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
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { text, values } = orgScopedQuery('SELECT data, updated_at, updated_by FROM hr_hierarchy WHERE id = 1', [], req)
    const result = await query(text, values)
    if (result.rows.length === 0) {
      const deptResult = await query(
        `SELECT d.id, d.name, d.parent_id, d.parent_user_id,
                m.first_name || ' ' || m.last_name as manager_name,
                pu.first_name as parent_user_first_name,
                pu.last_name as parent_user_last_name,
                pu.position as parent_user_position,
                (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
         FROM departments d
         LEFT JOIN users m ON d.manager_id = m.id
         LEFT JOIN users pu ON d.parent_user_id = pu.id${req.org ? ' WHERE d.organization_id = $1' : ''}
         ORDER BY d.name`,
        req.org ? [req.org.org_id] : []
      )
      const auto = buildAutoHierarchy(deptResult.rows)
      return res.json({ data: auto, updated_at: null, updated_by: null })
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
 *             required: [nodes, edges]
 *             properties:
 *               nodes: { type: array, items: { type: object } }
 *               edges: { type: array, items: { type: object } }
 *               viewport: { type: object }
 *     responses:
 *       200:
 *         description: 'Структура сохранена; рёбра с relation=parent (или без relation) между department-нодами применены к departments.parent_id (source = родитель), между employee- и department-нодой — к departments.parent_user_id (сотрудник = куратор отдела); relation=plain игнорируется'
 *       400:
 *         description: 'Ошибка валидации рёбер (второй родитель, цикл, чужая организация) — сейв отклонён целиком'
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  const { nodes, edges, viewport } = req.body
  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Поля nodes и edges обязательны' })
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

    const data = JSON.stringify({ nodes, edges, viewport: viewport ?? DEFAULT_DATA.viewport })
    const result = await client.query(
      `INSERT INTO hr_hierarchy (id, data, updated_at, updated_by, organization_id)
       VALUES (1, $1, NOW(), $2, $3)
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by
       RETURNING updated_at`,
      [data, req.user.id, currentOrgId(req)]
    )

    for (const { deptId, parentId, parentUserId, vacParentSeesChild, vacChildSeesParent } of parentChanges) {
      const { text, values } = orgScopedQuery(
        'UPDATE departments SET parent_id = $1, parent_user_id = $2, vac_parent_sees_child = $3, vac_child_sees_parent = $4 WHERE id = $5',
        [parentId, parentUserId, vacParentSeesChild, vacChildSeesParent, deptId],
        req
      )
      await client.query(text, values)
    }

    await client.query('COMMIT')
    res.json({ updated_at: result.rows[0].updated_at })
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
 */
router.put('/department/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  const { id } = req.params
  const { nodes, edges, viewport } = req.body
  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Поля nodes и edges обязательны' })
  }
  try {
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
