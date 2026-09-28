import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'
import { excludeTest } from '../utils/testScope.js'
import { vacationStatusBatch } from '../lib/vacationDays.js'
import { canEditDepartmentHierarchy, hasFullDepartmentAccess, managedDepartmentIds } from '../lib/departmentScope.js'

const router = express.Router()

const DEFAULT_DATA = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }

const AUTO_NODE_GAP_X = 320
const AUTO_NODE_GAP_Y = 220

const AUTO_EDGE_STYLE = { stroke: '#6b7280', strokeWidth: 2 }

async function enrichHierarchyData(data, orgId) {
  const nodes = data?.nodes ?? []
  const deptIds = [...new Set(
    nodes.filter((n) => n.type === 'department' && n.data?.id != null).map((n) => Number(n.data.id))
  )]
  const userIds = [...new Set(
    nodes.filter((n) => n.type === 'employee' && n.data?.id != null).map((n) => Number(n.data.id))
  )]
  if (deptIds.length === 0 && userIds.length === 0) return data

  const [deptResult, userResult, vacationMap] = await Promise.all([
    deptIds.length
      ? query(
          `SELECT d.id, d.name,
                  m.last_name || ' ' || m.first_name || COALESCE(' ' || NULLIF(m.middle_name, ''), '') as manager_name,
                  (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
           FROM departments d
           LEFT JOIN users m ON d.manager_id = m.id
           WHERE d.id = ANY($1::int[])`,
          [deptIds]
        )
      : Promise.resolve({ rows: [] }),
    userIds.length
      ? query(
          `SELECT u.id, u.first_name, u.last_name, u.middle_name, u.position, dep.name as department_name
           FROM users u
           LEFT JOIN departments dep ON u.department_id = dep.id
           WHERE u.id = ANY($1::int[])`,
          [userIds]
        )
      : Promise.resolve({ rows: [] }),
    vacationStatusBatch(userIds, orgId),
  ])
  const deptById = new Map(deptResult.rows.map((r) => [r.id, r]))
  const userById = new Map(userResult.rows.map((r) => [r.id, r]))

  const enrichedNodes = nodes.map((n) => {
    if (n.type === 'department' && n.data?.id != null) {
      const fresh = deptById.get(Number(n.data.id))
      if (fresh) {
        return { ...n, data: { ...n.data, name: fresh.name, managerName: fresh.manager_name, employeeCount: Number(fresh.employee_count) } }
      }
    } else if (n.type === 'employee' && n.data?.id != null) {
      const fresh = userById.get(Number(n.data.id))
      if (fresh) {
        return {
          ...n,
          data: {
            ...n.data,
            firstName: fresh.first_name,
            lastName: fresh.last_name,
            middleName: fresh.middle_name,
            position: fresh.position,
            department: fresh.department_name ?? undefined,
            vacation: vacationMap.get(Number(n.data.id)),
          },
        }
      }
    }
    return n
  })
  return { ...data, nodes: enrichedNodes }
}

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
          middleName: r.parent_user_middle_name || '',
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

  // «Должность» (position) — визуальный блок без своей записи в БД. В цепочке
  // родительских связей он прозрачен: X → Должность → Y трактуется так же,
  // как прямая связь X → Y. Собираем узловой граф родителей по ВСЕМ типам
  // узлов и для каждого реального (department/employee) источника связи,
  // указывающего на должность, поднимаемся вверх до первого не-«position» узла.
  const nodeTypeById = new Map()
  for (const n of (Array.isArray(nodes) ? nodes : [])) {
    if (n?.id != null) nodeTypeById.set(n.id, n?.type)
  }
  const parentEdgesByTarget = new Map()
  for (const e of Array.isArray(edges) ? edges : []) {
    if (e?.data?.relation === 'plain') continue
    if (e?.source == null || e?.target == null) continue
    if (!parentEdgesByTarget.has(e.target)) parentEdgesByTarget.set(e.target, [])
    parentEdgesByTarget.get(e.target).push(e.source)
  }
  for (const [targetId, sources] of parentEdgesByTarget) {
    if (sources.length > 1 && nodeTypeById.get(targetId) === 'position') {
      const posNode = (Array.isArray(nodes) ? nodes : []).find((n) => n.id === targetId)
      const posLabel = posNode?.data?.title || 'Должность'
      const err = new Error(`У блока «${posLabel}» может быть только один родитель`)
      err.statusCode = 400
      throw err
    }
  }
  const parentOfNode = new Map()
  for (const [targetId, sources] of parentEdgesByTarget) parentOfNode.set(targetId, sources[0])
  const resolveThroughPositions = (nodeId) => {
    if (nodeTypeById.get(nodeId) !== 'position') return nodeId
    let cur = parentOfNode.get(nodeId)
    const seen = new Set([nodeId])
    while (cur != null) {
      if (seen.has(cur)) return null
      seen.add(cur)
      if (nodeTypeById.get(cur) !== 'position') return cur
      cur = parentOfNode.get(cur)
    }
    return null
  }

  const parentsByDept = new Map()
  const parentUserByDept = new Map()
  const parentUserByUser = new Map()
  const visByDept = new Map()
  const visByUser = new Map()
  const empVisByDept = new Map()
  const empVisByUser = new Map()
  for (const e of Array.isArray(edges) ? edges : []) {
    if (e?.data?.relation === 'plain') continue
    // Связь, ведущая В блок должности, сама по себе не создаёт изменений —
    // у должности нет department_id/manager_id для обновления. Эффект этой
    // связи применяется ниже по цепочке, когда реальный узел резолвит
    // своего родителя через resolveThroughPositions.
    if (nodeTypeById.get(e?.target) === 'position') continue
    const resolvedSource = e?.source != null ? resolveThroughPositions(e.source) : null
    const sourceDept = resolvedSource != null ? deptIdByNode.get(resolvedSource) : null
    const targetDept = deptIdByNode.get(e?.target)
    const sourceUser = resolvedSource != null ? userIdByNode.get(resolvedSource) : null
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
        const err = new Error(`У работника может быть только один родитель: ${nameByUser.get(targetUser)}`)
        err.statusCode = 400
        throw err
      }
      parentUserByUser.set(targetUser, sourceUser)
    } else if (sourceDept != null && targetUser != null) {
      // Отдел не может быть родителем конкретного работника — ни напрямую,
      // ни через должность. Пропускаем без обновления (как и для прямой
      // связи «отдел → работник», которая тоже не поддерживается).
      continue
    } else {
      continue
    }
    if (e?.data?.vacationVisibility) {
      if (targetDept != null) visByDept.set(targetDept, e.data.vacationVisibility)
      else if (targetUser != null) visByUser.set(targetUser, e.data.vacationVisibility)
    }
    if (e?.data?.employeeVisibility) {
      if (targetDept != null) empVisByDept.set(targetDept, e.data.employeeVisibility)
      else if (targetUser != null) empVisByUser.set(targetUser, e.data.employeeVisibility)
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
      const err = new Error('Цикл в иерархии работников')
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

  // ─── Каскад настроек видимости отпусков ──────────────────────────────
  // На родительской связи HR может включить «каскад» для отдельного пункта
  // (видит/виден/согласовывает) — тогда это значение течёт вниз через все
  // уровни поддерева, а не только на прямого потомка. Явная настройка на
  // более глубокой связи имеет приоритет для своего узла, но не обрывает
  // каскад для узлов ещё ниже — течёт дальше не изменившись.
  const deptChildrenByParentDept = new Map()
  for (const [child, parents] of parentsByDept) {
    const parent = parents.size > 0 ? [...parents][0] : null
    if (parent == null) continue
    if (!deptChildrenByParentDept.has(parent)) deptChildrenByParentDept.set(parent, [])
    deptChildrenByParentDept.get(parent).push(child)
  }
  const deptChildrenByParentUser = new Map()
  for (const [dept, user] of parentUserByDept) {
    if (!deptChildrenByParentUser.has(user)) deptChildrenByParentUser.set(user, [])
    deptChildrenByParentUser.get(user).push(dept)
  }
  const userChildrenByParentUser = new Map()
  for (const [child, parent] of parentUserByUser) {
    if (!userChildrenByParentUser.has(parent)) userChildrenByParentUser.set(parent, [])
    userChildrenByParentUser.get(parent).push(child)
  }
  const childrenOfNode = (node) => {
    const result = []
    if (node.kind === 'dept') {
      for (const c of deptChildrenByParentDept.get(node.id) ?? []) result.push({ kind: 'dept', id: c })
    } else {
      for (const c of deptChildrenByParentUser.get(node.id) ?? []) result.push({ kind: 'dept', id: c })
      for (const c of userChildrenByParentUser.get(node.id) ?? []) result.push({ kind: 'user', id: c })
    }
    return result
  }
  const VIS_FIELDS = [
    ['parentSeesChild', 'cascadeParentSeesChild'],
    ['childSeesParent', 'cascadeChildSeesParent'],
    ['parentApproves', 'cascadeParentApproves'],
  ]
  const effectiveVisByDept = new Map()
  const effectiveVisByUser = new Map()
  const visitCascade = (node, inherited, seen) => {
    const key = `${node.kind}:${node.id}`
    if (seen.has(key)) return
    seen.add(key)
    const ownVis = node.kind === 'dept' ? visByDept.get(node.id) : visByUser.get(node.id)
    const effective = {}
    const toChildren = {}
    for (const [field, cascadeField] of VIS_FIELDS) {
      const ownValue = ownVis && ownVis[field] !== undefined ? ownVis[field] : undefined
      effective[field] = ownValue !== undefined ? ownValue : (inherited[field] !== undefined ? inherited[field] : true)
      toChildren[field] = (ownVis && ownVis[cascadeField]) ? effective[field] : inherited[field]
    }
    if (node.kind === 'dept') effectiveVisByDept.set(node.id, effective)
    else effectiveVisByUser.set(node.id, effective)
    for (const child of childrenOfNode(node)) visitCascade(child, toChildren, seen)
  }
  const deptsWithParent = new Set([...parentsByDept.keys(), ...parentUserByDept.keys()])
  const deptKeys = new Set([
    ...parentsByDept.keys(), ...[...parentsByDept.values()].flatMap((s) => [...s]),
    ...parentUserByDept.keys(),
  ])
  const userKeys = new Set([
    ...parentUserByUser.keys(), ...parentUserByUser.values(),
    ...parentUserByDept.values(),
  ])
  const seenCascade = new Set()
  for (const id of deptKeys) {
    if (!deptsWithParent.has(id)) visitCascade({ kind: 'dept', id }, {}, seenCascade)
  }
  for (const id of userKeys) {
    if (!parentUserByUser.has(id)) visitCascade({ kind: 'user', id }, {}, seenCascade)
  }

  const deptChanges = []
  for (const n of deptNodes) {
    const deptId = Number(n.data.id)
    const parents = parentsByDept.get(deptId)
    const vis = effectiveVisByDept.get(deptId) ?? visByDept.get(deptId)
    deptChanges.push({
      deptId,
      parentId: parents && parents.size > 0 ? [...parents][0] : null,
      parentUserId: parentUserByDept.get(deptId) ?? null,
      vacParentSeesChild: vis?.parentSeesChild !== false,
      vacChildSeesParent: vis?.childSeesParent !== false,
      vacParentApproves: vis?.parentApproves !== false,
      empParentSeesChild: empVisByDept.get(deptId)?.parentSeesChild === true,
      empChildSeesParent: empVisByDept.get(deptId)?.childSeesParent === true,
    })
  }

  const userChanges = []
  const seenUserIds = new Set()
  for (const n of (Array.isArray(nodes) ? nodes : [])) {
    if (n?.type !== 'employee' || !n?.data || n.data.id == null) continue
    const userId = Number(n.data.id)
    if (seenUserIds.has(userId)) continue
    seenUserIds.add(userId)
    const vis = effectiveVisByUser.get(userId) ?? visByUser.get(userId)
    userChanges.push({
      userId,
      managerId: parentUserByUser.get(userId) ?? null,
      vacParentSeesChild: vis?.parentSeesChild !== false,
      vacChildSeesParent: vis?.childSeesParent !== false,
      vacParentApproves: vis?.parentApproves !== false,
      empParentSeesChild: empVisByUser.get(userId)?.parentSeesChild === true,
      empChildSeesParent: empVisByUser.get(userId)?.childSeesParent === true,
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
 *                     nodes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: 'У employee-нод (при наличии data.id) поле data.vacation описывает текущий отпуск: { active: true, startDate, endDate, substitutes: string[] } если работник сейчас в одобренном отпуске (startDate/endDate — даты этого отпуска, substitutes — «Фамилия И.О.» замещающих), иначе отсутствует'
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
                m.last_name || ' ' || m.first_name || COALESCE(' ' || NULLIF(m.middle_name, ''), '') as manager_name,
                pu.first_name as parent_user_first_name,
                pu.last_name as parent_user_last_name,
                pu.middle_name as parent_user_middle_name,
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
    const row = result.rows[0]
    res.json({ ...row, data: await enrichHierarchyData(row.data, targetOrgId) })
  } catch (error) {
    res.locals.errorCause = error
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
    res.locals.errorCause = error
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

    for (const { deptId, parentId, parentUserId, vacParentSeesChild, vacChildSeesParent, vacParentApproves, empParentSeesChild, empChildSeesParent } of parentChanges.deptChanges) {
      const { text, values } = orgScopedQuery(
        'UPDATE departments SET parent_id = $1, parent_user_id = $2, vac_parent_sees_child = $3, vac_child_sees_parent = $4, vac_parent_approves = $5, emp_parent_sees_child = $6, emp_child_sees_parent = $7 WHERE id = $8',
        [parentId, parentUserId, vacParentSeesChild, vacChildSeesParent, vacParentApproves, empParentSeesChild, empChildSeesParent, deptId],
        req
      )
      await client.query(text, values)
    }

    for (const { userId, managerId, vacParentSeesChild, vacChildSeesParent, vacParentApproves, empParentSeesChild, empChildSeesParent } of parentChanges.userChanges) {
      await client.query(
        'UPDATE users SET manager_id = $1, vac_parent_sees_child = $2, vac_child_sees_parent = $3, vac_parent_approves = $4, emp_parent_sees_child = $5, emp_child_sees_parent = $6 WHERE id = $7',
        [managerId, vacParentSeesChild, vacChildSeesParent, vacParentApproves, empParentSeesChild, empChildSeesParent, userId]
      )
    }

    await client.query('COMMIT')
    res.json({ updated_at: result.rows[0].updated_at, version: result.rows[0].version })
  } catch (error) {
    res.locals.errorCause = error
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
 *                     nodes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: 'У employee-нод поле data.vacation — как в GET /hierarchy'
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
    const row = result.rows[0]
    res.json({ ...row, data: await enrichHierarchyData(row.data, currentOrgId(req)) })
  } catch (error) {
    res.locals.errorCause = error
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
    res.locals.errorCause = error
    console.error('PUT /hierarchy/global error:', error)
    res.status(500).json({ error: 'Не удалось сохранить глобальную иерархию' })
  }
})

/**
 * @swagger
 * /hierarchy/my-departments:
 *   get:
 *     tags: [Hierarchy]
 *     summary: Отделы, внутренние схемы которых текущий пользователь может редактировать
 *     description: 'Руководитель — свой отдел и все нижестоящие (по parent_id); HR/admin — все отделы учреждения'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список отделов (id, name, parent_id)
 */
router.get('/my-departments', authenticateToken, async (req, res) => {
  try {
    const orgId = currentOrgId(req)
    let rows
    if (hasFullDepartmentAccess(req)) {
      rows = (await query(
        `SELECT id, name, parent_id FROM departments WHERE ($1::int IS NULL OR organization_id = $1) ${excludeTest(req, 'departments')} ORDER BY name`,
        [orgId ?? null]
      )).rows
    } else {
      const ids = [...await managedDepartmentIds(req.user.id, orgId)]
      rows = ids.length === 0 ? [] : (await query('SELECT id, name, parent_id FROM departments WHERE id = ANY($1) ORDER BY name', [ids])).rows
    }
    res.json(rows)
  } catch (error) {
    res.locals.errorCause = error
    console.error('GET /hierarchy/my-departments error:', error)
    res.status(500).json({ error: 'Не удалось загрузить отделы' })
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
 *         description: 'Данные иерархии отдела; у employee-нод поле data.vacation — как в GET /hierarchy'
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
    const can_edit = await canEditDepartmentHierarchy(req, id)
    if (result.rows.length === 0) {
      return res.json({ data: DEFAULT_DATA, updated_at: null, updated_by: null, can_edit })
    }
    const row = result.rows[0]
    res.json({ ...row, data: await enrichHierarchyData(row.data, currentOrgId(req)), can_edit })
  } catch (error) {
    res.locals.errorCause = error
    console.error('GET /hierarchy/department/:id error:', error)
    res.status(500).json({ error: 'Не удалось загрузить иерархию отдела' })
  }
})

/**
 * @swagger
 * /hierarchy/department/{id}:
 *   put:
 *     tags: [Hierarchy]
 *     summary: Сохранить иерархию отдела (HR/admin или руководитель отдела/вышестоящего)
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
router.put('/department/:id', authenticateToken, async (req, res) => {
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
    if (!(await canEditDepartmentHierarchy(req, id))) {
      return res.status(403).json({ error: 'Схему отдела может менять его руководитель, руководитель вышестоящего отдела или HR' })
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
    res.locals.errorCause = error
    console.error('PUT /hierarchy/department/:id error:', error)
    res.status(500).json({ error: 'Не удалось сохранить иерархию отдела' })
  }
})

export default router
