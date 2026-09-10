import { updateKcUserRole, deleteKcRole, updateKcUserProfile, setKcUserEnabled, resetKcUserPassword, unlockKcUser, syncKcSessionSettings } from '../config/keycloak.js'
import keycloakConfig from '../config/keycloak.js'
import express from 'express'
import bcrypt from 'bcryptjs'
import { authenticateToken, authorizeRoles, authorizeGlobalRoles } from '../middleware/auth.js'
import { asyncHandler, ValidationError, ForbiddenError, NotFoundError } from '../middleware/errors.js'
import { query, getClient } from '../config/database.js'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'
import { requireRealSuperadmin, excludeTest, TEST_DEPT_NAME, TEST_USERS, TEST_USER_EMAILS, getTestDataState } from '../utils/testScope.js'
import { getActiveWsCount } from '../config/ws.js'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const COMPOSE_ROOT = path.resolve(__dirname, '../../..')

const router = express.Router()

const VALID_MAPPING_ROLES = ['employee', 'manager', 'hr', 'admin']

router.use(authenticateToken)
router.use(authorizeRoles('admin'))

async function logAudit(userId, userName, action, entityType, entityId, details, ipAddress, realUserId = null) {
  try {
    let name = userName
    if (!name && userId) {
      const r = await query('SELECT first_name, last_name FROM users WHERE id = $1', [userId])
      if (r.rows.length > 0) name = `${r.rows[0].first_name} ${r.rows[0].last_name}`
    }
    await query(
      `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, ip_address, real_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, name, action, entityType, entityId, details ? JSON.stringify(details) : null, ipAddress || null, realUserId && realUserId !== userId ? realUserId : null]
    )
  } catch (err) {
    console.error('[AUDIT LOG ERROR]', err.message)
  }
}

// ===================== ROLES =====================

/**
 * @swagger
 * /admin/roles:
 *   get:
 *     tags: [Admin]
 *     summary: Получить все роли с пермишенами
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Список ролей
 */
router.get('/roles', asyncHandler(async (req, res) => {
  const rolesResult = await query(`
    SELECT r.id, r.name, r.description, r.is_system, r.color, r.created_at,
      COALESCE(json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name, 'module', p.module))
        FILTER (WHERE p.id IS NOT NULL), '[]') as permissions
    FROM roles r
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    LEFT JOIN permissions p ON rp.permission_id = p.id
    GROUP BY r.id ORDER BY r.is_system DESC, r.created_at ASC
  `)
  res.json(rolesResult.rows)
}))

/**
 * @swagger
 * /admin/roles:
 *   post:
 *     tags: [Admin]
 *     summary: Создать новую роль
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               color: { type: string }
 *               permissionIds: { type: array, items: { type: integer } }
 *     responses:
 *       201:
 *         description: Роль создана
 */
router.post('/roles', asyncHandler(async (req, res) => {
  const { name, description, color, permissionIds } = req.body
  if (!name?.trim()) throw new ValidationError('Название роли обязательно')

  const existing = await query('SELECT id FROM roles WHERE name = $1', [name.trim()])
  if (existing.rows.length > 0) throw new ValidationError('Роль с таким названием уже существует')

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `INSERT INTO roles (name, description, color) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description?.trim() || null, color || null]
    )
    const role = result.rows[0]

    if (permissionIds?.length) {
      const values = permissionIds.map((_, i) => `($1, $${i + 2})`).join(', ')
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [role.id, ...permissionIds]
      )
    }

    await client.query('COMMIT')
    await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'role_create', 'role', String(role.id), { name: role.name }, req.ip, req.realUser?.id ?? null)
    res.status(201).json(role)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

/**
 * @swagger
 * /admin/roles/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Обновить роль и её пермишены
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               color: { type: string }
 *               permissionIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Роль обновлена
 */
router.put('/roles/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, description, color, permissionIds } = req.body

  const existing = await query('SELECT * FROM roles WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Роль не найдена')

  const client = await getClient()
  try {
    await client.query('BEGIN')

    const updates = []
    const values = []
    let idx = 1

    if (name !== undefined && name.trim()) {
      updates.push(`name = $${idx++}`)
      values.push(name.trim())
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`)
      values.push(description?.trim() || null)
    }
    if (color !== undefined) {
      updates.push(`color = $${idx++}`)
      values.push(color)
    }

    if (updates.length > 0) {
      values.push(id)
      await client.query(`UPDATE roles SET ${updates.join(', ')} WHERE id = $${idx}`, values)
    }

    if (permissionIds !== undefined) {
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id])
      if (permissionIds.length > 0) {
        const permValues = permissionIds.map((_, i) => `($1, $${i + 2})`).join(', ')
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ${permValues} ON CONFLICT DO NOTHING`,
          [id, ...permissionIds]
        )
      }
    }

    await client.query('COMMIT')
    await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'role_update', 'role', id, { name: name || existing.rows[0].name }, req.ip, req.realUser?.id ?? null)
    res.json({ success: true })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

/**
 * @swagger
 * /admin/roles/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Удалить несистемную роль
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Роль удалена
 */
router.delete('/roles/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query('SELECT * FROM roles WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Роль не найдена')
  if (existing.rows[0].is_system) throw new ForbiddenError('Системную роль нельзя удалить')

  const usersWithRole = await query('SELECT COUNT(*) as cnt FROM users WHERE role = $1', [existing.rows[0].name])
  if (parseInt(usersWithRole.rows[0].cnt) > 0) {
    throw new ValidationError('Нельзя удалить роль, которая назначена пользователям')
  }

  await query('DELETE FROM roles WHERE id = $1', [id])
  await deleteKcRole(existing.rows[0].name).catch(() => {})
  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'role_delete', 'role', id, { name: existing.rows[0].name }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true })
}))

// ===================== PERMISSIONS =====================

/**
 * @swagger
 * /admin/permissions:
 *   get:
 *     tags: [Admin]
 *     summary: Получить все пермишены (сгруппированные по модулям)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Список пермишенов
 */
router.get('/permissions', asyncHandler(async (req, res) => {
  const result = await query('SELECT id, code, name, module, description FROM permissions ORDER BY module, code')
  res.json(result.rows)
}))

// ===================== USERS =====================

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Получить всех пользователей с фильтрацией
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: search, in: query, schema: { type: string } }
 *       - { name: role, in: query, schema: { type: string } }
 *       - { name: department, in: query, schema: { type: string } }
 *       - { name: status, in: query, schema: { type: string } }
 *       - { name: position, in: query, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 50 } }
 *     responses:
 *       200:
 *         description: Список пользователей
 */
router.get('/users', asyncHandler(async (req, res) => {
  const { search, role, department, status, position, page = '1', limit = '50' } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)

  const conditions = []
  const values = []
  let paramIdx = 1
  let orgJoin = ''

  if (req.org) {
    orgJoin = 'JOIN user_organizations uo ON u.id = uo.user_id'
    conditions.push(`uo.org_id = $${paramIdx} AND uo.is_active = true`)
    values.push(req.org.org_id)
    paramIdx++
  }

  if (search) {
    conditions.push(`(u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx} OR u.position ILIKE $${paramIdx})`)
    values.push(`%${search}%`)
    paramIdx++
  }
  if (role) {
    conditions.push(`u.role = $${paramIdx}`)
    values.push(role)
    paramIdx++
  }
  if (department) {
    const deptId = parseInt(department)
    if (isNaN(deptId)) throw new ValidationError('Неверный ID отдела')
    conditions.push(`u.department_id = $${paramIdx}`)
    values.push(deptId)
    paramIdx++
  }
  if (status) {
    conditions.push(`u.status = $${paramIdx}`)
    values.push(status)
    paramIdx++
  }
  if (position) {
    conditions.push(`u.position = $${paramIdx}`)
    values.push(position)
    paramIdx++
  }

  const testCond = excludeTest(req, 'u', '')
  if (testCond) conditions.push(testCond)

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countResult = await query(`SELECT COUNT(*) as total FROM users u ${orgJoin} ${where}`, values)
  const total = parseInt(countResult.rows[0].total)

  const usersResult = await query(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.middle_name, u.position,
      u.status, u.role, u.department_id, u.hire_date, u.phone, u.avatar,
      u.manager_id, u.responsibility_area, u.office, u.cabinet, u.created_at,
      d.name as department_name,
      m.first_name as manager_first_name, m.last_name as manager_last_name,
      (
        SELECT string_agg(o.name, ', ')
        FROM user_organizations uo2
        JOIN organizations o ON uo2.org_id = o.id
        WHERE uo2.user_id = u.id AND uo2.is_active = true AND o.is_active = true
      ) as organizations
    FROM users u
    ${orgJoin}
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN users m ON u.manager_id = m.id
    ${where}
    ORDER BY u.last_name, u.first_name
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...values, parseInt(limit), offset])

  res.json({ users: usersResult.rows, total, page: parseInt(page), limit: parseInt(limit) })
}))

