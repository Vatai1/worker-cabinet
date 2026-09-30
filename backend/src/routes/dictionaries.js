import express from 'express'
import jwt from 'jsonwebtoken'
import { query, getClient } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errors.js'
import { uploadToS3, deleteFromS3, getFromS3 } from '../config/s3.js'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'
import { departmentMembers, moveUsersToDepartment } from '../lib/departmentMembers.js'
import multer from 'multer'
import { requirePermission } from '../lib/permissions.js'

async function validateOnlyOfficeUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const allowedHost = process.env.ONLYOFFICE_URL ? new URL(process.env.ONLYOFFICE_URL).hostname : null
    if (allowedHost && parsed.hostname !== allowedHost) return false
    return true
  } catch { return false }
}

function validateDocumentBuffer(buffer) {
  if (buffer.length < 4) return false
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04
  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
  const isRtf = buffer.slice(0, 5).toString('ascii').startsWith('{\\rtf')
  return isZip || isOle || isPdf || isRtf
}

const uploadDocTemplate = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Недопустимый тип файла'))
    }
  },
})

const router = express.Router()

/**
 * @swagger
 * /dictionaries/departments:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник отделов (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список отделов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Department' }
 */
router.get('/departments', authenticateToken, requirePermission('departments:manage'), asyncHandler(async (req, res) => {
  let sql = `
    SELECT d.id, d.name, d.manager_id, d.description, d.vacation_requests_blocked,
            d.parent_id, p.name AS parent_name,
            d.parent_user_id,
            pu.last_name || ' ' || pu.first_name || COALESCE(' ' || NULLIF(pu.middle_name, ''), '') AS parent_user_name,
            d.vac_parent_sees_child, d.vac_child_sees_parent, d.vac_parent_approves,
            d.emp_parent_sees_child, d.emp_child_sees_parent,
            m.last_name || ' ' || m.first_name || COALESCE(' ' || NULLIF(m.middle_name, ''), '') as manager_name,
            m.position AS manager_position,
            (SELECT COUNT(*) FROM users WHERE department_id = d.id AND status <> 'inactive')::int as employee_count
     FROM departments d
     LEFT JOIN users m ON d.manager_id = m.id
     LEFT JOIN departments p ON p.id = d.parent_id
     LEFT JOIN users pu ON pu.id = d.parent_user_id`
  const params = []
  if (req.org) {
    params.push(currentOrgId(req))
    sql += ` WHERE d.organization_id = $${params.length}`
  }
  sql += ` ORDER BY d.name`
  const result = await query(sql, params)
  const onCanvas = await hierarchyDepartmentIds(req.org ? currentOrgId(req) : null)
  res.json(result.rows.map((d) => ({ ...d, on_hierarchy: onCanvas.has(d.id) })))
}))

async function hierarchyDepartmentIds(orgId) {
  const result = orgId
    ? await query('SELECT data FROM hr_hierarchy WHERE organization_id = $1', [orgId])
    : await query('SELECT data FROM hr_hierarchy')
  const ids = new Set()
  for (const row of result.rows) {
    for (const n of row.data?.nodes ?? []) {
      if (n?.type === 'department' && n?.data?.id != null) ids.add(Number(n.data.id))
    }
  }
  return ids
}

async function syncHierarchyParentFlags(client, orgId, deptId, flags) {
  const row = (await client.query('SELECT data FROM hr_hierarchy WHERE organization_id = $1 FOR UPDATE', [orgId])).rows[0]
  if (!row?.data) return
  const data = row.data
  const deptNodeIds = new Set((data.nodes ?? []).filter((n) => n?.type === 'department' && Number(n?.data?.id) === deptId).map((n) => n.id))
  if (deptNodeIds.size === 0) return
  let changed = false
  data.edges = (data.edges ?? []).map((e) => {
    if (!deptNodeIds.has(e?.target) || e?.data?.relation === 'plain') return e
    changed = true
    return {
      ...e,
      data: {
        ...(e.data ?? {}),
        vacationVisibility: {
          ...(e.data?.vacationVisibility ?? {}),
          parentSeesChild: flags.vac_parent_sees_child,
          childSeesParent: flags.vac_child_sees_parent,
          parentApproves: flags.vac_parent_approves,
        },
        employeeVisibility: {
          ...(e.data?.employeeVisibility ?? {}),
          parentSeesChild: flags.emp_parent_sees_child,
          childSeesParent: flags.emp_child_sees_parent,
        },
      },
    }
  })
  if (!changed) return
  await client.query(
    'UPDATE hr_hierarchy SET data = $1, updated_at = NOW(), version = version + 1 WHERE organization_id = $2',
    [JSON.stringify(data), orgId]
  )
}

