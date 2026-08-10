import { Router } from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles, authorizeGlobalRoles } from '../middleware/auth.js'
import { asyncHandler, ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../middleware/errors.js'

const router = Router()

const VALID_ORG_ROLES = ['employee', 'manager', 'hr', 'admin']

async function checkOrgAccess(req, orgId) {
  if (req.user.role === 'superadmin') return true
  const result = await query(
    'SELECT 1 FROM user_organizations WHERE user_id = $1 AND org_id = $2 AND is_active = true',
    [req.user.id, orgId]
  )
  return result.rows.length > 0
}

async function checkOrgAdmin(req, orgId) {
  if (req.user.role === 'superadmin') return true
  if (req.user.role === 'admin') return true
  const result = await query(
    "SELECT 1 FROM user_organizations WHERE user_id = $1 AND org_id = $2 AND org_role = 'admin' AND is_active = true",
    [req.user.id, orgId]
  )
  return result.rows.length > 0
}

/**
 * @swagger
 * /organizations:
 *   get:
 *     tags: [Organizations]
 *     summary: Список организаций текущего пользователя
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Массив организаций
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Organization' }
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  if (req.user.role === 'superadmin' && !req.org) {
    const result = await query(`
      SELECT o.id, o.name, o.slug, o.inn, o.address, o.logo_s3_key, o.settings,
             o.is_active, o.created_at,
             (SELECT COUNT(*) FROM user_organizations WHERE org_id = o.id AND is_active = true) as member_count
      FROM organizations o
      WHERE o.is_active = true
      ORDER BY o.name
    `)
    return res.json(result.rows)
  }

  const result = await query(`
    SELECT o.id, o.name, o.slug, o.inn, o.address, o.logo_s3_key, o.settings,
           o.is_active, uo.org_role, uo.is_active as membership_active
    FROM user_organizations uo
    JOIN organizations o ON uo.org_id = o.id
    WHERE uo.user_id = $1 AND uo.is_active = true AND o.is_active = true
    ORDER BY o.name
  `, [req.user.id])
  res.json(result.rows)
}))

/**
 * @swagger
 * /organizations/current:
 *   get:
 *     tags: [Organizations]
 *     summary: Текущая активная организация
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Текущая организация или null
 */
router.get('/current', authenticateToken, asyncHandler(async (req, res) => {
  if (!req.org) {
    return res.json({ org_id: null, name: null, slug: null, org_role: null })
  }
  res.json(req.org)
}))

/**
 * @swagger
 * /organizations:
 *   post:
 *     tags: [Organizations]
 *     summary: Создать организацию (superadmin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name: { type: string }
 *               slug: { type: string, description: 'Уникальный, [a-z0-9-]' }
 *               inn: { type: string }
 *               address: { type: string }
 *     responses:
 *       201:
 *         description: Созданная организация
 *       403:
 *         description: Нет прав
 */
router.post('/', authenticateToken, authorizeGlobalRoles('superadmin'), asyncHandler(async (req, res) => {
  const { name, slug, inn, address } = req.body

  if (!name?.trim()) throw new ValidationError('Название обязательно')
  if (!slug?.trim()) throw new ValidationError('Slug обязателен')

  const cleanSlug = slug.trim().toLowerCase()
  if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
    throw new ValidationError('Slug может содержать только строчные буквы, цифры и дефисы')
  }

  const existing = await query('SELECT 1 FROM organizations WHERE slug = $1', [cleanSlug])
  if (existing.rows.length > 0) throw new ConflictError('Организация с таким slug уже существует')

  const result = await query(
    `INSERT INTO organizations (name, slug, inn, address, is_active)
     VALUES ($1, $2, $3, $4, true) RETURNING *`,
    [name.trim(), cleanSlug, inn?.trim() || null, address?.trim() || null]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /organizations/{id}:
 *   put:
 *     tags: [Organizations]
 *     summary: Обновить организацию
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
 *             properties:
 *               name: { type: string }
 *               inn: { type: string }
 *               address: { type: string }
 *               logo_s3_key: { type: string }
 *               settings: { type: object }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Обновлённая организация
 *       403:
 *         description: Нет прав
 *       404:
 *         description: Организация не найдена
 */
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.id)
  const { name, inn, address, logo_s3_key, settings, is_active } = req.body

  const orgResult = await query('SELECT * FROM organizations WHERE id = $1', [orgId])
  if (orgResult.rows.length === 0) throw new NotFoundError('Организация не найдена')

  const isSuperadmin = req.user.role === 'superadmin'
  const isOrgAdmin = await checkOrgAdmin(req, orgId)
  if (!isSuperadmin && !isOrgAdmin) throw new ForbiddenError()

  const updates = []
  const values = []
  let paramIndex = 1

  if (name?.trim()) { updates.push(`name = $${paramIndex++}`); values.push(name.trim()) }
  if (inn !== undefined) { updates.push(`inn = $${paramIndex++}`); values.push(inn?.trim() || null) }
  if (address !== undefined) { updates.push(`address = $${paramIndex++}`); values.push(address?.trim() || null) }
  if (logo_s3_key !== undefined) { updates.push(`logo_s3_key = $${paramIndex++}`); values.push(logo_s3_key) }
  if (settings !== undefined) { updates.push(`settings = $${paramIndex++}`); values.push(JSON.stringify(settings)) }
  if (is_active !== undefined && isSuperadmin) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active) }

  if (updates.length === 0) {
    return res.json(orgResult.rows[0])
  }

  values.push(orgId)
  const result = await query(
    `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /organizations/{id}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Деактивировать организацию (superadmin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Организация деактивирована
 *       403:
 *         description: Нет прав
 */
router.delete('/:id', authenticateToken, authorizeGlobalRoles('superadmin'), asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.id)

  const result = await query(
    'UPDATE organizations SET is_active = false WHERE id = $1 RETURNING id',
    [orgId]
  )
  if (result.rows.length === 0) throw new NotFoundError('Организация не найдена')

  res.json({ ok: true })
}))

/**
 * @swagger
 * /organizations/{id}/members:
 *   get:
 *     tags: [Organizations]
 *     summary: Список участников организации
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Массив участников
 *       403:
 *         description: Нет доступа к организации
 */
router.get('/:id/members', authenticateToken, asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.id)

  if (!(await checkOrgAccess(req, orgId))) throw new ForbiddenError()

  const result = await query(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.middle_name,
           u.position, u.avatar, uo.org_role, uo.department_id,
           d.name as department_name, uo.is_active
    FROM user_organizations uo
    JOIN users u ON uo.user_id = u.id
    LEFT JOIN departments d ON uo.department_id = d.id
    WHERE uo.org_id = $1
    ORDER BY u.last_name, u.first_name
  `, [orgId])
  res.json(result.rows)
}))

