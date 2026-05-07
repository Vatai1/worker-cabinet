import express from 'express'
import bcrypt from 'bcryptjs'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler, ValidationError, ForbiddenError, NotFoundError } from '../middleware/errors.js'
import { query, getClient } from '../config/database.js'

const router = express.Router()

router.use(authenticateToken)
router.use(authorizeRoles('admin'))

async function logAudit(userId, userName, action, entityType, entityId, details, ipAddress) {
  let name = userName
  if (!name && userId) {
    const r = await query('SELECT first_name, last_name FROM users WHERE id = $1', [userId])
    if (r.rows.length > 0) name = `${r.rows[0].first_name} ${r.rows[0].last_name}`
  }
  await query(
    `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, name, action, entityType, entityId, details ? JSON.stringify(details) : null, ipAddress]
  ).catch(() => {})
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
    conditions.push(`u.department_id = $${paramIdx}`)
    values.push(parseInt(department))
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
      u.manager_id, u.responsibility_area, u.created_at,
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

  const allowedFields = ['first_name', 'last_name', 'middle_name', 'email', 'position', 'department_id', 'phone', 'manager_id', 'hire_date']
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

export default router