/**
 * @swagger
 * /admin/users/{id}/role:
 *   put:
 *     tags: [Admin]
 *     summary: Изменить роль пользователя
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string }
 *     responses:
 *       200:
 *         description: Роль обновлена
 */
router.put('/users/:id/role', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { role } = req.body
  if (!role?.trim()) throw new ValidationError('Роль обязательна')

  const roleCheck = await query('SELECT id FROM roles WHERE name = $1', [role.trim()])
  if (roleCheck.rows.length === 0) throw new ValidationError('Роль не найдена')

  const userCheck = await query('SELECT id, role, first_name, last_name FROM users WHERE id = $1', [id])
  if (userCheck.rows.length === 0) throw new NotFoundError('Пользователь не найден')

  const oldRole = userCheck.rows[0].role
  await query('UPDATE users SET role = $1 WHERE id = $2', [role.trim(), id])

  const guidCheck = await query('SELECT keycloak_guid FROM users WHERE id = $1', [id])
  if (guidCheck.rows[0]?.keycloak_guid) {
    await updateKcUserRole(guidCheck.rows[0].keycloak_guid, role.trim()).catch(() => {})
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'user_role_change', 'user', id,
    { oldRole, newRole: role.trim(), userName: `${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}` }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true })
}))

/**
 * @swagger
 * /admin/users/{id}/status:
 *   put:
 *     tags: [Admin]
 *     summary: Изменить статус пользователя
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [active, inactive, on_leave] }
 *     responses:
 *       200:
 *         description: Статус обновлён
 */
router.put('/users/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  const validStatuses = ['active', 'inactive', 'on_leave']
  if (!validStatuses.includes(status)) throw new ValidationError('Недопустимый статус')

  const userCheck = await query('SELECT id, status, first_name, last_name FROM users WHERE id = $1', [id])
  if (userCheck.rows.length === 0) throw new NotFoundError('Пользователь не найден')

  const oldStatus = userCheck.rows[0].status
  await query('UPDATE users SET status = $1 WHERE id = $2', [status, id])

  const guidCheck = await query('SELECT keycloak_guid FROM users WHERE id = $1', [id])
  if (guidCheck.rows[0]?.keycloak_guid) {
    await setKcUserEnabled(guidCheck.rows[0].keycloak_guid, status === 'active').catch(() => {})
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'user_status_change', 'user', id,
    { oldStatus, newStatus: status, userName: `${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}` }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true })
}))

/**
 * @swagger
 * /admin/users/{id}/reset-password:
 *   post:
 *     tags: [Admin]
 *     summary: Сбросить пароль пользователя
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               newPassword: { type: string }
 *     responses:
 *       200:
 *         description: Пароль сброшен
 */
router.post('/users/:id/reset-password', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { newPassword } = req.body
  if (!newPassword || newPassword.length < 6) throw new ValidationError('Пароль должен быть не менее 6 символов')

  const userCheck = await query('SELECT id, first_name, last_name FROM users WHERE id = $1', [id])
  if (userCheck.rows.length === 0) throw new NotFoundError('Пользователь не найден')

  const hash = await bcrypt.hash(newPassword, 10)
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id])

  const guidCheck = await query('SELECT keycloak_guid FROM users WHERE id = $1', [id])
  if (guidCheck.rows[0]?.keycloak_guid) {
    await resetKcUserPassword(guidCheck.rows[0].keycloak_guid, newPassword).catch(() => {})
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'user_password_reset', 'user', id,
    { userName: `${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}` }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true })
}))

/**
 * @swagger
 * /admin/users/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Полное редактирование пользователя администратором
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               middle_name: { type: string }
 *               email: { type: string }
 *               position: { type: string }
 *               department_id: { type: integer }
 *               phone: { type: string }
 *               manager_id: { type: integer }
 *               hire_date: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Пользователь обновлён
 */
router.put('/users/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const body = req.body

  const userCheck = await query('SELECT id FROM users WHERE id = $1', [id])
  if (userCheck.rows.length === 0) throw new NotFoundError('Пользователь не найден')

  const allowedFields = ['first_name', 'last_name', 'middle_name', 'email', 'position', 'department_id', 'phone', 'manager_id', 'hire_date', 'office', 'cabinet']
  const updates = []
  const values = []
  let idx = 1

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      const val = typeof body[field] === 'string' ? body[field].trim() : body[field]
      if (field === 'first_name' || field === 'last_name') {
        if (!val) continue
      }
      updates.push(`${field} = $${idx++}`)
      values.push(val || null)
    }
  }

  if (updates.length === 0) throw new ValidationError('Нет полей для обновления')

  values.push(id)
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values)

  if (body.first_name || body.last_name || body.email) {
    const guidCheck = await query('SELECT keycloak_guid, first_name, last_name, email FROM users WHERE id = $1', [id])
    if (guidCheck.rows[0]?.keycloak_guid) {
      await updateKcUserProfile(guidCheck.rows[0].keycloak_guid, {
        firstName: guidCheck.rows[0].first_name,
        lastName: guidCheck.rows[0].last_name,
        email: guidCheck.rows[0].email,
      }).catch(() => {})
    }
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'user_update', 'user', id, { updatedFields: updates.map(u => u.split(' = ')[0]) }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true })
}))

// ===================== SETTINGS =====================

/**
 * @swagger
 * /admin/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Получить системные настройки
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Системные настройки
 */
router.get('/settings', asyncHandler(async (req, res) => {
  const globalRes = await query('SELECT key, value, description, updated_at FROM system_settings WHERE organization_id IS NULL ORDER BY key')
  let merged = {}
  for (const row of globalRes.rows) {
    merged[row.key] = row
  }
  if (req.org) {
    const orgRes = await query('SELECT key, value, description, updated_at FROM system_settings WHERE organization_id = $1 ORDER BY key', [req.org.org_id])
    for (const row of orgRes.rows) {
      merged[row.key] = row
    }
  }
  res.json(Object.values(merged))
}))

/**
 * @swagger
 * /admin/settings:
 *   put:
 *     tags: [Admin]
 *     summary: Обновить системные настройки
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               settings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     value: { type: string }
 *     responses:
 *       200:
 *         description: Настройки обновлены
 */
router.put('/settings', asyncHandler(async (req, res) => {
  const { settings } = req.body
  if (!Array.isArray(settings)) throw new ValidationError('Ожидается массив настроек')

  const valid = settings.filter(s => s.key && s.value !== undefined)
  if (valid.length > 0) {
    const isSuperadmin = req.user.role === 'superadmin'
    const targetOrgId = isSuperadmin ? null : (req.org?.org_id || null)
    const placeholders = []
    const params = []
    valid.forEach((s, i) => {
      const base = i * 3
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, NOW())`)
      params.push(s.key, String(s.value), targetOrgId)
    })
    await query(
      `INSERT INTO system_settings (key, value, organization_id, updated_at) VALUES ${placeholders.join(', ')}
       ON CONFLICT (key, organization_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      params
    )
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'settings_update', 'system', null, { count: settings.length }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true })
}))

// ===================== AUDIT LOG =====================

/**
 * @swagger
 * /admin/audit-log:
 *   get:
 *     tags: [Admin]
 *     summary: Получить лог аудита с фильтрацией
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: action, in: query, schema: { type: string } }
 *       - { name: userId, in: query, schema: { type: integer } }
 *       - { name: entityType, in: query, schema: { type: string } }
 *       - { name: dateFrom, in: query, schema: { type: string, format: date } }
 *       - { name: dateTo, in: query, schema: { type: string, format: date } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 50 } }
 *     responses:
 *       200:
 *         description: Лог аудита
 */
