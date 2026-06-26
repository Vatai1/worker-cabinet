import { updateKcUserRole } from '../config/keycloak.js'
import express from 'express'
import bcrypt from 'bcryptjs'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler, ValidationError, ForbiddenError, NotFoundError } from '../middleware/errors.js'
import { query, getClient } from '../config/database.js'

const router = express.Router()

router.use(authenticateToken)
router.use(authorizeRoles('admin'))

async function logAudit(userId, userName, action, entityType, entityId, details, ipAddress) {
  try {
    let name = userName
    if (!name && userId) {
      const r = await query('SELECT first_name, last_name FROM users WHERE id = $1', [userId])
      if (r.rows.length > 0) name = `${r.rows[0].first_name} ${r.rows[0].last_name}`
    }
    await query(
      `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, name, action, entityType, entityId, details ? JSON.stringify(details) : null, ipAddress || null]
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
      for (const pid of permissionIds) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [role.id, pid]
        )
      }
    }

    await client.query('COMMIT')
    await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'role_create', 'role', String(role.id), { name: role.name }, req.ip)
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
      for (const pid of permissionIds) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, pid]
        )
      }
    }

    await client.query('COMMIT')
    await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'role_update', 'role', id, { name: name || existing.rows[0].name }, req.ip)
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
  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'role_delete', 'role', id, { name: existing.rows[0].name }, req.ip)
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
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 50 } }
 *     responses:
 *       200:
 *         description: Список пользователей
 */
router.get('/users', asyncHandler(async (req, res) => {
  const { search, role, department, status, page = '1', limit = '50' } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)

  const conditions = []
  const values = []
  let paramIdx = 1

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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countResult = await query(`SELECT COUNT(*) as total FROM users u ${where}`, values)
  const total = parseInt(countResult.rows[0].total)

  const usersResult = await query(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.middle_name, u.position,
      u.status, u.role, u.department_id, u.hire_date, u.phone, u.avatar,
      u.manager_id, u.responsibility_area, u.office, u.cabinet, u.created_at,
      d.name as department_name,
      m.first_name as manager_first_name, m.last_name as manager_last_name
    FROM users u
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
    { oldRole, newRole: role.trim(), userName: `${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}` }, req.ip)
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

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'user_status_change', 'user', id,
    { oldStatus, newStatus: status, userName: `${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}` }, req.ip)
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

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'user_password_reset', 'user', id,
    { userName: `${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}` }, req.ip)
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

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'user_update', 'user', id, { updatedFields: updates.map(u => u.split(' = ')[0]) }, req.ip)
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
  const result = await query('SELECT key, value, description, updated_at FROM system_settings ORDER BY key')
  res.json(result.rows)
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

  for (const s of settings) {
    if (!s.key || s.value === undefined) continue
    await query(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [s.key, String(s.value)]
    )
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'settings_update', 'system', null, { count: settings.length }, req.ip)
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
      a.details, a.ip_address, a.created_at
    FROM audit_log a
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
  const [users, roles, departments, auditToday, activeUsers] = await Promise.all([
    query('SELECT COUNT(*) as count FROM users'),
    query('SELECT COUNT(*) as count FROM roles'),
    query('SELECT COUNT(*) as count FROM departments'),
    query(`SELECT COUNT(*) as count FROM audit_log WHERE created_at >= CURRENT_DATE`),
    query(`SELECT COUNT(*) as count FROM users WHERE status = 'active'`),
  ])

  const roleDistribution = await query(`
    SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY count DESC
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

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'bulk_status_change', 'user', null,
    { count: result.rowCount, status }, req.ip)
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
    { count: result.rowCount, role: role.trim() }, req.ip)
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

// ===================== ANALYTICS =====================

/**
 * @swagger
 * /admin/analytics/activity:
 *   get:
 *     tags: [Admin]
 *     summary: Данные для графиков активности
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: days, in: query, schema: { type: integer, default: 30 } }
 *     responses:
 *       200:
 *         description: Данные аналитики
 */
router.get('/analytics/activity', asyncHandler(async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 365)

  const activityByDay = await query(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM audit_log
    WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
    GROUP BY DATE(created_at)
    ORDER BY date
  `, [days])

  const activityByType = await query(`
    SELECT action, COUNT(*) as count
    FROM audit_log
    WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
    GROUP BY action
    ORDER BY count DESC
  `, [days])

  const topUsers = await query(`
    SELECT user_name, COUNT(*) as count
    FROM audit_log
    WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval AND user_id IS NOT NULL
    GROUP BY user_id, user_name
    ORDER BY count DESC
    LIMIT 10
  `, [days])

  const loginStats = await query(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM audit_log
    WHERE action = 'login' AND created_at >= CURRENT_DATE - ($1 || ' days')::interval
    GROUP BY DATE(created_at)
    ORDER BY date
  `, [days]).catch(() => ({ rows: [] }))

  const newUsersByMonth = await query(`
    SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) as count
    FROM users
    WHERE created_at >= CURRENT_DATE - '12 months'::interval
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month
  `)

  const vacationByMonth = await query(`
    SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) as count
    FROM vacation_requests
    WHERE created_at >= CURRENT_DATE - '12 months'::interval
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month
  `)

  const departmentSize = await query(`
    SELECT d.name, COUNT(u.id) as count
    FROM departments d
    LEFT JOIN users u ON u.department_id = d.id AND u.status = 'active'
    GROUP BY d.id, d.name
    ORDER BY count DESC
    LIMIT 15
  `)

  res.json({
    activityByDay: activityByDay.rows,
    activityByType: activityByType.rows,
    topUsers: topUsers.rows,
    loginStats: loginStats.rows,
    newUsersByMonth: newUsersByMonth.rows,
    vacationByMonth: vacationByMonth.rows,
    departmentSize: departmentSize.rows,
  })
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
 *         description: Метрики системы
 */
router.get('/health', asyncHandler(async (req, res) => {
  const dbVersion = await query('SELECT version() as v')
  const dbSize = await query("SELECT pg_database_size(current_database()) as size")
  const tableStats = await query(`
    SELECT relname as table, n_live_tup as rows, pg_size_pretty(pg_total_relation_size(relid)) as size
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 20
  `)
  const activeConns = await query(`
    SELECT state, COUNT(*) as count FROM pg_stat_activity WHERE datname = current_database() GROUP BY state
  `)
  const uptime = process.uptime()
  const memUsage = process.memoryUsage()

  res.json({
    database: {
      version: dbVersion.rows[0]?.v?.split(' ').slice(0, 2).join(' ') || 'unknown',
      size: dbSize.rows[0]?.size || 0,
      sizeFormatted: formatBytes(dbSize.rows[0]?.size || 0),
      connections: activeConns.rows,
      tables: tableStats.rows,
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
 *         description: Лог ошибок
 */
router.get('/error-log', asyncHandler(async (req, res) => {
  const { page = '1', limit = '50' } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)

  const countResult = await query(`SELECT COUNT(*) as total FROM error_log`)
  const total = parseInt(countResult.rows[0].total)

  const result = await query(`
    SELECT id, message, stack, path, method, status_code, user_id, user_email, ip, created_at
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
  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'account_unlock', 'user', id, {}, req.ip)
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

  const projects = await query(`
    SELECT cp.id, cp.name, cp.status,
      COUNT(cpm.id) as member_count,
      COALESCE(json_agg(json_build_object('id', u.id, 'name', u.first_name || ' ' || u.last_name, 'role', cpm.role))
        FILTER (WHERE u.id IS NOT NULL), '[]') as members
    FROM company_projects cp
    LEFT JOIN company_project_members cpm ON cpm.project_id = cp.id
    LEFT JOIN users u ON cpm.user_id = u.id AND u.status = 'active'
    GROUP BY cp.id
    ORDER BY member_count DESC, cp.name
  `)

  const summary = await query(`
    SELECT COUNT(DISTINCT cp.id) as total_projects,
      COUNT(DISTINCT CASE WHEN cp.status = 'active' THEN cp.id END) as active_projects,
      COUNT(DISTINCT cpm.user_id) as total_assigned,
      COUNT(DISTINCT CASE WHEN cp.status = 'active' THEN cpm.user_id END) as active_assigned
    FROM company_projects cp
    LEFT JOIN company_project_members cpm ON cpm.project_id = cp.id
    LEFT JOIN users u ON cpm.user_id = u.id AND u.status = 'active'
  `)

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

  const result = await query(`
    SELECT u.id, u.first_name, u.last_name, u.middle_name, u.position, d.name as department,
      COALESCE(vb.total_days, 28) as total_days,
      COALESCE(vb.used_days, 0) as used_days,
      COALESCE(vb.available_days, 28) as available_days,
      COALESCE(vb.reserved_days, 0) as reserved_days,
      (SELECT COUNT(*) FROM vacation_requests vr WHERE vr.user_id = u.id AND EXTRACT(YEAR FROM vr.created_at) = $1) as request_count
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
  const [positions, vacationTypes, skills] = await Promise.all([
    query('SELECT DISTINCT position as name, COUNT(*) as count FROM users GROUP BY position ORDER BY position'),
    query('SELECT id, code, name FROM vacation_types ORDER BY name'),
    query('SELECT id, name FROM skills_dictionary ORDER BY name'),
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
  const result = await query(
    `INSERT INTO skills_dictionary (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *`,
    [name.trim()]
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
  await query('DELETE FROM skills_dictionary WHERE id = $1', [req.params.id])
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
  const result = await query('SELECT * FROM modules ORDER BY sort_order')
  res.json(result.rows)
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
    `INSERT INTO modules (code, name, description, icon, route, category, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [code.trim(), name.trim(), description || null, icon || null, route || null, category || 'general', sort_order || 0]
  )

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_create', 'module', String(result.rows[0].id),
    { code: code.trim(), name: name.trim() }, req.ip)

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
router.put('/modules/:id', asyncHandler(async (req, res) => {
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
    { code: existing.rows[0].code, updatedFields: Object.keys(req.body) }, req.ip)

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
router.delete('/modules/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const existing = await query('SELECT * FROM modules WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Модуль не найден')

  await query('DELETE FROM modules WHERE id = $1', [id])

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_delete', 'module', id,
    { code: existing.rows[0].code, name: existing.rows[0].name }, req.ip)

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
 */
router.put('/modules/:id/toggle', asyncHandler(async (req, res) => {
  const { id } = req.params
  const existing = await query('SELECT * FROM modules WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Модуль не найден')

  const newStatus = !existing.rows[0].is_enabled
  await query('UPDATE modules SET is_enabled = $1, updated_at = NOW() WHERE id = $2', [newStatus, id])

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_toggle', 'module', id,
    { module: existing.rows[0].code, name: existing.rows[0].name, enabled: newStatus }, req.ip)
  res.json({ success: true, enabled: newStatus })
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
  const result = await query('SELECT settings FROM modules WHERE code = $1', [req.params.id])
  if (result.rows.length === 0) throw new NotFoundError('Модуль не найден')
  res.json(result.rows[0].settings || {})
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
 *         description: Настройки обновлены
 *       404:
 *         description: Модуль не найден
 */
router.patch('/modules/:id/settings', asyncHandler(async (req, res) => {
  const { id } = req.params
  const existing = await query('SELECT id FROM modules WHERE code = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Модуль не найден')

  const result = await query(
    'UPDATE modules SET settings = $1, updated_at = NOW() WHERE code = $2 RETURNING settings',
    [JSON.stringify(req.body), id]
  )

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'module_settings_update', 'module', String(existing.rows[0].id), req.body, req.ip)

  res.json(result.rows[0].settings)
}))

router.post('/assistant/hermes-config', asyncHandler(async (req, res) => {
  const keys = [
    'assistant_hermes_provider', 'assistant_hermes_model', 'assistant_hermes_provider_api_key',
    'assistant_hermes_provider_base_url', 'assistant_hermes_toolsets', 'assistant_hermes_approvals',
    'assistant_hermes_max_turns', 'assistant_hermes_port', 'assistant_hermes_api_key',
    'assistant_search_backend', 'assistant_searxng_url',
  ]
  const result = await query(
    `SELECT key, value FROM system_settings WHERE key = ANY($1)`, [keys]
  )
  const map = Object.fromEntries(result.rows.map(r => [r.key, r.value]))

  const provider = map.assistant_hermes_provider || 'zai'
  const model = map.assistant_hermes_model || 'glm-5.1'
  const apiKey = map.assistant_hermes_provider_api_key || ''
  const baseUrl = map.assistant_hermes_provider_base_url || ''
  const toolsets = (map.assistant_hermes_toolsets || 'web,terminal,file,browser').split(',').map(t => t.trim()).filter(Boolean)
  const approvals = map.assistant_hermes_approvals || 'manual'
  const maxTurns = parseInt(map.assistant_hermes_max_turns) || 150
  const searchBackend = map.assistant_search_backend || 'searxng'
  const searxngUrl = map.assistant_searxng_url || 'http://localhost:8080'

  const envVars = {}
  const providerEnvMap = {
    openrouter: 'OPENROUTER_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    xai: 'XAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    zai: 'GLM_API_KEY',
  }
  const envKey = providerEnvMap[provider] || `${provider.toUpperCase()}_API_KEY`
  if (apiKey) envVars[envKey] = apiKey
  if (provider === 'zai' && baseUrl) {
    envVars.GLM_BASE_URL = baseUrl
  } else if (baseUrl) {
    envVars[`${provider.toUpperCase()}_BASE_URL`] = baseUrl
  }
  if (searchBackend === 'searxng' && searxngUrl) {
    envVars.SEARXNG_URL = searxngUrl
  }

  const config = {
    model: {
      default: model,
      provider,
      ...(baseUrl ? { base_url: baseUrl } : {}),
    },
    toolsets,
    agent: {
      max_turns: maxTurns,
      tool_use_enforcement: 'auto',
    },
    approvals: { mode: approvals },
    terminal: { backend: 'local', timeout: 180 },
    compression: { enabled: true, threshold: 0.5, target_ratio: 0.2 },
    security: { redact_secrets: true },
    web: { search_backend: searchBackend },
  }

  const hermesHome = process.env.HOME + '/.hermes'
  const fs = await import('fs')
  const path = await import('path')
  const yaml = await import('js-yaml')

  const configPath = path.join(hermesHome, 'config.yaml')
  const existingConfig = fs.existsSync(configPath)
    ? yaml.load(fs.readFileSync(configPath, 'utf8')) || {}
    : {}
  const mergedConfig = { ...existingConfig, ...config }
  fs.writeFileSync(configPath, yaml.dump(mergedConfig, { lineWidth: -1 }))

  const envPath = path.join(hermesHome, '.env')
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  for (const [key, val] of Object.entries(envVars)) {
    const escaped = val.replace(/"/g, '\\"')
    const regex = new RegExp(`^${key}=.*$`, 'm')
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${escaped}`)
    } else {
      envContent += `\n${key}=${escaped}`
    }
  }
  envContent = envContent.trim() + '\n'
  fs.writeFileSync(envPath, envContent)

  const { execSync } = await import('child_process')
  try {
    execSync('docker restart worker-cabinet-hermes', { timeout: 30000 })
  } catch (e) {
    return res.json({ success: true, restarted: false, warning: 'Контейнер не найден или не перезапущен' })
  }

  await logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
    'hermes_config_update', 'system', null, { provider, model, toolsets }, req.ip)

  res.json({ success: true, restarted: true })
}))

export default router