async function validateDepartmentParent(parentId, deptId, orgId, req) {
  if (parentId === null || parentId === undefined) return
  const parentResult = await query(...orgScopedQuery('SELECT id, organization_id FROM departments WHERE id = $1', [parentId], req))
  if (parentResult.rows.length === 0) throw new NotFoundError('Родительское подразделение не найдено')
  if (parentResult.rows[0].organization_id !== orgId) {
    throw new ValidationError('Родительское подразделение должно принадлежать той же организации')
  }
  const visited = new Set()
  let currentId = parentId
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    if (deptId !== null && currentId === deptId) throw new ValidationError('Цикл в иерархии отделов')
    const r = await query('SELECT parent_id FROM departments WHERE id = $1', [currentId])
    currentId = r.rows[0]?.parent_id || null
  }
}

/**
 * @swagger
 * /dictionaries/departments:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Создать отдел (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               manager_id: { type: integer }
 *               parent_id: { type: integer, nullable: true, description: 'Родительское подразделение той же организации' }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Отдел создан
 *       409:
 *         description: Отдел с таким названием уже существует
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/departments', authenticateToken, requirePermission('departments:manage'), asyncHandler(async (req, res) => {
  const { name, manager_id, description, parent_id } = req.body
  if (!name?.trim()) throw new ValidationError('Название отдела обязательно')

  const orgId = currentOrgId(req)
  if (!orgId) throw new ValidationError('Не выбрана организация')

  const existing = await query(
    ...orgScopedQuery('SELECT id FROM departments WHERE name = $1', [name.trim()], req)
  )
  if (existing.rows.length > 0) throw new ConflictError('Отдел с таким названием уже существует')

  await validateDepartmentParent(parent_id ?? null, null, orgId, req)

  const result = await query(
    'INSERT INTO departments (name, manager_id, description, parent_id, organization_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, manager_id, description, parent_id',
    [name.trim(), manager_id || null, description?.trim() || null, parent_id ?? null, orgId]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/departments/{id}:
 *   put:
 *     tags: [Dictionaries]
 *     summary: Обновить отдел (HR/admin)
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
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               manager_id: { type: integer }
 *               parent_id: { type: integer, nullable: true, description: 'Родительское подразделение той же организации' }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Отдел обновлён
 */
const VISIBILITY_FLAGS = ['vac_parent_sees_child', 'vac_child_sees_parent', 'vac_parent_approves', 'emp_parent_sees_child', 'emp_child_sees_parent']