router.get('/audit-log', asyncHandler(async (req, res) => {
  const { action, userId, entityType, dateFrom, dateTo, page = '1', limit = '50' } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)

  const conditions = []
  const values = []
  let paramIdx = 1

  if (req.org) {
    conditions.push(`a.user_id IN (SELECT user_id FROM user_organizations WHERE org_id = $${paramIdx} AND is_active = true)`)
    values.push(req.org.org_id)
    paramIdx++
  }

  if (action) {
    conditions.push(`a.action = $${paramIdx}`)
    values.push(action)
    paramIdx++
  }
  if (userId) {
    conditions.push(`a.user_id = $${paramIdx}`)
    values.push(parseInt(userId))
    paramIdx++
  }
  if (entityType) {
    conditions.push(`a.entity_type = $${paramIdx}`)
    values.push(entityType)
    paramIdx++
  }
  if (dateFrom) {
    conditions.push(`a.created_at >= $${paramIdx}`)
    values.push(dateFrom)
    paramIdx++
  }
  if (dateTo) {
    conditions.push(`a.created_at <= $${paramIdx}::timestamp + interval '1 day'`)
    values.push(dateTo)
    paramIdx++
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countResult = await query(`SELECT COUNT(*) as total FROM audit_log a ${where}`, values)
  const total = parseInt(countResult.rows[0].total)

  const result = await query(`
    SELECT a.id, a.user_id, a.user_name, a.action, a.entity_type, a.entity_id,
      a.details, a.ip_address, a.created_at, a.real_user_id,
      ru.email AS real_user_email,
      NULLIF(TRIM(COALESCE(ru.first_name, '') || ' ' || COALESCE(ru.last_name, '')), '') AS real_user_name
    FROM audit_log a
    LEFT JOIN users ru ON a.real_user_id = ru.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...values, parseInt(limit), offset])

  res.json({ logs: result.rows, total, page: parseInt(page), limit: parseInt(limit) })
}))

// ===================== STATS =====================

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Статистика для дашборда админ-панели
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Статистика
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const uTest = excludeTest(req, 'u')
  const uTestPlain = excludeTest(req, 'users')
  const dTest = excludeTest(req, 'departments', 'AND')
  const deptCount = orgScopedQuery(`SELECT COUNT(*) as count FROM departments WHERE 1=1 ${dTest}`, [], req)
  const orgUsersQuery = req.org
    ? query(`SELECT COUNT(*) as count FROM users u JOIN user_organizations uo ON u.id = uo.user_id WHERE uo.org_id = $1 AND uo.is_active = true ${uTest}`, [req.org.org_id])
    : query(`SELECT COUNT(*) as count FROM users WHERE 1=1 ${uTestPlain}`)
  const orgActiveUsersQuery = req.org
    ? query(`SELECT COUNT(*) as count FROM users u JOIN user_organizations uo ON u.id = uo.user_id WHERE uo.org_id = $1 AND uo.is_active = true AND u.status = 'active' ${uTest}`, [req.org.org_id])
    : query(`SELECT COUNT(*) as count FROM users WHERE status = 'active' ${uTestPlain}`)
  const [users, roles, departments, auditToday, activeUsers] = await Promise.all([
    orgUsersQuery,
    query('SELECT COUNT(*) as count FROM roles'),
    query(deptCount.text, deptCount.values),
    query(`SELECT COUNT(*) as count FROM audit_log WHERE created_at >= CURRENT_DATE`),
    orgActiveUsersQuery,
  ])

  const roleDistribution = await query(`
    SELECT role, COUNT(*) as count FROM users WHERE 1=1 ${uTestPlain} GROUP BY role ORDER BY count DESC
  `)

  res.json({
    totalUsers: parseInt(users.rows[0].count),
    activeUsers: parseInt(activeUsers.rows[0].count),
    totalRoles: parseInt(roles.rows[0].count),
    totalDepartments: parseInt(departments.rows[0].count),
    auditToday: parseInt(auditToday.rows[0].count),
    roleDistribution: roleDistribution.rows,
  })
}))

// ===================== BULK ACTIONS =====================

/**
 * @swagger
 * /admin/users/bulk-status:
 *   put:
 *     tags: [Admin]
 *     summary: Массовое изменение статуса пользователей
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds, status]
 *             properties:
 *               userIds: { type: array, items: { type: integer } }
 *               status: { type: string, enum: [active, inactive, on_leave] }
 *     responses:
 *       200:
 *         description: Статусы обновлены
 */
router.put('/users/bulk-status', asyncHandler(async (req, res) => {
  const { userIds, status } = req.body
  if (!Array.isArray(userIds) || userIds.length === 0) throw new ValidationError('Выберите хотя бы одного пользователя')
  if (!['active', 'inactive', 'on_leave'].includes(status)) throw new ValidationError('Недопустимый статус')

  const result = await query(
    `UPDATE users SET status = $1 WHERE id = ANY($2)`,
    [status, userIds]
  )

  if (result.rowCount > 0) {
    const guids = await query('SELECT keycloak_guid FROM users WHERE id = ANY($1) AND keycloak_guid IS NOT NULL', [userIds])
    for (const row of guids.rows) {
      await setKcUserEnabled(row.keycloak_guid, status === 'active').catch(() => {})
    }
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'bulk_status_change', 'user', null,
    { count: result.rowCount, status }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true, updated: result.rowCount })
}))

/**
 * @swagger
 * /admin/users/bulk-role:
 *   put:
 *     tags: [Admin]
 *     summary: Массовое изменение роли пользователей
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds, role]
 *             properties:
 *               userIds: { type: array, items: { type: integer } }
 *               role: { type: string }
 *     responses:
 *       200:
 *         description: Роли обновлены
 */
router.put('/users/bulk-role', asyncHandler(async (req, res) => {
  const { userIds, role } = req.body
  if (!Array.isArray(userIds) || userIds.length === 0) throw new ValidationError('Выберите хотя бы одного пользователя')
  if (!role?.trim()) throw new ValidationError('Роль обязательна')

  const roleCheck = await query('SELECT id FROM roles WHERE name = $1', [role.trim()])
  if (roleCheck.rows.length === 0) throw new ValidationError('Роль не найдена')

  const result = await query(
    `UPDATE users SET role = $1 WHERE id = ANY($2)`,
    [role.trim(), userIds]
  )

  if (result.rowCount > 0) {
    const guids = await query('SELECT keycloak_guid FROM users WHERE id = ANY($1) AND keycloak_guid IS NOT NULL', [userIds])
    for (const row of guids.rows) {
      await updateKcUserRole(row.keycloak_guid, role.trim()).catch(() => {})
    }
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'bulk_role_change', 'user', null,
    { count: result.rowCount, role: role.trim() }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true, updated: result.rowCount })
}))

/**
 * @swagger
 * /admin/users/export:
 *   get:
 *     tags: [Admin]
 *     summary: Экспорт пользователей в CSV
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: CSV файл
 */
router.get('/users/export', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.middle_name, u.position,
      u.status, u.role, u.phone, u.hire_date, u.responsibility_area,
      d.name as department
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    ORDER BY u.last_name, u.first_name
  `)

  const sep = ';'
  const header = ['ID', 'Email', 'Фамилия', 'Имя', 'Отчество', 'Должность', 'Статус', 'Роль', 'Телефон', 'Дата найма', 'Зона ответственности', 'Отдел'].join(sep)
  const rows = result.rows.map(r =>
    [r.id, r.email, r.last_name, r.first_name, r.middle_name || '', r.position, r.status, r.role, r.phone || '', r.hire_date || '', r.responsibility_area || '', r.department || ''].join(sep)
  )

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename=users_export.csv')
  res.send('\uFEFF' + header + '\n' + rows.join('\n'))
}))

// ===================== SYSTEM HEALTH =====================

/**
 * @swagger
 * /admin/health:
 *   get:
 *     tags: [Admin]
 *     summary: Состояние системы
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Метрики системы: version, counters { users, enabledModules, activeWs, errorsLast24h }, database (без connections/tables), server'
 */
router.get('/health', asyncHandler(async (req, res) => {
  const dbVersion = await query('SELECT version() as v')
  const dbSize = await query("SELECT pg_database_size(current_database()) as size")

  const usersCount = req.org
    ? await query('SELECT COUNT(*) as c FROM users u JOIN user_organizations uo ON u.id = uo.user_id WHERE uo.org_id = $1 AND uo.is_active = true', [req.org.org_id])
    : await query('SELECT COUNT(*) as c FROM users')
  const modulesCountQuery = orgScopedQuery("SELECT COUNT(*) as c FROM modules WHERE is_enabled = true", [], req)
  const modulesCount = await query(modulesCountQuery.text, modulesCountQuery.values)
  const errorsCount = await query("SELECT COUNT(*) as c FROM error_log WHERE created_at >= NOW() - INTERVAL '24 hours'")

  const uptime = process.uptime()
  const memUsage = process.memoryUsage()

  res.json({
    version: pkg.version,
    counters: {
      users: parseInt(usersCount.rows[0]?.c || 0),
      enabledModules: parseInt(modulesCount.rows[0]?.c || 0),
      activeWs: getActiveWsCount(),
      errorsLast24h: parseInt(errorsCount.rows[0]?.c || 0),
    },
    database: {
      version: dbVersion.rows[0]?.v?.split(' ').slice(0, 2).join(' ') || 'unknown',
      size: dbSize.rows[0]?.size || 0,
      sizeFormatted: formatBytes(dbSize.rows[0]?.size || 0),
    },
    server: {
      uptime: Math.floor(uptime),
      uptimeFormatted: formatUptime(uptime),
      memory: {
        rss: formatBytes(memUsage.rss),
        heapUsed: formatBytes(memUsage.heapUsed),
        heapTotal: formatBytes(memUsage.heapTotal),
        rssBytes: memUsage.rss,
        heapUsedBytes: memUsage.heapUsed,
      },
      nodeVersion: process.version,
      platform: process.platform,
      cpuUsage: process.cpuUsage(),
    },
    environment: process.env.NODE_ENV || 'development',
  })
}))

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (d > 0) parts.push(`${d} дн.`)
  if (h > 0) parts.push(`${h} ч.`)
  parts.push(`${m} мин.`)
  return parts.join(' ')
}

// ===================== ERROR LOGS =====================

/**
 * @swagger
 * /admin/error-log:
 *   get:
 *     tags: [Admin]
 *     summary: Лог ошибок системы
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 50 } }
 *     responses:
 *       200:
 *         description: 'Лог ошибок (включает поле module — модуль из пути запроса)'
 */