/**
 * @swagger
 * /organizations/{id}/members:
 *   post:
 *     tags: [Organizations]
 *     summary: Добавить участника в организацию
 *     description: 'Доступно для ролей: admin, hr'
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
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *               org_role: { type: string, enum: [employee, manager, hr, admin] }
 *               department_id: { type: integer }
 *     responses:
 *       201:
 *         description: Участник добавлен
 *       404:
 *         description: Пользователь не найден
 *       409:
 *         description: Уже состоит в организации
 */
router.post('/:id/members', authenticateToken, authorizeRoles('admin', 'hr'), asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.id)
  const { email, org_role, department_id } = req.body

  if (!email?.trim()) throw new ValidationError('Email обязателен')
  if (org_role && !VALID_ORG_ROLES.includes(org_role)) {
    throw new ValidationError('Недопустимая роль')
  }

  const userResult = await query('SELECT id FROM users WHERE email = $1', [email.trim()])
  if (userResult.rows.length === 0) throw new NotFoundError('Пользователь не найден')

  const userId = userResult.rows[0].id

  const existing = await query(
    'SELECT 1 FROM user_organizations WHERE user_id = $1 AND org_id = $2',
    [userId, orgId]
  )
  if (existing.rows.length > 0) throw new ConflictError('Пользователь уже состоит в организации')

  const result = await query(
    `INSERT INTO user_organizations (user_id, org_id, org_role, department_id, is_active)
     VALUES ($1, $2, $3, $4, true) RETURNING *`,
    [userId, orgId, org_role || 'employee', department_id || null]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /organizations/{id}/members/{userId}:
 *   put:
 *     tags: [Organizations]
 *     summary: Изменить роль участника
 *     description: 'Доступно для ролей: admin, hr'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [org_role]
 *             properties:
 *               org_role: { type: string, enum: [employee, manager, hr, admin] }
 *               department_id: { type: integer }
 *     responses:
 *       200:
 *         description: Роль обновлена
 *       404:
 *         description: Участник не найден
 *       409:
 *         description: Нельзя удалить последнего администратора
 */
router.put('/:id/members/:userId', authenticateToken, authorizeRoles('admin', 'hr'), asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.id)
  const userId = parseInt(req.params.userId)
  const { org_role, department_id } = req.body

  if (!org_role || !VALID_ORG_ROLES.includes(org_role)) {
    throw new ValidationError('Недопустимая роль')
  }

  const memberResult = await query(
    'SELECT * FROM user_organizations WHERE user_id = $1 AND org_id = $2',
    [userId, orgId]
  )
  if (memberResult.rows.length === 0) throw new NotFoundError('Участник не найден')

  if (memberResult.rows[0].org_role === 'admin' && org_role !== 'admin') {
    const adminCount = await query(
      "SELECT COUNT(*) as cnt FROM user_organizations WHERE org_id = $1 AND org_role = 'admin' AND is_active = true",
      [orgId]
    )
    if (parseInt(adminCount.rows[0].cnt) <= 1) {
      throw new ConflictError('Нельзя удалить последнего администратора организации')
    }
  }

  const updates = ['org_role = $1']
  const values = [org_role]
  let paramIndex = 2

  if (department_id !== undefined) {
    updates.push(`department_id = $${paramIndex++}`)
    values.push(department_id)
  }

  values.push(userId, orgId)
  const result = await query(
    `UPDATE user_organizations SET ${updates.join(', ')} WHERE user_id = $${paramIndex++} AND org_id = $${paramIndex} RETURNING *`,
    values
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /organizations/{id}/members/{userId}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Удалить участника из организации
 *     description: 'Доступно для ролей: admin, hr'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Участник удалён
 *       404:
 *         description: Участник не найден
 *       409:
 *         description: Нельзя удалить последнего администратора
 */
router.delete('/:id/members/:userId', authenticateToken, authorizeRoles('admin', 'hr'), asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.id)
  const userId = parseInt(req.params.userId)

  const memberResult = await query(
    'SELECT * FROM user_organizations WHERE user_id = $1 AND org_id = $2',
    [userId, orgId]
  )
  if (memberResult.rows.length === 0) throw new NotFoundError('Участник не найден')

  if (memberResult.rows[0].org_role === 'admin') {
    const adminCount = await query(
      "SELECT COUNT(*) as cnt FROM user_organizations WHERE org_id = $1 AND org_role = 'admin' AND is_active = true",
      [orgId]
    )
    if (parseInt(adminCount.rows[0].cnt) <= 1) {
      throw new ConflictError('Нельзя удалить последнего администратора организации')
    }
  }

  await query('DELETE FROM user_organizations WHERE user_id = $1 AND org_id = $2', [userId, orgId])
  res.json({ ok: true })
}))

export default router