router.put('/departments/:id', authenticateToken, requirePermission('departments:manage'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { name, manager_id, description, parent_id } = req.body
  if (!name?.trim()) throw new ValidationError('Название отдела обязательно')

  const existing = await query(...orgScopedQuery('SELECT * FROM departments WHERE id = $1', [id], req))
  if (existing.rows.length === 0) throw new NotFoundError('Отдел не найден')
  const current = existing.rows[0]

  const duplicate = await query(...orgScopedQuery('SELECT id FROM departments WHERE name = $1 AND id != $2', [name.trim(), id], req))
  if (duplicate.rows.length > 0) throw new ConflictError('Отдел с таким названием уже существует')

  const nextParentId = parent_id === undefined ? current.parent_id : (parent_id ?? null)
  if (nextParentId !== current.parent_id) {
    const onCanvas = await hierarchyDepartmentIds(current.organization_id)
    if (onCanvas.has(id)) {
      throw new ValidationError('Отдел размещён на схеме «Иерархия» — родителя меняйте связями на схеме')
    }
    await validateDepartmentParent(nextParentId, id, current.organization_id, req)
  }

  const flags = {}
  for (const f of VISIBILITY_FLAGS) flags[f] = typeof req.body[f] === 'boolean' ? req.body[f] : current[f]
  const flagsChanged = VISIBILITY_FLAGS.some((f) => flags[f] !== current[f])
  const blocked = typeof req.body.vacation_requests_blocked === 'boolean' ? req.body.vacation_requests_blocked : current.vacation_requests_blocked
  const nextDescription = description === undefined ? current.description : (description?.trim() || null)

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { text, values } = orgScopedQuery(
      `UPDATE departments SET name = $1, manager_id = $2, description = $3, parent_id = $4, vacation_requests_blocked = $5,
         vac_parent_sees_child = $6, vac_child_sees_parent = $7, vac_parent_approves = $8, emp_parent_sees_child = $9, emp_child_sees_parent = $10,
         updated_at = NOW()
       WHERE id = $11 RETURNING id, name, manager_id, description, parent_id`,
      [name.trim(), manager_id || null, nextDescription, nextParentId, blocked, ...VISIBILITY_FLAGS.map((f) => flags[f]), id],
      req
    )
    const result = await client.query(text, values)
    if (flagsChanged && current.organization_id) await syncHierarchyParentFlags(client, current.organization_id, id, flags)
    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

router.get('/departments/:id/members', authenticateToken, requirePermission('departments:manage'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const existing = await query(...orgScopedQuery('SELECT id FROM departments WHERE id = $1', [Number.isNaN(id) ? 0 : id], req))
  if (existing.rows.length === 0) throw new NotFoundError('Отдел не найден')
  res.json(await departmentMembers(null, id))
}))

router.post('/departments/:id/members', authenticateToken, requirePermission('departments:manage'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const userIds = Array.isArray(req.body.userIds) ? [...new Set(req.body.userIds.map(Number).filter(Number.isInteger))] : []
  if (userIds.length === 0) throw new ValidationError('Не выбраны работники')

  const existing = await query(...orgScopedQuery('SELECT id, organization_id FROM departments WHERE id = $1', [Number.isNaN(id) ? 0 : id], req))
  if (existing.rows.length === 0) throw new NotFoundError('Отдел не найден')
  const orgId = existing.rows[0].organization_id

  const found = orgId
    ? await query('SELECT user_id FROM user_organizations WHERE org_id = $1 AND user_id = ANY($2)', [orgId, userIds])
    : await query('SELECT id AS user_id FROM users WHERE id = ANY($1)', [userIds])
  if (found.rows.length !== userIds.length) throw new ValidationError('Некоторые работники не состоят в этом учреждении')

  const client = await getClient()
  try {
    await client.query('BEGIN')
    await moveUsersToDepartment(client, userIds, id)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  res.json({ moved: userIds.length })
}))

/**
 * @swagger
 * /dictionaries/departments/{id}:
 *   delete:
 *     tags: [Dictionaries]
 *     summary: Удалить отдел (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     description: 'Нельзя удалить отдел, в котором есть действующие работники (users.department_id, кроме деактивированных), если не передан transfer_to — тогда работники переводятся в указанный отдел. Также нельзя удалить при отправленных/утверждённых табелях. Прочие ссылки на отдел очищаются, черновики табелей удаляются'
 *     responses:
 *       200:
 *         description: Отдел удалён
 *       409:
 *         description: 'В отделе есть работники или отправленные/утверждённые табели — в тексте ошибки перечислено, что мешает'
 */
const MONTHS_NOMINATIVE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

const shortPersonName = (u) => {
  const initials = [u.first_name, u.middle_name].map((p) => p?.trim()?.[0]).filter(Boolean).map((c) => `${c}.`).join('')
  return initials ? `${u.last_name} ${initials}` : u.last_name
}

const listPreview = (items, limit = 5) =>
  items.length > limit ? `${items.slice(0, limit).join(', ')} и ещё ${items.length - limit}` : items.join(', ')

router.delete('/departments/:id', authenticateToken, requirePermission('departments:manage'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (Number.isNaN(id)) throw new NotFoundError('Отдел не найден')

  const existing = await query(...orgScopedQuery('SELECT id, organization_id FROM departments WHERE id = $1', [id], req))
  if (existing.rows.length === 0) throw new NotFoundError('Отдел не найден')

  const transferRaw = req.query.transfer_to ?? req.body?.transfer_to
  const transferTo = transferRaw != null && transferRaw !== '' ? parseInt(transferRaw, 10) : null
  if (transferTo != null) {
    if (Number.isNaN(transferTo) || transferTo === id) throw new ValidationError('Выберите другой отдел для перевода работников')
    const target = await query(...orgScopedQuery('SELECT id, organization_id FROM departments WHERE id = $1', [transferTo], req))
    if (target.rows.length === 0 || target.rows[0].organization_id !== existing.rows[0].organization_id) {
      throw new ValidationError('Отдел для перевода не найден в этом учреждении')
    }
  }

  const people = await departmentMembers(null, id)
  if (people.length > 0 && transferTo == null) {
    throw new ConflictError(`Нельзя удалить отдел: в нём есть работники — ${listPreview(people.map(shortPersonName))}. Переведите их в другой отдел`)
  }

  const sheets = await query('SELECT id, year, month, status FROM timesheets WHERE department_id = $1 ORDER BY year, month', [id])
  const finalSheets = sheets.rows.filter((t) => t.status !== 'draft')
  if (finalSheets.length > 0) {
    const periods = finalSheets.map((t) => `${MONTHS_NOMINATIVE[t.month - 1]} ${t.year}`)
    throw new ConflictError(`Нельзя удалить отдел: по нему есть отправленные или утверждённые табели — ${listPreview(periods)}`)
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')
    if (people.length > 0) await moveUsersToDepartment(client, people.map((p) => p.id), transferTo)
    await client.query('UPDATE user_organizations SET department_id = NULL WHERE department_id = $1', [id])
    await client.query('UPDATE users SET department_id = NULL WHERE department_id = $1', [id])
    await client.query("DELETE FROM timesheets WHERE department_id = $1 AND status = 'draft'", [id])
    const { text, values } = orgScopedQuery('DELETE FROM departments WHERE id = $1', [id], req)
    await client.query(text, values)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  res.json({ success: true, moved: people.length })
}))

/**
 * @swagger
 * /dictionaries/skills:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник тегов (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список тегов
 */
router.get('/skills', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const result = await query(
    ...orgScopedQuery(
      `SELECT sd.id, sd.name, sd.created_at,
              (SELECT COUNT(*) FROM user_skills WHERE skill_id = sd.id) as user_count
       FROM skills_dictionary sd
       ORDER BY sd.name`,
      [],
      req
    )
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /dictionaries/skills:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Создать тег (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Тег создан
 */
router.post('/skills', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название тега обязательно')

  const existing = await query(...orgScopedQuery('SELECT id FROM skills_dictionary WHERE name = $1', [name.trim()], req))
  if (existing.rows.length > 0) throw new ConflictError('Тег с таким названием уже существует')

  const result = await query(
    'INSERT INTO skills_dictionary (name, organization_id) VALUES ($1, $2) RETURNING id, name',
    [name.trim(), currentOrgId(req)]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/skills/{id}:
 *   put:
 *     tags: [Dictionaries]
 *     summary: Обновить тег (HR/admin)
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
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Тег обновлён
 */
router.put('/skills/:id', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название тега обязательно')

  const existing = await query(...orgScopedQuery('SELECT id FROM skills_dictionary WHERE id = $1', [id], req))
  if (existing.rows.length === 0) throw new NotFoundError('Тег не найден')

  const duplicate = await query(...orgScopedQuery('SELECT id FROM skills_dictionary WHERE name = $1 AND id != $2', [name.trim(), id], req))
  if (duplicate.rows.length > 0) throw new ConflictError('Тег с таким названием уже существует')

  const result = await query(
    ...orgScopedQuery('UPDATE skills_dictionary SET name = $1 WHERE id = $2 RETURNING id, name', [name.trim(), id], req)
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/skills/{id}:
 *   delete:
 *     tags: [Dictionaries]
 *     summary: Удалить тег (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Тег удалён
 */
router.delete('/skills/:id', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query(...orgScopedQuery('SELECT id FROM skills_dictionary WHERE id = $1', [id], req))
  if (existing.rows.length === 0) throw new NotFoundError('Тег не найден')

  const usersWithSkill = await query('SELECT COUNT(*) as cnt FROM user_skills WHERE skill_id = $1', [id])
  if (parseInt(usersWithSkill.rows[0].cnt) > 0) {
    throw new ConflictError('Нельзя удалить тег, который привязан к работникам')
  }

  await query(...orgScopedQuery('DELETE FROM skills_dictionary WHERE id = $1', [id], req))
  res.json({ success: true })
}))

/**
 * @swagger
 * /dictionaries/skills/{id}/assign:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Массово назначить тег работникам (HR/admin)
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
 *             required: [userIds]
 *             properties:
 *               userIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Тег назначен работникам
 */
router.post('/skills/:id/assign', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { userIds } = req.body
  const ids = Array.isArray(userIds) ? userIds.map(Number).filter((n) => Number.isInteger(n)) : []
  if (ids.length === 0) throw new ValidationError('Список работников обязателен')

  const tag = await query(...orgScopedQuery('SELECT id, name FROM skills_dictionary WHERE id = $1', [id], req))
  if (tag.rows.length === 0) throw new NotFoundError('Тег не найден')

  const result = await query(
    `INSERT INTO user_skills (user_id, skill_id)
     SELECT DISTINCT u, $2::int FROM unnest($1::int[]) AS u
     ON CONFLICT (user_id, skill_id) DO NOTHING
     RETURNING user_id`,
    [ids, id]
  )
  res.json({ assigned: result.rows.length, total: ids.length, tagName: tag.rows[0].name })
}))

/**
 * @swagger
 * /dictionaries/vacation-types:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник типов отпусков (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список типов отпусков
 */
router.get('/vacation-types', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const result = await query(
    ...orgScopedQuery(
      `SELECT vt.id, vt.code, vt.name,
              (SELECT COUNT(*) FROM vacation_requests WHERE vacation_type_id = vt.id) as request_count
       FROM vacation_types vt
       ORDER BY vt.name`,
      [],
      req
    )
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /dictionaries/vacation-types:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Создать тип отпуска (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Тип отпуска создан
 */
router.post('/vacation-types', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const { code, name } = req.body
  if (!code?.trim()) throw new ValidationError('Код типа отпуска обязателен')
  if (!name?.trim()) throw new ValidationError('Название типа отпуска обязательно')

  const existingCode = await query(...orgScopedQuery('SELECT id FROM vacation_types WHERE code = $1', [code.trim()], req))
  if (existingCode.rows.length > 0) throw new ConflictError('Тип отпуска с таким кодом уже существует')

  const existingName = await query(...orgScopedQuery('SELECT id FROM vacation_types WHERE name = $1', [name.trim()], req))
  if (existingName.rows.length > 0) throw new ConflictError('Тип отпуска с таким названием уже существует')

  const result = await query(
    'INSERT INTO vacation_types (code, name, organization_id) VALUES ($1, $2, $3) RETURNING id, code, name',
    [code.trim(), name.trim(), currentOrgId(req)]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/vacation-types/{id}:
 *   put:
 *     tags: [Dictionaries]
 *     summary: Обновить тип отпуска (HR/admin)
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
 *             required: [code, name]
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Тип отпуска обновлён
 */
router.put('/vacation-types/:id', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { code, name } = req.body
  if (!code?.trim()) throw new ValidationError('Код типа отпуска обязателен')
  if (!name?.trim()) throw new ValidationError('Название типа отпуска обязательно')

  const existing = await query(...orgScopedQuery('SELECT id FROM vacation_types WHERE id = $1', [id], req))
  if (existing.rows.length === 0) throw new NotFoundError('Тип отпуска не найден')

  const dupCode = await query(...orgScopedQuery('SELECT id FROM vacation_types WHERE code = $1 AND id != $2', [code.trim(), id], req))
  if (dupCode.rows.length > 0) throw new ConflictError('Тип отпуска с таким кодом уже существует')

  const dupName = await query(...orgScopedQuery('SELECT id FROM vacation_types WHERE name = $1 AND id != $2', [name.trim(), id], req))
  if (dupName.rows.length > 0) throw new ConflictError('Тип отпуска с таким названием уже существует')

  const result = await query(
    ...orgScopedQuery('UPDATE vacation_types SET code = $1, name = $2 WHERE id = $3 RETURNING id, code, name', [code.trim(), name.trim(), id], req)
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/vacation-types/{id}:
 *   delete:
 *     tags: [Dictionaries]
 *     summary: Удалить тип отпуска (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Тип отпуска удалён
 */
router.delete('/vacation-types/:id', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query(...orgScopedQuery('SELECT id FROM vacation_types WHERE id = $1', [id], req))
  if (existing.rows.length === 0) throw new NotFoundError('Тип отпуска не найден')

  const requestsWithType = await query(...orgScopedQuery('SELECT COUNT(*) as cnt FROM vacation_requests WHERE vacation_type_id = $1', [id], req))
  if (parseInt(requestsWithType.rows[0].cnt) > 0) {
    throw new ConflictError('Нельзя удалить тип отпуска, который используется в заявках')
  }

  await query(...orgScopedQuery('DELETE FROM vacation_types WHERE id = $1', [id], req))
  res.json({ success: true })
}))

/**
 * @swagger
 * /dictionaries/positions:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник должностей (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список должностей
 */
router.get('/positions', authenticateToken, requirePermission('dictionaries:manage'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT DISTINCT position as name, COUNT(*) as employee_count
     FROM users
     WHERE position IS NOT NULL AND position != ''
     GROUP BY position
     ORDER BY position`
  )
  res.json(result.rows)
}))

router.put('/positions/rename', authenticateToken, requirePermission('dictionaries:positions'), asyncHandler(async (req, res) => {
  const { oldName, newName } = req.body
  if (!oldName?.trim() || !newName?.trim()) throw new ValidationError('Названия обязательны')
  if (oldName.trim() === newName.trim()) throw new ValidationError('Названия совпадают')
  const result = await query(
    'UPDATE users SET position = $1 WHERE position = $2',
    [newName.trim(), oldName.trim()]
  )
  res.json({ success: true, updated: result.rowCount })
}))

router.delete('/positions/:name', authenticateToken, requirePermission('dictionaries:positions'), asyncHandler(async (req, res) => {
  const name = decodeURIComponent(req.params.name)
  await query('UPDATE users SET position = NULL WHERE position = $1', [name])
  res.json({ success: true })
}))

/**
 * @swagger
 * /dictionaries/doc-templates:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить справочник шаблонов документов (все роли)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список шаблонов
 */
router.get('/doc-templates', authenticateToken, asyncHandler(async (req, res) => {
  const { text, values } = orgScopedQuery(
    `SELECT id, name, description, category, purpose, file_key, mime_type, size, created_at, download_count
     FROM document_templates
     ORDER BY name`, [], req
  )
  const result = await query(text, values)
  res.json(result.rows)
}))

/**
 * @swagger
 * /dictionaries/doc-templates:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Создать шаблон документа (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               purpose: { type: string }
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Шаблон создан
 */
router.post('/doc-templates', authenticateToken, requirePermission('documents:templates'), uploadDocTemplate.single('file'), asyncHandler(async (req, res) => {
  const { name, description, purpose } = req.body
  if (!name?.trim()) throw new ValidationError('Название шаблона обязательно')

  if (purpose?.trim()) {
    const { text, values } = orgScopedQuery('SELECT id FROM document_templates WHERE purpose = $1', [purpose.trim()], req)
    const existing = await query(text, values)
    if (existing.rows.length > 0) throw new ConflictError('Шаблон с таким назначением уже существует')
  }

  let fileKey = null
  let mimeType = null
  let fileSize = null
  if (req.file) {
    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'docx'
    fileKey = `doc-templates/${Date.now()}.${ext}`
    await uploadToS3(req.file, fileKey)
    mimeType = req.file.mimetype
    fileSize = req.file.size
  }

  const result = await query(
    `INSERT INTO document_templates (name, description, category, purpose, file_key, mime_type, size, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, description, category, purpose, file_key, mime_type, size, created_at, download_count`,
    [name.trim(), description?.trim() || null, 'general', purpose?.trim() || null, fileKey, mimeType, fileSize, currentOrgId(req)]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/doc-templates/{id}:
 *   put:
 *     tags: [Dictionaries]
 *     summary: Обновить шаблон документа (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               purpose: { type: string }
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Шаблон обновлён
 */
router.put('/doc-templates/:id', authenticateToken, requirePermission('documents:templates'), uploadDocTemplate.single('file'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, description, purpose } = req.body
  if (!name?.trim()) throw new ValidationError('Название шаблона обязательно')

  const { text: eText, values: eVals } = orgScopedQuery('SELECT id, file_key, mime_type, size FROM document_templates WHERE id = $1', [id], req)
  const existing = await query(eText, eVals)
  if (existing.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  if (purpose?.trim()) {
    const { text: dText, values: dVals } = orgScopedQuery('SELECT id FROM document_templates WHERE purpose = $1 AND id != $2', [purpose.trim(), id], req)
    const duplicate = await query(dText, dVals)
    if (duplicate.rows.length > 0) throw new ConflictError('Шаблон с таким назначением уже существует')
  }

  let fileKey = existing.rows[0].file_key
  let mimeType = existing.rows[0].mime_type
  let fileSize = existing.rows[0].size
  if (req.file) {
    if (fileKey) await deleteFromS3(fileKey).catch(() => {})
    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'docx'
    fileKey = `doc-templates/${Date.now()}.${ext}`
    await uploadToS3(req.file, fileKey)
    mimeType = req.file.mimetype
    fileSize = req.file.size
  }

  const { text: uText, values: uVals } = orgScopedQuery(
    `UPDATE document_templates SET name = $1, description = $2, category = $3, purpose = $4, file_key = $5, mime_type = $6, size = $7 WHERE id = $8 RETURNING id, name, description, category, purpose, file_key, mime_type, size, created_at, download_count`,
    [name.trim(), description?.trim() || null, 'general', purpose?.trim() || null, fileKey, mimeType, fileSize, id], req
  )
  const result = await query(uText, uVals)
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /dictionaries/doc-templates/{id}:
 *   delete:
 *     tags: [Dictionaries]
 *     summary: Удалить шаблон документа (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Шаблон удалён
 */
router.delete('/doc-templates/:id', authenticateToken, requirePermission('documents:templates'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const { text: dText, values: dVals } = orgScopedQuery('SELECT id, file_key FROM document_templates WHERE id = $1', [id], req)
  const existing = await query(dText, dVals)
  if (existing.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  if (existing.rows[0].file_key) {
    await deleteFromS3(existing.rows[0].file_key).catch(() => {})
  }

  const { text: delText, values: delVals } = orgScopedQuery('DELETE FROM document_templates WHERE id = $1', [id], req)
  await query(delText, delVals)
  res.json({ success: true })
}))

/**
 * @swagger
 * /dictionaries/doc-templates/{id}/file:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Скачать файл шаблона документа (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Файл шаблона (binary stream)
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Шаблон или файл не найден
 */
router.get('/doc-templates/:id/file', authenticateToken, requirePermission('documents:templates'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const { text: fText, values: fVals } = orgScopedQuery('SELECT name, file_key, mime_type FROM document_templates WHERE id = $1', [id], req)
  const result = await query(fText, fVals)
  if (result.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  const { name, file_key, mime_type } = result.rows[0]
  if (!file_key) return res.status(404).json({ error: 'Файл не прикреплён' })

  const { Body, ContentType } = await getFromS3(file_key)
  const mimeTypeFromExt = getMimeTypeFromExtension(name)
  res.setHeader('Content-Type', mimeTypeFromExt || ContentType || mime_type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)

  const { text: dlText, values: dlVals } = orgScopedQuery('UPDATE document_templates SET download_count = download_count + 1 WHERE id = $1', [id], req)
  await query(dlText, dlVals).catch(() => {})

  Body.pipe(res)
}))

function getPublicApiUrl() {
  return process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || 'http://host.docker.internal:5000/api'
}

const EXT_TO_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  pdf: 'application/pdf',
  rtf: 'application/rtf',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
}

function getMimeTypeFromExtension(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return EXT_TO_MIME[ext] || null
}

/**
 * @swagger
 * /dictionaries/doc-templates/{id}/preview-token:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить токен предпросмотра шаблона (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Токен и публичный URL
 */
router.get('/doc-templates/:id/preview-token', authenticateToken, requirePermission('documents:templates'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { text: ptText, values: ptVals } = orgScopedQuery('SELECT id FROM document_templates WHERE id = $1', [id], req)
  const tmpl = await query(ptText, ptVals)
  if (tmpl.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  const token = jwt.sign(
    { templateId: id, userId: String(req.user.id), type: 'template_preview', exp: Math.floor(Date.now() / 1000) + 1800 },
    process.env.JWT_SECRET
  )
  const publicUrl = `${getPublicApiUrl()}/dictionaries/doc-templates/${id}/public/${token}`
  res.json({ token, publicUrl })
}))

/**
 * @swagger
 * /dictionaries/doc-templates/{id}/public/{token}:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Публичный просмотр шаблона документа по JWT-токену
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID шаблона
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: JWT preview-токен
 *     responses:
 *       200:
 *         description: Файл шаблона (binary stream)
 *       401:
 *         description: Недействительный токен
 *       403:
 *         description: Токен не соответствует шаблону
 *       404:
 *         description: Шаблон или файл не найден
 */
router.get('/doc-templates/:id/public/:token', asyncHandler(async (req, res) => {
  const { id, token } = req.params
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' })
  }
  if (decoded.type !== 'template_preview' || String(decoded.templateId) !== String(id)) {
    return res.status(403).json({ error: 'Токен не соответствует шаблону' })
  }

  const result = await query('SELECT name, file_key, mime_type FROM document_templates WHERE id = $1', [id])
  if (result.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  const { name, file_key, mime_type } = result.rows[0]
  if (!file_key) return res.status(404).json({ error: 'Файл не прикреплён' })

  const { Body, ContentType } = await getFromS3(file_key)
  const mimeTypeFromExt = getMimeTypeFromExtension(name)
  res.setHeader('Content-Type', mimeTypeFromExt || ContentType || mime_type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`)
  res.setHeader('Cache-Control', 'public, max-age=300')
  Body.pipe(res)
}))

// POST /api/dictionaries/doc-templates/:id/save-from-url — save file from OnlyOffice downloadAs URL
/**
 * @swagger
 * /dictionaries/doc-templates/{id}/save-from-url:
 *   post:
 *     tags: [Dictionaries]
 *     summary: Сохранить файл шаблона из URL (OnlyOffice downloadAs)
 *     description: 'Доступно для ролей: hr, admin'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, description: 'URL файла' }
 *               fileType: { type: string, description: 'Расширение файла' }
 *     responses:
 *       200:
 *         description: Файл сохранён
 *       400:
 *         description: URL не указан
 *       404:
 *         description: Шаблон не найден
 */
router.post('/doc-templates/:id/save-from-url', authenticateToken, requirePermission('documents:templates'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { url, fileType } = req.body

  if (!url) return res.status(400).json({ error: 'URL файла обязателен' })

  const { text: sfText, values: sfVals } = orgScopedQuery('SELECT file_key, mime_type FROM document_templates WHERE id = $1', [id], req)
  const tmplResult = await query(sfText, sfVals)
  if (tmplResult.rows.length === 0) throw new NotFoundError('Шаблон не найден')

  const tmpl = tmplResult.rows[0]

  if (!await validateOnlyOfficeUrl(url)) return res.status(400).json({ error: 'URL not allowed' })

  const response = await fetch(url)
  if (!response.ok) return res.status(502).json({ error: 'Не удалось скачать файл из OnlyOffice' })

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (!validateDocumentBuffer(buffer)) return res.status(502).json({ error: 'Скачанный файл не является документом' })

  const ext = fileType || tmpl.file_key?.split('.').pop() || 'docx'
  const mimeType = EXT_TO_MIME[ext] || tmpl.mime_type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const newFileKey = `doc-templates/${id}/${Date.now()}.${ext}`

  await uploadToS3({ buffer, mimetype: mimeType }, newFileKey)

  if (tmpl.file_key && tmpl.file_key !== newFileKey) {
    await deleteFromS3(tmpl.file_key).catch(() => {})
  }

  const { text: sfUpdText, values: sfUpdVals } = orgScopedQuery('UPDATE document_templates SET file_key = $1 WHERE id = $2', [newFileKey, id], req)
  await query(sfUpdText, sfUpdVals)

  res.json({ ok: true })
}))

// POST /api/dictionaries/doc-templates/:id/callback — OnlyOffice save callback
/**
 * @swagger
 * /dictionaries/doc-templates/{id}/callback:
 *   post:
 *     tags: [Dictionaries]
 *     summary: OnlyOffice callback для сохранения документа
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: integer, description: 'Статус (2=ready, 6=force save)' }
 *               url: { type: string, description: 'URL для скачивания' }
 *     responses:
 *       200:
 *         description: Callback обработан
 */
router.post('/doc-templates/:id/callback', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status, url } = req.body

  // status 2 = ready for saving, status 6 = force save
  if (status !== 2 && status !== 6) {
    return res.json({ error: 0 })
  }

  const { text: cbText, values: cbVals } = orgScopedQuery(
    'SELECT file_key, mime_type, name FROM document_templates WHERE id = $1',
    [id], req
  )
  const result = await query(cbText, cbVals)
  if (result.rows.length === 0) return res.status(404).json({ error: 1 })

  const tmpl = result.rows[0]

  if (!await validateOnlyOfficeUrl(url)) return res.status(502).json({ error: 1 })

  const response = await fetch(url)
  if (!response.ok) return res.status(502).json({ error: 1 })

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (!validateDocumentBuffer(buffer)) return res.json({ error: 1 })

  const ext = tmpl.file_key?.split('.').pop() || 'docx'
  const newFileKey = `doc-templates/${id}/${Date.now()}.${ext}`

  await uploadToS3({ buffer, mimetype: tmpl.mime_type || 'application/octet-stream', originalname: tmpl.name }, newFileKey)

  if (tmpl.file_key && tmpl.file_key !== newFileKey) {
    await deleteFromS3(tmpl.file_key).catch(() => {})
  }

  const { text: cbUpdText, values: cbUpdVals } = orgScopedQuery(
    'UPDATE document_templates SET file_key = $1 WHERE id = $2',
    [newFileKey, id], req
  )
  await query(cbUpdText, cbUpdVals)

  res.json({ error: 0 })
}))

/**
 * @swagger
 * /dictionaries/managers:
 *   get:
 *     tags: [Dictionaries]
 *     summary: Получить список руководителей (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список руководителей
 */
router.get('/managers', authenticateToken, requirePermission('departments:manage'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, first_name, last_name, middle_name, position
     FROM users
     WHERE role IN ('manager', 'admin') AND status <> 'inactive'
     ORDER BY last_name, first_name`
  )
  res.json(result.rows)
}))

export default router