router.get('/error-log', asyncHandler(async (req, res) => {
  const { page = '1', limit = '50' } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)

  const countResult = await query(`SELECT COUNT(*) as total FROM error_log`)
  const total = parseInt(countResult.rows[0].total)

  const result = await query(`
    SELECT id, message, stack, path, method, status_code, user_id, user_email, ip, module, created_at
    FROM error_log
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `, [parseInt(limit), offset])

  res.json({ errors: result.rows, total, page: parseInt(page), limit: parseInt(limit) })
}))

// ===================== SECURITY =====================

/**
 * @swagger
 * /admin/security/failed-logins:
 *   get:
 *     tags: [Admin]
 *     summary: Неудачные попытки входа
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: days, in: query, schema: { type: integer, default: 30 } }
 *     responses:
 *       200:
 *         description: Список неудачных попыток
 */
router.get('/security/failed-logins', asyncHandler(async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 365)

  const attempts = await query(`
    SELECT id, email, ip_address, created_at
    FROM failed_login_attempts
    WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
    ORDER BY created_at DESC
    LIMIT 200
  `, [days])

  const byIp = await query(`
    SELECT ip_address, COUNT(*) as count, MAX(created_at) as last_attempt
    FROM failed_login_attempts
    WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
    GROUP BY ip_address
    ORDER BY count DESC
    LIMIT 20
  `, [days])

  const byEmail = await query(`
    SELECT email, COUNT(*) as count, MAX(created_at) as last_attempt
    FROM failed_login_attempts
    WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
    GROUP BY email
    ORDER BY count DESC
    LIMIT 20
  `, [days])

  res.json({ attempts: attempts.rows, byIp: byIp.rows, byEmail: byEmail.rows })
}))

/**
 * @swagger
 * /admin/security/locked-accounts:
 *   get:
 *     tags: [Admin]
 *     summary: Заблокированные аккаунты
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Список заблокированных
 */
router.get('/security/locked-accounts', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.locked_until, u.failed_login_count,
      d.name as department
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.locked_until IS NOT NULL AND u.locked_until > NOW()
    ORDER BY u.locked_until DESC
  `)
  res.json(result.rows)
}))

/**
 * @swagger
 * /admin/users/{id}/unlock:
 *   post:
 *     tags: [Admin]
 *     summary: Разблокировать аккаунт
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Аккаунт разблокирован
 */
router.post('/users/:id/unlock', asyncHandler(async (req, res) => {
  const { id } = req.params
  await query('UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE id = $1', [id])

  const guidCheck = await query('SELECT keycloak_guid FROM users WHERE id = $1', [id])
  if (guidCheck.rows[0]?.keycloak_guid) {
    await unlockKcUser(guidCheck.rows[0].keycloak_guid).catch(() => {})
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'account_unlock', 'user', id, {}, req.ip, req.realUser?.id ?? null)
  res.json({ success: true })
}))

// ===================== REPORTS =====================

/**
 * @swagger
 * /admin/reports/turnover:
 *   get:
 *     tags: [Admin]
 *     summary: Отчёт по текучести кадров
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: year, in: query, schema: { type: integer } }
 *       - { name: format, in: query, schema: { type: string, enum: [json, csv] } }
 *     responses:
 *       200:
 *         description: Отчёт по текучести
 */
router.get('/reports/turnover', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear()
  const { format } = req.query
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const [startCount, hired, fired] = await Promise.all([
    query(`SELECT COUNT(*) as cnt FROM users WHERE hire_date < $1 OR ($1 IS NULL)`, [yearStart]),
    query(`SELECT COUNT(*) as cnt, DATE_TRUNC('month', hire_date) as month FROM users WHERE hire_date BETWEEN $1 AND $2 GROUP BY month ORDER BY month`, [yearStart, yearEnd]),
    query(`SELECT COUNT(*) as cnt FROM users WHERE status = 'inactive' AND updated_at BETWEEN $1 AND $2`, [yearStart, yearEnd]),
  ])

  const avgHeadcount = parseInt(startCount.rows[0].cnt)
  const totalHired = hired.rows.reduce((sum, r) => sum + parseInt(r.cnt), 0)
  const totalFired = parseInt(fired.rows[0].cnt)
  const turnoverRate = avgHeadcount > 0 ? ((totalFired + totalHired) / 2 / avgHeadcount * 100).toFixed(1) : '0'

  const monthly = hired.rows.map(r => ({
    month: r.month,
    hired: parseInt(r.cnt),
  }))

  const byDept = await query(`
    SELECT d.name as department,
      COUNT(CASE WHEN u.hire_date BETWEEN $1 AND $2 THEN 1 END) as hired,
      COUNT(CASE WHEN u.status = 'inactive' AND u.updated_at BETWEEN $1 AND $2 THEN 1 END) as fired,
      COUNT(CASE WHEN u.status = 'active' THEN 1 END) as active
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    GROUP BY d.name
    ORDER BY d.name
  `, [yearStart, yearEnd])

  const result = {
    year,
    avgHeadcount,
    totalHired,
    totalFired,
    turnoverRate,
    monthly,
    byDepartment: byDept.rows.map(r => ({
      department: r.department || 'Без отдела',
      hired: parseInt(r.hired),
      fired: parseInt(r.fired),
      active: parseInt(r.active),
    })),
  }

  if (format === 'csv') {
    const sep = ';'
    const header = ['Отдел', 'Нанято', 'Уволено', 'Активных'].join(sep)
    const rows = result.byDepartment.map(r =>
      [r.department, r.hired, r.fired, r.active].join(sep)
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=turnover_report_${year}.csv`)
    return res.send('\uFEFF' + header + '\n' + rows.join('\n'))
  }

  res.json(result)
}))

/**
 * @swagger
 * /admin/reports/tenure-age:
 *   get:
 *     tags: [Admin]
 *     summary: Отчёт по стажу и возрасту
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: format, in: query, schema: { type: string, enum: [json, csv] } }
 *     responses:
 *       200:
 *         description: Отчёт по стажу и возрасту
 */
router.get('/reports/tenure-age', asyncHandler(async (req, res) => {
  const { format } = req.query

  const tenure = await query(`
    SELECT
      CASE
        WHEN hire_date IS NULL THEN 'Не указан'
        WHEN CURRENT_DATE - hire_date < 365 THEN 'Менее 1 года'
        WHEN CURRENT_DATE - hire_date < 730 THEN '1-2 года'
        WHEN CURRENT_DATE - hire_date < 1095 THEN '2-3 года'
        WHEN CURRENT_DATE - hire_date < 1825 THEN '3-5 лет'
        WHEN CURRENT_DATE - hire_date < 3650 THEN '5-10 лет'
        ELSE 'Более 10 лет'
      END as tenure_group,
      COUNT(*) as count
    FROM users WHERE status = 'active'
    GROUP BY tenure_group ORDER BY MIN(hire_date) DESC
  `)

  const avgTenure = await query(`
    SELECT AVG(EXTRACT(YEAR FROM age(CURRENT_DATE, hire_date))) as avg_years,
           MIN(hire_date) as earliest_hire
    FROM users WHERE status = 'active' AND hire_date IS NOT NULL
  `)

  const byDept = await query(`
    SELECT d.name as department,
      COUNT(*) as count,
      AVG(EXTRACT(YEAR FROM age(CURRENT_DATE, u.hire_date)))::numeric(10,1) as avg_years
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.status = 'active' AND u.hire_date IS NOT NULL
    GROUP BY d.name ORDER BY avg_years DESC
  `)

  const result = {
    tenureDistribution: tenure.rows.map(r => ({ group: r.tenure_group, count: parseInt(r.count) })),
    avgTenureYears: avgTenure.rows[0]?.avg_years ? parseFloat(avgTenure.rows[0].avg_years).toFixed(1) : '0',
    earliestHire: avgTenure.rows[0]?.earliest_hire || null,
    byDepartment: byDept.rows.map(r => ({
      department: r.department || 'Без отдела',
      count: parseInt(r.count),
      avgYears: parseFloat(r.avg_years) || 0,
    })),
  }

  if (format === 'csv') {
    const sep = ';'
    const header = ['Группа стажа', 'Количество'].join(sep)
    const rows = result.tenureDistribution.map(r => [r.group, r.count].join(sep))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=tenure_report.csv')
    return res.send('\uFEFF' + header + '\n' + rows.join('\n'))
  }

  res.json(result)
}))

/**
 * @swagger
 * /admin/reports/unused-vacations:
 *   get:
 *     tags: [Admin]
 *     summary: Отчёт по неиспользованным отпускам
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: year, in: query, schema: { type: integer } }
 *       - { name: format, in: query, schema: { type: string, enum: [json, csv] } }
 *     responses:
 *       200:
 *         description: Неиспользованные отпуска
 */
router.get('/reports/unused-vacations', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear()
  const { format } = req.query

  const result = await query(`
    SELECT u.id, u.first_name, u.last_name, u.middle_name, u.position, d.name as department,
      COALESCE(vb.total_days, 28) as total_days,
      COALESCE(vb.used_days, 0) as used_days,
      COALESCE(vb.available_days, 28) as available_days,
      COALESCE(vb.reserved_days, 0) as reserved_days
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN vacation_balances vb ON vb.user_id = u.id AND vb.year = $1
    WHERE u.status = 'active'
      AND COALESCE(vb.available_days, 28) > 0
    ORDER BY vb.available_days DESC NULLS LAST, u.last_name
  `, [year])

  const totalUnused = result.rows.reduce((sum, r) => sum + parseInt(r.available_days), 0)
  const employeesWithUnused = result.rows.length

  if (format === 'csv') {
    const sep = ';'
    const header = ['Фамилия', 'Имя', 'Отчество', 'Должность', 'Отдел', 'Всего дней', 'Использовано', 'Доступно', 'Зарезервировано'].join(sep)
    const rows = result.rows.map(r =>
      [r.last_name, r.first_name, r.middle_name || '', r.position, r.department || '', r.total_days, r.used_days, r.available_days, r.reserved_days].join(sep)
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=unused_vacations_${year}.csv`)
    return res.send('\uFEFF' + header + '\n' + rows.join('\n'))
  }

  res.json({ year, totalUnused, employeesWithUnused, employees: result.rows })
}))

/**
 * @swagger
 * /admin/reports/project-load:
 *   get:
 *     tags: [Admin]
 *     summary: Отчёт по загрузке по проектам
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: format, in: query, schema: { type: string, enum: [json, csv] } }
 *     responses:
 *       200:
 *         description: Загрузка по проектам
 */
router.get('/reports/project-load', asyncHandler(async (req, res) => {
  const { format } = req.query
  const orgId = currentOrgId(req)
  const orgClause = orgId ? 'WHERE cp.organization_id = $1' : ''
  const orgParams = orgId ? [orgId] : []

  const projects = await query(`
    SELECT cp.id, cp.name, cp.status,
      COUNT(cpm.id) as member_count,
      COALESCE(json_agg(json_build_object('id', u.id, 'name', u.first_name || ' ' || u.last_name, 'role', cpm.role))
        FILTER (WHERE u.id IS NOT NULL), '[]') as members
    FROM company_projects cp
    LEFT JOIN company_project_members cpm ON cpm.project_id = cp.id
    LEFT JOIN users u ON cpm.user_id = u.id AND u.status = 'active'
    ${orgClause}
    GROUP BY cp.id
    ORDER BY member_count DESC, cp.name
  `, orgParams)

  const summary = await query(`
    SELECT COUNT(DISTINCT cp.id) as total_projects,
      COUNT(DISTINCT CASE WHEN cp.status = 'active' THEN cp.id END) as active_projects,
      COUNT(DISTINCT cpm.user_id) as total_assigned,
      COUNT(DISTINCT CASE WHEN cp.status = 'active' THEN cpm.user_id END) as active_assigned
    FROM company_projects cp
    LEFT JOIN company_project_members cpm ON cpm.project_id = cp.id
    LEFT JOIN users u ON cpm.user_id = u.id AND u.status = 'active'
    ${orgClause}
  `, orgParams)

  const result = {
    summary: {
      totalProjects: parseInt(summary.rows[0]?.total_projects || '0'),
      activeProjects: parseInt(summary.rows[0]?.active_projects || '0'),
      totalAssigned: parseInt(summary.rows[0]?.total_assigned || '0'),
      activeAssigned: parseInt(summary.rows[0]?.active_assigned || '0'),
    },
    projects: projects.rows.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      memberCount: parseInt(r.member_count),
      members: r.members,
    })),
  }

  if (format === 'csv') {
    const sep = ';'
    const header = ['Проект', 'Статус', 'Кол-во участников', 'Участники'].join(sep)
    const rows = result.projects.map(r =>
      [r.name, r.status, r.memberCount, r.members.map(m => m.name).join(', ')].join(sep)
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=project_load.csv')
    return res.send('\uFEFF' + header + '\n' + rows.join('\n'))
  }

  res.json(result)
}))

/**
 * @swagger
 * /admin/reports/vacations:
 *   get:
 *     tags: [Admin]
 *     summary: Отчёт по отпускам
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: year, in: query, schema: { type: integer } }
 *       - { name: departmentId, in: query, schema: { type: integer } }
 *       - { name: format, in: query, schema: { type: string, enum: [json, csv] } }
 *     responses:
 *       200:
 *         description: Отчёт по отпускам
 */
router.get('/reports/vacations', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear()
  const { departmentId, format } = req.query

  const values = [year]
  let deptFilter = ''
  if (departmentId) {
    const deptId = parseInt(departmentId)
    if (isNaN(deptId)) return res.status(400).json({ error: 'Некорректный ID отдела' })
    deptFilter = ` AND u.department_id = $2`
    values.push(deptId)
  }
  let orgFilter = ''
  if (req.org) {
    orgFilter = ` AND vr.organization_id = $${values.length + 1}`
    values.push(req.org.org_id)
  }

  const result = await query(`
    SELECT u.id, u.first_name, u.last_name, u.middle_name, u.position, d.name as department,
      COALESCE(vb.total_days, 28) as total_days,
      COALESCE(vb.used_days, 0) as used_days,
      COALESCE(vb.available_days, 28) as available_days,
      COALESCE(vb.reserved_days, 0) as reserved_days,
      (SELECT COUNT(*) FROM vacation_requests vr WHERE vr.user_id = u.id AND EXTRACT(YEAR FROM vr.created_at) = $1${orgFilter}) as request_count
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN vacation_balances vb ON vb.user_id = u.id AND vb.year = $1
    WHERE u.status = 'active'${deptFilter}
    ORDER BY d.name, u.last_name, u.first_name
  `, values)

  if (format === 'csv') {
    const sep = ';'
    const header = ['Фамилия', 'Имя', 'Отчество', 'Должность', 'Отдел', 'Всего дней', 'Использовано', 'Доступно', 'Зарезервировано', 'Заявлений'].join(sep)
    const rows = result.rows.map(r =>
      [r.last_name, r.first_name, r.middle_name || '', r.position, r.department || '', r.total_days, r.used_days, r.available_days, r.reserved_days, r.request_count].join(sep)
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=vacation_report_${year}.csv`)
    return res.send('\uFEFF' + header + '\n' + rows.join('\n'))
  }

  res.json(result.rows)
}))

/**
 * @swagger
 * /admin/reports/hires:
 *   get:
 *     tags: [Admin]
 *     summary: Отчёт по наймам
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: dateFrom, in: query, schema: { type: string, format: date } }
 *       - { name: dateTo, in: query, schema: { type: string, format: date } }
 *       - { name: format, in: query, schema: { type: string, enum: [json, csv] } }
 *     responses:
 *       200:
 *         description: Отчёт по наймам
 */
router.get('/reports/hires', asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, format } = req.query
  const conditions = []
  const values = []
  let idx = 1

  if (dateFrom) { conditions.push(`u.hire_date >= $${idx++}`); values.push(dateFrom) }
  if (dateTo) { conditions.push(`u.hire_date <= $${idx++}`); values.push(dateTo) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const result = await query(`
    SELECT u.id, u.first_name, u.last_name, u.middle_name, u.email, u.position, u.hire_date,
      u.status, u.role, d.name as department,
      m.first_name as manager_first, m.last_name as manager_last
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN users m ON u.manager_id = m.id
    ${where}
    ORDER BY u.hire_date DESC
  `, values)

  if (format === 'csv') {
    const sep = ';'
    const header = ['Фамилия', 'Имя', 'Отчество', 'Email', 'Должность', 'Отдел', 'Дата найма', 'Статус', 'Роль', 'Руководитель'].join(sep)
    const rows = result.rows.map(r =>
      [r.last_name, r.first_name, r.middle_name || '', r.email, r.position, r.department || '', r.hire_date || '', r.status, r.role, r.manager_first ? `${r.manager_first} ${r.manager_last}` : ''].join(sep)
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=hires_report.csv')
    return res.send('\uFEFF' + header + '\n' + rows.join('\n'))
  }

  res.json(result.rows)
}))

// ===================== DICTIONARIES =====================

/**
 * @swagger
 * /admin/dictionaries:
 *   get:
 *     tags: [Admin]
 *     summary: Все справочники для редактирования
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Справочники
 */
router.get('/dictionaries', asyncHandler(async (req, res) => {
  const vacationTypesQuery = orgScopedQuery('SELECT id, code, name FROM vacation_types ORDER BY name', [], req)
  const skillsQuery = orgScopedQuery('SELECT id, name FROM skills_dictionary ORDER BY name', [], req)
  const [positions, vacationTypes, skills] = await Promise.all([
    query('SELECT DISTINCT position as name, COUNT(*) as count FROM users GROUP BY position ORDER BY position'),
    query(vacationTypesQuery.text, vacationTypesQuery.values),
    query(skillsQuery.text, skillsQuery.values),
  ])

  res.json({ positions: positions.rows, vacationTypes: vacationTypes.rows, skills: skills.rows })
}))

/**
 * @swagger
 * /admin/dictionaries/skills:
 *   post:
 *     tags: [Admin]
 *     summary: Добавить навык в справочник
 *     security: [{ bearerAuth: [] }]
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
 *         description: Навык добавлен
 */
router.post('/dictionaries/skills', asyncHandler(async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название обязательно')
  const orgId = currentOrgId(req)
  const result = await query(
    `INSERT INTO skills_dictionary (name, organization_id) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING *`,
    [name.trim(), orgId]
  )
  if (result.rows.length === 0) throw new ValidationError('Такой навык уже существует')
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /admin/dictionaries/skills/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Удалить навык из справочника
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Навык удалён
 */
router.delete('/dictionaries/skills/:id', asyncHandler(async (req, res) => {
  const { text, values } = orgScopedQuery('DELETE FROM skills_dictionary WHERE id = $1', [req.params.id], req)
  await query(text, values)
  res.json({ success: true })
}))

// ===================== MODULES =====================

/**
 * @swagger
 * /admin/modules:
 *   get:
 *     tags: [Admin]
 *     summary: Получить все модули системы
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Список модулей
 */
router.get('/modules', asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM modules WHERE organization_id IS NULL ORDER BY sort_order')
  let overrides = []
  if (req.org) {
    const ovRes = await query('SELECT * FROM module_overrides WHERE org_id = $1', [req.org.org_id])
    overrides = ovRes.rows
  }
  const overrideMap = Object.fromEntries(overrides.map(o => [o.module_code, o]))
  res.json(result.rows.map(r => {
    const ov = overrideMap[r.code]
    const globalEnabled = r.is_enabled
    const isEnabledOverride = ov?.is_enabled_override ?? null
    return {
      ...r,
      locked: r.category === 'core' || r.code === 'appearance',
      global_name: r.name,
      global_is_enabled: globalEnabled,
      org_name: ov?.name || null,
      org_settings: ov?.settings || null,
      is_overridden: !!ov,
      is_enabled_override: isEnabledOverride,
      effective_enabled: globalEnabled && (isEnabledOverride !== false),
    }
  }))
}))

/**
 * @swagger
 * /admin/modules:
 *   post:
 *     tags: [Admin]
 *     summary: Создать новый модуль
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code: { type: string, example: training }
 *               name: { type: string, example: Обучение }
 *               description: { type: string }
 *               icon: { type: string, example: GraduationCap }
 *               route: { type: string, example: /training }
 *               category: { type: string, example: work, enum: [hr, work, docs, admin, general] }
 *               sort_order: { type: integer, example: 130 }
 *     responses:
 *       201:
 *         description: Модуль создан
 *       409:
 *         description: Модуль с таким кодом уже существует
 */
router.post('/modules', asyncHandler(async (req, res) => {
  const { code, name, description, icon, route, category, sort_order } = req.body
  if (!code?.trim()) throw new ValidationError('Код модуля обязателен')
  if (!name?.trim()) throw new ValidationError('Название модуля обязательно')

  const result = await query(
    `INSERT INTO modules (code, name, description, icon, route, category, sort_order, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL) RETURNING *`,
    [code.trim(), name.trim(), description || null, icon || null, route || null, category || 'general', sort_order || 0]
  )

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_create', 'module', String(result.rows[0].id),
    { code: code.trim(), name: name.trim() }, req.ip, req.realUser?.id ?? null)

  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /admin/modules/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Обновить модуль
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               icon: { type: string }
 *               route: { type: string }
 *               category: { type: string, enum: [hr, work, docs, admin, general] }
 *               sort_order: { type: integer }
 *     responses:
 *       200:
 *         description: Модуль обновлён
 *       404:
 *         description: Модуль не найден
 */
router.put('/modules/:id', authorizeGlobalRoles('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, description, icon, route, category, sort_order } = req.body

  const existing = await query('SELECT * FROM modules WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Модуль не найден')

  const result = await query(
    `UPDATE modules SET name = COALESCE($1, name), description = COALESCE($2, description),
      icon = COALESCE($3, icon), route = COALESCE($4, route), category = COALESCE($5, category),
      sort_order = COALESCE($6, sort_order),
      updated_at = NOW() WHERE id = $7 RETURNING *`,
    [name || null, description !== undefined ? description : null, icon || null, route || null, category || null, sort_order !== undefined ? sort_order : null, id]
  )

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_update', 'module', id,
    { code: existing.rows[0].code, updatedFields: Object.keys(req.body) }, req.ip, req.realUser?.id ?? null)

  res.json(result.rows[0])
}))

/**
 * @swagger
 * /admin/modules/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Удалить модуль
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Модуль удалён
 *       404:
 *         description: Модуль не найден
 */
router.delete('/modules/:id', authorizeGlobalRoles('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const existing = await query('SELECT * FROM modules WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Модуль не найден')
  if (existing.rows[0].category === 'core' || existing.rows[0].code === 'appearance') {
    throw new ValidationError('Базовый модуль нельзя отключить')
  }

  await query('DELETE FROM modules WHERE id = $1', [id])

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_delete', 'module', id,
    { code: existing.rows[0].code, name: existing.rows[0].name }, req.ip, req.realUser?.id ?? null)

  res.json({ success: true })
}))

/**
 * @swagger
 * /admin/modules/{id}/toggle:
 *   put:
 *     tags: [Admin]
 *     summary: Включить/выключить модуль
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Статус модуля обновлён
 *       400:
 *         description: Базовый модуль нельзя отключить
 */
router.put('/modules/:id/toggle', authorizeGlobalRoles('superadmin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const existing = await query('SELECT * FROM modules WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Модуль не найден')
  if (existing.rows[0].category === 'core' || existing.rows[0].code === 'appearance') {
    throw new ValidationError('Базовый модуль нельзя отключить')
  }

  const newStatus = !existing.rows[0].is_enabled
  await query('UPDATE modules SET is_enabled = $1, updated_at = NOW() WHERE id = $2', [newStatus, id])

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_toggle', 'module', id,
    { module: existing.rows[0].code, name: existing.rows[0].name, enabled: newStatus }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true, enabled: newStatus })
}))

/**
 * @swagger
 * /admin/modules/{code}/org-toggle:
 *   put:
 *     tags: [Admin]
 *     summary: Локальное отключение/включение модуля для учреждения
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: code, in: path, required: true, schema: { type: string }, description: 'Код модуля' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enable: { type: boolean, description: 'true — сбросить переопределение (наследовать глобальное), false — отключить локально' }
 *     responses:
 *       200:
 *         description: Локальный статус модуля обновлён
 *       400:
 *         description: Модуль отключён глобально или нет контекста учреждения
 *       403:
 *         description: Нет прав
 */
router.put('/modules/:code/org-toggle', authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const { code } = req.params
  const { enable } = req.body
  if (!req.org) throw new ValidationError('Не выбрано учреждение')

  const moduleRes = await query('SELECT id, is_enabled, name FROM modules WHERE code = $1 AND organization_id IS NULL', [code])
  if (moduleRes.rows.length === 0) throw new NotFoundError('Модуль не найден')
  if (!moduleRes.rows[0].is_enabled) {
    throw new ValidationError('Модуль отключён глобально, включение невозможно')
  }

  const moduleId = moduleRes.rows[0].id
  if (enable === false) {
    await query(`
      INSERT INTO module_overrides (org_id, module_code, is_enabled_override)
      VALUES ($1, $2, false)
      ON CONFLICT (org_id, module_code) DO UPDATE SET is_enabled_override = false, updated_at = NOW()
    `, [req.org.org_id, code])
  } else {
    await query(`
      INSERT INTO module_overrides (org_id, module_code, is_enabled_override)
      VALUES ($1, $2, NULL)
      ON CONFLICT (org_id, module_code) DO UPDATE SET is_enabled_override = NULL, updated_at = NOW()
    `, [req.org.org_id, code])
  }

  const effectiveEnabled = enable !== false
  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_org_toggle', 'module', String(moduleId),
    { module: code, name: moduleRes.rows[0].name, org_id: req.org.org_id, enabled: effectiveEnabled }, req.ip, req.realUser?.id ?? null)
  res.json({ success: true, enabled: effectiveEnabled })
}))

/**
 * @swagger
 * /admin/modules/enabled:
 *   get:
 *     tags: [Admin]
 *     summary: Получить список включённых модулей (публичный)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Включённые модули
 */
router.get('/modules/enabled', asyncHandler(async (req, res) => {
  const result = await query('SELECT code FROM modules WHERE is_enabled = true')
  res.json(result.rows.map(r => r.code))
}))

/**
 * @swagger
 * /admin/modules/{id}/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Получить настройки модуля
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: 'Код модуля (vacation, calendar, notifications, auth)' }
 *     responses:
 *       200:
 *         description: Настройки модуля (JSONB)
 *       404:
 *         description: Модуль не найден
 */
router.get('/modules/:id/settings', asyncHandler(async (req, res) => {
  const { id } = req.params
  const globalRes = await query('SELECT settings FROM modules WHERE code = $1', [id])
  if (globalRes.rows.length === 0) throw new NotFoundError('Модуль не найден')
  const globalSettings = globalRes.rows[0].settings || {}
  if (req.org) {
    const ovRes = await query('SELECT settings FROM module_overrides WHERE org_id = $1 AND module_code = $2', [req.org.org_id, id])
    if (ovRes.rows.length > 0 && ovRes.rows[0].settings) {
      res.json({ ...globalSettings, ...ovRes.rows[0].settings })
      return
    }
  }
  res.json(globalSettings)
}))

/**
 * @swagger
 * /admin/modules/{id}/settings:
 *   patch:
 *     tags: [Admin]
 *     summary: Обновить настройки модуля
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: 'Код модуля (vacation, calendar, notifications, auth)' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Произвольные настройки модуля (JSONB)
 *     responses:
 *       200:
 *         description: 'Настройки обновлены. В аудит логируются только измененные ключи'
 *       404:
 *         description: Модуль не найден
 */
router.patch('/modules/:id/settings', asyncHandler(async (req, res) => {
  const { id } = req.params
  const globalRes = await query('SELECT id, settings FROM modules WHERE code = $1', [id])
  if (globalRes.rows.length === 0) throw new NotFoundError('Модуль не найден')

  const oldSettings = globalRes.rows[0].settings || {}
  let settingsToSave = req.body

  if (id === 'auth' && keycloakConfig.enabled) {
    const KC_STRIPPED_KEYS = [
      'minLength', 'requireUppercase', 'requireLowercase', 'requireDigit', 'requireSpecial',
      'passwordExpiry', 'passwordHistory',
      'mfaType', 'totpEnabled', 'smsEnabled', 'emailCodeEnabled', 'pushEnabled', 'mfaGracePeriod',
      'ldapUrl', 'ldapBindDn', 'ldapBindPassword', 'ldapBaseDn', 'ldapUserFilter', 'ldapUsernameAttr',
      'ssoProviders',
    ]
    settingsToSave = { ...req.body }
    for (const key of KC_STRIPPED_KEYS) delete settingsToSave[key]
  }

  const isSuperadmin = req.user.role === 'superadmin'

  if (isSuperadmin) {
    const result = await query(
      'UPDATE modules SET settings = $1, updated_at = NOW() WHERE code = $2 RETURNING settings',
      [JSON.stringify(settingsToSave), id]
    )
    const changed = {}
    for (const key of Object.keys(settingsToSave)) {
      const oldVal = oldSettings[key]
      const newVal = settingsToSave[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changed[key] = { old: oldVal ?? null, new: newVal }
      }
    }
    await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
      'module_settings_update', 'module', String(globalRes.rows[0].id), { changed, scope: 'global' }, req.ip, req.realUser?.id ?? null)
    res.json(result.rows[0].settings)
  } else if (req.org) {
    await query(`
      INSERT INTO module_overrides (org_id, module_code, settings)
      VALUES ($1, $2, $3)
      ON CONFLICT (org_id, module_code) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
    `, [req.org.org_id, id, JSON.stringify(settingsToSave)])
    await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
      'module_settings_update', 'module', String(globalRes.rows[0].id), { scope: 'org', org_id: req.org.org_id }, req.ip, req.realUser?.id ?? null)
    res.json(settingsToSave)
  } else {
    res.json(settingsToSave)
  }

  if (id === 'auth') {
    const oldSL = Number(oldSettings.sessionLifetime)
    const newSL = Number(req.body.sessionLifetime)
    const oldRL = Number(oldSettings.refreshLifetime)
    const newRL = Number(req.body.refreshLifetime)
    if (oldSL !== newSL || oldRL !== newRL) {
      syncKcSessionSettings({
        sessionLifetimeMinutes: Number(req.body.sessionLifetime) || 480,
        refreshLifetimeDays: Number(req.body.refreshLifetime) || 7,
      }).catch((err) => console.error('[KC] syncKcSessionSettings:', err.message))
    }
  }
}))

router.put('/modules/:code/override', authorizeRoles('admin', 'hr'), asyncHandler(async (req, res) => {
  const { code } = req.params
  const { name } = req.body
  if (!req.org) throw new ForbiddenError()
  const existing = await query('SELECT id FROM modules WHERE code = $1', [code])
  if (existing.rows.length === 0) throw new NotFoundError('Модуль не найден')
  await query(`
    INSERT INTO module_overrides (org_id, module_code, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (org_id, module_code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
  `, [req.org.org_id, code, name?.trim() || null])
  res.json({ success: true })
}))

router.delete('/modules/:code/override', authorizeRoles('admin', 'hr'), asyncHandler(async (req, res) => {
  const { code } = req.params
  if (!req.org) throw new ForbiddenError()
  await query('DELETE FROM module_overrides WHERE org_id = $1 AND module_code = $2', [req.org.org_id, code])
  res.json({ success: true })
}))

// ===================== MINI-AGENT =====================

router.get('/assistant/agent-status', asyncHandler(async (req, res) => {
  const statusQ = orgScopedQuery(
    `SELECT key, value FROM system_settings WHERE key IN ('assistant_agent_port')`,
    [],
    req
  )
  const { rows } = await query(statusQ.text, statusQ.values)
  const port = rows.find(r => r.key === 'assistant_agent_port')?.value || '8642'
  try {
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })
    res.json({ status: healthRes.ok ? 'running' : 'stopped' })
  } catch {
    res.json({ status: 'stopped' })
  }
}))

router.post('/assistant/agent-toggle', asyncHandler(async (req, res) => {
  const { enabled } = req.body
  const toggleQ = orgScopedQuery(
    `SELECT value FROM system_settings WHERE key = 'assistant_agent_port'`,
    [],
    req
  )
  const { rows: settings } = await query(toggleQ.text, toggleQ.values)
  const port = settings[0]?.value || '8642'

  const { execFileSync } = await import('child_process')

  try {
    if (enabled) {
      execFileSync('docker', ['rm', '-f', 'worker-cabinet-mini-agent'], { cwd: COMPOSE_ROOT, timeout: 10000, stdio: 'ignore' })
      execFileSync('docker', ['compose', '-f', 'docker/mini-agent/docker-compose.yml', 'up', '-d'], {
        cwd: COMPOSE_ROOT, timeout: 30000, stdio: 'ignore',
        env: { ...process.env, MINI_AGENT_PORT: port },
      })
    } else {
      execFileSync('docker', ['compose', '-f', 'docker/mini-agent/docker-compose.yml', 'down'], { cwd: COMPOSE_ROOT, timeout: 15000, stdio: 'ignore' })
    }
  } catch (e) {
    return res.json({ success: false, message: `Контейнер: ${e.message}` })
  }

  res.json({ success: true })
}))

router.post('/assistant/agent-config', asyncHandler(async (req, res) => {
  const configQ = orgScopedQuery(
    `SELECT key, value FROM system_settings WHERE key IN ('assistant_agent_model', 'assistant_agent_base_url')`,
    [],
    req
  )
  const { rows } = await query(configQ.text, configQ.values)
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

  const model = map.assistant_agent_model || 'qwen2.5:3b'
  const baseUrl = map.assistant_agent_base_url || 'http://host.docker.internal:11434/v1'

  const { execFileSync } = await import('child_process')

  try {
    const net = execFileSync(
      'docker',
      ['inspect', process.env.HOSTNAME || '', '--format', '{{range $k,$v := .NetworkSettings.Networks}}{{end}}'],
      { timeout: 5000, encoding: 'utf-8' }
    ).trim()
    execFileSync('docker', [
      'rm', '-f', 'worker-cabinet-mini-agent',
    ], { timeout: 10000, stdio: 'ignore' })
    execFileSync('docker', [
      'run', '-d',
      '--name', 'worker-cabinet-mini-agent',
      '--restart', 'unless-stopped',
      '--network', net,
      '--network-alias', 'mini-agent',
      '-e', `MODEL=${model}`,
      '-e', `BASE_URL=${baseUrl}`,
      '-p', '127.0.0.1:8642:8642',
      'vatai12/worker-cabinet-mini-agent:latest',
    ], { timeout: 30000, stdio: 'ignore' })
  } catch (e) {
    return res.json({ success: false, message: e.message })
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'agent_config_update', 'system', null, { model, baseUrl }, req.ip, req.realUser?.id ?? null)

  res.json({ success: true })
}))

// ===================== OLLAMA MODELS =====================

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

router.get('/assistant/models', asyncHandler(async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
    const data = await r.json()
    res.json(data)
  } catch {
    res.json({ models: [] })
  }
}))

router.post('/assistant/models/pull', asyncHandler(async (req, res) => {
  const { model } = req.body
  if (!model) return res.status(400).json({ error: 'Укажите модель' })

  const pullRes = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
  })

  if (!pullRes.ok) {
    const errText = await pullRes.text().catch(() => 'unknown')
    return res.status(502).json({ error: `Ollama: ${pullRes.status} ${errText}` })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  if (pullRes.body) {
    const reader = pullRes.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    } catch (e) {
      console.error('Pull stream error:', e.message)
    }
  }

  res.end()
}))

// ===================== ROLE MAPPINGS =====================

/**
 * @swagger
 * /admin/role-mappings:
 *   get:
 *     tags: [Admin]
 *     summary: 'Получить правила маппинга должность → org_role (доступно для ролей: admin, superadmin)'
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Список активных правил, отсортирован по position_pattern, org_role'
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   position_pattern: { type: string }
 *                   org_role: { type: string, enum: [employee, manager, hr, admin] }
 *                   is_active: { type: boolean }
 *                   created_at: { type: string, format: date-time }
 *                   updated_at: { type: string, format: date-time }
 */
router.get('/role-mappings', authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM role_mapping_rules WHERE is_active = true ORDER BY position_pattern, org_role'
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /admin/role-mappings:
 *   post:
 *     tags: [Admin]
 *     summary: 'Создать правило маппинга (доступно для ролей: admin, superadmin)'
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [position_pattern, org_role]
 *             properties:
 *               position_pattern: { type: string, description: 'Подстрока для сопоставления с users.position' }
 *               org_role: { type: string, enum: [employee, manager, hr, admin] }
 *     responses:
 *       201:
 *         description: Правило создано
 *       400:
 *         description: Ошибка валидации
 */
router.post('/role-mappings', authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const { position_pattern, org_role } = req.body
  if (!position_pattern?.trim()) throw new ValidationError('Должность (шаблон) обязательна')
  if (!VALID_MAPPING_ROLES.includes(org_role)) throw new ValidationError('Недопустимая роль')
  const result = await query(
    'INSERT INTO role_mapping_rules (position_pattern, org_role) VALUES ($1, $2) RETURNING *',
    [position_pattern.trim(), org_role]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /admin/role-mappings/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: 'Обновить правило маппинга (доступно для ролей: admin, superadmin)'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               position_pattern: { type: string }
 *               org_role: { type: string, enum: [employee, manager, hr, admin] }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Правило обновлено
 *       404:
 *         description: Правило не найдено
 */
router.put('/role-mappings/:id', authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id)
  if (Number.isNaN(id)) throw new ValidationError('Некорректный идентификатор правила')
  const { position_pattern, org_role, is_active } = req.body
  const updates = []
  const values = []
  let paramIndex = 1
  if (position_pattern !== undefined) {
    if (!String(position_pattern).trim()) throw new ValidationError('Должность (шаблон) обязательна')
    updates.push(`position_pattern = $${paramIndex++}`)
    values.push(String(position_pattern).trim())
  }
  if (org_role !== undefined) {
    if (!VALID_MAPPING_ROLES.includes(org_role)) throw new ValidationError('Недопустимая роль')
    updates.push(`org_role = $${paramIndex++}`)
    values.push(org_role)
  }
  if (is_active !== undefined) {
    updates.push(`is_active = $${paramIndex++}`)
    values.push(Boolean(is_active))
  }
  if (updates.length === 0) throw new ValidationError('Нет данных для обновления')
  updates.push('updated_at = NOW()')
  values.push(id)
  const result = await query(
    `UPDATE role_mapping_rules SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  )
  if (result.rows.length === 0) throw new NotFoundError('Правило не найдено')
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /admin/role-mappings/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: 'Удалить правило маппинга (доступно для ролей: admin, superadmin)'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Правило удалено
 *       404:
 *         description: Правило не найдено
 */
router.delete('/role-mappings/:id', authorizeRoles('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id)
  if (Number.isNaN(id)) throw new ValidationError('Некорректный идентификатор правила')
  const result = await query('DELETE FROM role_mapping_rules WHERE id = $1 RETURNING id', [id])
  if (result.rows.length === 0) throw new NotFoundError('Правило не найдено')
  res.json({ success: true })
}))

// ===================== TEST CONTOUR =====================

router.get('/test-data', requireRealSuperadmin, asyncHandler(async (req, res) => {
  res.json(await getTestDataState(req))
}))

router.post('/test-data', requireRealSuperadmin, asyncHandler(async (req, res) => {
  let orgId = req.org?.org_id || null
  if (!orgId) {
    const own = await query(
      `SELECT uo.org_id FROM user_organizations uo
       JOIN organizations o ON o.id = uo.org_id
       WHERE uo.user_id = $1 AND uo.is_active = true AND o.is_active = true
       ORDER BY uo.is_primary DESC, uo.org_id ASC LIMIT 1`,
      [req.realUser?.id || req.user.id]
    )
    orgId = own.rows[0]?.org_id
      || (await query(`SELECT id FROM organizations WHERE is_active = true ORDER BY id ASC LIMIT 1`)).rows[0]?.id
      || null
  }
  if (!orgId) throw new ValidationError('Не найдено ни одной активной организации')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    let dept = (await client.query(
      `SELECT id FROM departments WHERE name = $1 AND organization_id = $2`,
      [TEST_DEPT_NAME, orgId]
    )).rows[0]
    if (!dept) {
      dept = (await client.query(
        `INSERT INTO departments (name, organization_id, is_test) VALUES ($1, $2, true) RETURNING id`,
        [TEST_DEPT_NAME, orgId]
      )).rows[0]
    } else {
      await client.query(`UPDATE departments SET is_test = true WHERE id = $1`, [dept.id])
    }
    const deptId = dept.id
    const passwordHash = await bcrypt.hash('password123', 10)
    const created = []
    for (const tu of TEST_USERS) {
      let u = (await client.query(`SELECT id FROM users WHERE email = $1`, [tu.email])).rows[0]
      if (!u) {
        u = (await client.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, role, status, position, department_id, hire_date, is_test)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, CURRENT_DATE, true) RETURNING id`,
          [tu.email, passwordHash, tu.first_name, tu.last_name, tu.role, tu.position, deptId]
        )).rows[0]
      } else {
        await client.query(
          `UPDATE users SET is_test = true, status = 'active', role = $2, department_id = $3, position = $4, password_hash = $5 WHERE id = $1`,
          [u.id, tu.role, deptId, tu.position, passwordHash]
        )
      }
      await client.query(
        `INSERT INTO user_organizations (user_id, org_id, org_role, is_active, is_primary)
         VALUES ($1, $2, $3, true, true)
         ON CONFLICT (user_id, org_id) DO UPDATE SET org_role = EXCLUDED.org_role, is_active = true, is_primary = true`,
        [u.id, orgId, tu.org_role]
      )
      created.push({ id: u.id, ...tu })
    }
    const mgr = created.find((c) => c.role === 'manager')
    const emp = created.find((c) => c.role === 'employee')
    if (mgr) {
      await client.query(`UPDATE departments SET manager_id = $1 WHERE id = $2`, [mgr.id, deptId])
      await client.query(
        `UPDATE users SET manager_id = $1 WHERE is_test = true AND department_id = $2 AND id <> $1`,
        [mgr.id, deptId]
      )
    }

    if (emp) {
      await client.query(
        `INSERT INTO vacation_balances (user_id, total_days, used_days, available_days, reserved_days, organization_id)
         SELECT $1, 28, 0, 28, 0, $2
         WHERE NOT EXISTS (SELECT 1 FROM vacation_balances WHERE user_id = $1 AND organization_id = $2)`,
        [emp.id, orgId]
      )
      const hasReq = await client.query(
        `SELECT 1 FROM vacation_requests WHERE user_id = $1 AND transfer_reason IS NULL LIMIT 1`,
        [emp.id]
      )
      if (hasReq.rows.length === 0) {
        const vt = (await client.query(
          `SELECT id FROM vacation_types WHERE organization_id = $1 ORDER BY id LIMIT 1`,
          [orgId]
        )).rows[0]
        const stId = (await client.query(`SELECT id FROM request_statuses WHERE code = 'on_approval'`)).rows[0]
        if (vt && stId) {
          const start = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10)
          const end = new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10)
          const vrRes = await client.query(
            `INSERT INTO vacation_requests (user_id, start_date, end_date, duration, vacation_type_id, status_id, approver_id, organization_id, created_at)
             VALUES ($1, $2, $3, 5, $4, $5, $6, $7, NOW() - INTERVAL '1 day') RETURNING id`,
            [emp.id, start, end, vt.id, stId.id, mgr ? mgr.id : null, orgId]
          )
          await client.query(
            `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, organization_id)
             VALUES ($1, $2, $3, $4)`,
            [vrRes.rows[0].id, stId.id, emp.id, orgId]
          ).catch(() => {})
        }
      }
    }

    await client.query('COMMIT')
    res.status(201).json(await getTestDataState(req))
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

router.delete('/test-data', requireRealSuperadmin, asyncHandler(async (req, res) => {
  await query(`UPDATE users SET status = 'inactive' WHERE is_test = true AND email = ANY($1)`, [TEST_USER_EMAILS])
  res.json(await getTestDataState(req))
}))

export default router
