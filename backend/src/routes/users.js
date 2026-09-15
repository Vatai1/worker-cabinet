import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { uploadAvatar } from '../middleware/upload.js'
import { uploadToS3, getS3FileUrl, deleteFromS3, S3_ENDPOINT, S3_BUCKET, S3_PUBLIC_URL } from '../config/s3.js'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'
import { excludeTest } from '../utils/testScope.js'

const router = express.Router()

async function checkProfileAccess(req, targetId) {
  const currentUser = req.user
  if (currentUser.id === targetId || currentUser.role === 'superadmin') return true
  if (!req.org) return true
  const membership = await query(
    'SELECT 1 FROM user_organizations WHERE user_id = $1 AND org_id = $2 AND is_active = true',
    [targetId, req.org.org_id]
  )
  return membership.rows.length > 0
}

function s3KeyFromAvatarUrl(url) {
  if (!url) return null
  const prefixes = S3_PUBLIC_URL
    ? [`${S3_PUBLIC_URL}/${S3_BUCKET}/`, `${S3_ENDPOINT}/${S3_BUCKET}/`]
    : [`${S3_ENDPOINT}/${S3_BUCKET}/`]
  const prefix = prefixes.find((p) => url.startsWith(p))
  if (!prefix) return null
  try {
    return decodeURIComponent(url.slice(prefix.length))
  } catch {
    return null
  }
}

// Get all unique skills
/**
 * @swagger
 * /users/skills/all:
 *   get:
 *     tags: [Users]
 *     summary: Получить все навыки (справочник)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список навыков
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 */
router.get('/skills/all', authenticateToken, async (req, res) => {
  try {
    const skillsQuery = orgScopedQuery('SELECT id, name FROM skills_dictionary ORDER BY name', [], req)
    const result = await query(skillsQuery.text, skillsQuery.values)
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching all skills:', error)
    res.status(500).json({ error: 'Failed to fetch skills' })
  }
})

// Get all unique positions
/**
 * @swagger
 * /users/positions/all:
 *   get:
 *     tags: [Users]
 *     summary: Получить все должности
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список должностей
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { type: string }
 */
router.get('/positions/all', authenticateToken, async (req, res) => {
  try {
    let sql = 'SELECT DISTINCT position FROM users'
    const params = []
    let joinClause = ''
    let whereClause = ' WHERE position IS NOT NULL'
    if (req.org) {
      joinClause = ' JOIN user_organizations uo ON users.id = uo.user_id'
      whereClause = ` WHERE position IS NOT NULL AND uo.org_id = $${params.length + 1}`
      params.push(currentOrgId(req))
    }
    sql += joinClause + whereClause + ' ORDER BY position'
    const result = await query(sql, params)
    res.json(result.rows.map(r => r.position))
  } catch (error) {
    console.error('Error fetching all positions:', error)
    res.status(500).json({ error: 'Failed to fetch positions' })
  }
})

// Search users (for adding members to projects - no role restriction)
/**
 * @swagger
 * /users/search:
 *   get:
 *     tags: [Users]
 *     summary: Поиск пользователей
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema: { type: integer }
 *         description: Фильтр по отделу
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Поисковый запрос (ФИО, email)
 *     responses:
 *       200:
 *         description: Список пользователей
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/User' }
 */
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { departmentId, q } = req.query
    
    const params = []
    const orgJoin = req.org ? 'JOIN user_organizations uo ON u.id = uo.user_id' : ''
    let orgWhere = ''
    if (req.org) {
      orgWhere = ` AND uo.org_id = $${params.length + 1}`
      params.push(currentOrgId(req))
    }

    let sql = `
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.department_id,
        d.name as department_name,
        u.phone,
        u.hire_date,
        u.status,
        u.role,
        u.manager_id,
        u.avatar,
        u.office,
        u.cabinet,
        m.last_name || ' ' || m.first_name || COALESCE(' ' || NULLIF(m.middle_name, ''), '') as manager_name
      FROM users u
      ${orgJoin}
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE 1=1${orgWhere} ${excludeTest(req, "u")}
    `
    
    if (departmentId) {
      sql += ' AND u.department_id = $' + (params.length + 1)
      params.push(departmentId)
    }
    
    if (q) {
      sql += ` AND (u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1} OR u.position ILIKE $${params.length + 1})`
      params.push(`%${q}%`)
    }
    
    sql += ' ORDER BY u.last_name, u.first_name'
    
    const result = await query(sql, params)
    res.json(result.rows)
  } catch (error) {
    console.error('Error searching users:', error)
    res.status(500).json({ error: 'Failed to search users' })
  }
})

// Get all users (for managers/hr/employees)
/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Получить список всех сотрудников
 *     description: 'Доступно для ролей: employee, manager, hr, admin'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema: { type: integer }
 *         description: Фильтр по отделу
 *     responses:
 *       200:
 *         description: Список сотрудников
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/User' }
 *       403:
 *         description: Доступ запрещён
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/', authenticateToken, authorizeRoles('employee', 'manager', 'hr', 'admin'), async (req, res) => {
  try {
    const { departmentId } = req.query
    
    const params = []
    const orgJoin = req.org ? 'JOIN user_organizations uo ON u.id = uo.user_id' : ''
    let orgWhere = ''
    if (req.org) {
      orgWhere = ` AND uo.org_id = $${params.length + 1}`
      params.push(currentOrgId(req))
    }

    let sql = `
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.department_id,
        d.name as department_name,
        u.phone,
        u.hire_date,
        u.status,
        u.role,
        u.manager_id,
        u.avatar,
        m.last_name || ' ' || m.first_name || COALESCE(' ' || NULLIF(m.middle_name, ''), '') as manager_name
      FROM users u
      ${orgJoin}
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE 1=1${orgWhere} ${excludeTest(req, "u")}
    `

    if (departmentId) {
      sql += ' AND u.department_id = $' + (params.length + 1)
      params.push(departmentId)
    }

    sql += ' ORDER BY u.last_name, u.first_name'

    const result = await query(sql, params)
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Upload current user avatar
/**
 * @swagger
 * /users/me/avatar:
 *   post:
 *     tags: [Users]
 *     summary: Загрузить аватар
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Аватар загружен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 avatar: { type: string }
 */
router.post('/me/avatar', authenticateToken, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' })
    }

    const userId = req.user.id
    const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg')
    const key = `avatars/${userId}/${Date.now()}.${ext}`

    await uploadToS3(req.file, key)
    const avatarUrl = getS3FileUrl(key)

    await query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, userId])

    res.json({ avatar: avatarUrl })
  } catch (error) {
    console.error('Error uploading avatar:', error)
    res.status(500).json({ error: 'Не удалось загрузить фото' })
  }
})

// Upload avatar for a user (HR/admin)
/**
 * @swagger
 * /users/{id}/avatar:
 *   post:
 *     tags: [Users]
 *     summary: Загрузить аватар сотруднику (HR/admin)
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Аватар загружен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 avatar: { type: string }
 *       400:
 *         description: Файл не загружен
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Пользователь не найден
 */
router.post('/:id/avatar', authenticateToken, authorizeRoles('hr', 'admin', 'superadmin'), uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' })
    }

    const userId = req.params.id
    const existing = await query('SELECT avatar FROM users WHERE id = $1', [userId])
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }

    const oldKey = s3KeyFromAvatarUrl(existing.rows[0].avatar)
    if (oldKey) {
      await deleteFromS3(oldKey).catch(() => {})
    }

    const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg')
    const key = `avatars/${userId}/${Date.now()}.${ext}`

    await uploadToS3(req.file, key)
    const avatarUrl = getS3FileUrl(key)

    await query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, userId])

    res.json({ avatar: avatarUrl })
  } catch (error) {
    console.error('Error uploading user avatar:', error)
    res.status(500).json({ error: 'Не удалось загрузить фото' })
  }
})

// Reset current user's avatar
/**
 * @swagger
 * /users/me/avatar:
 *   delete:
 *     tags: [Users]
 *     summary: Сбросить свой аватар
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Аватар сброшен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 avatar: { type: 'null' }
 */
router.delete('/me/avatar', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const existing = await query('SELECT avatar FROM users WHERE id = $1', [userId])
    const oldKey = s3KeyFromAvatarUrl(existing.rows[0]?.avatar)
    if (oldKey) {
      await deleteFromS3(oldKey).catch(() => {})
    }

    await query('UPDATE users SET avatar = NULL WHERE id = $1', [userId])

    res.json({ avatar: null })
  } catch (error) {
    console.error('Error resetting avatar:', error)
    res.status(500).json({ error: 'Не удалось сбросить аватар' })
  }
})

// Reset a user's avatar (HR/admin)
/**
 * @swagger
 * /users/{id}/avatar:
 *   delete:
 *     tags: [Users]
 *     summary: Сбросить аватар сотрудника (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Аватар сброшен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 avatar: { type: 'null' }
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Пользователь не найден
 */
router.delete('/:id/avatar', authenticateToken, authorizeRoles('hr', 'admin', 'superadmin'), async (req, res) => {
  try {
    const userId = req.params.id
    const existing = await query('SELECT avatar FROM users WHERE id = $1', [userId])
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }

    const oldKey = s3KeyFromAvatarUrl(existing.rows[0].avatar)
    if (oldKey) {
      await deleteFromS3(oldKey).catch(() => {})
    }

    await query('UPDATE users SET avatar = NULL WHERE id = $1', [userId])

    res.json({ avatar: null })
  } catch (error) {
    console.error('Error resetting user avatar:', error)
    res.status(500).json({ error: 'Не удалось сбросить аватар' })
  }
})

// Get user by id
/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Получить профиль пользователя
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Профиль пользователя
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/User'
 *                 - type: object
 *                   properties:
 *                     subordinates: { type: array, items: { $ref: '#/components/schemas/User' } }
 *                     skills: { type: array, items: { type: string } }
 *                     projects: { type: array, items: { $ref: '#/components/schemas/Project' } }
 *                     organizations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           name: { type: string }
 *                           org_role: { type: string }
 *                           department_name: { type: string }
 *                           is_primary: { type: boolean }
 *                           is_active: { type: boolean }
 *       403:
 *         description: Доступ запрещён (сотрудник видит только свой профиль)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Пользователь не найден
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const targetId = parseInt(id)

    if (!(await checkProfileAccess(req, targetId))) {
      return res.status(403).json({ error: 'Нет доступа к профилю этого сотрудника' })
    }

    const result = await query(
      `SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.department_id,
        d.name as department_name,
        uo.org_id as organization_id,
        o.name as organization_name,
        u.phone,
        u.birth_date,
        u.hire_date,
        u.status,
        u.role,
        u.manager_id,
        u.responsibility_area,
        u.avatar,
        u.office,
        u.cabinet,
        m.last_name || ' ' || m.first_name || COALESCE(' ' || NULLIF(m.middle_name, ''), '') as manager_name,
        vb.total_days,
        vb.used_days,
        vb.available_days,
        vb.reserved_days,
        vb.travel_available,
        vb.travel_next_available_date
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN user_organizations uo ON uo.user_id = u.id AND uo.is_active = true AND uo.is_primary = true
      LEFT JOIN organizations o ON uo.org_id = o.id
      LEFT JOIN users m ON u.manager_id = m.id
      LEFT JOIN vacation_balances vb ON vb.user_id = u.id
      WHERE u.id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]

    // Get subordinates if manager
    let subordinates = []
    if (user.role === 'manager' || user.role === 'hr' || user.role === 'admin') {
      const subordinatesResult = await query(
        'SELECT id, first_name, last_name FROM users WHERE manager_id = $1',
        [id]
      )
      subordinates = subordinatesResult.rows
    }

    // Get skills
    const skillsResult = await query(
      'SELECT sd.name FROM skills_dictionary sd JOIN user_skills us ON sd.id = us.skill_id WHERE us.user_id = $1 ORDER BY sd.name',
      [id]
    )
    const skills = skillsResult.rows.map(row => row.name)

    // Get projects from company_projects
    const projectsResult = await query(
      `SELECT
         p.id,
         p.name,
         p.full_name,
         p.status,
         p.start_date,
         p.end_date,
         m.role,
         m.description,
         m.joined_at
       FROM company_project_members m
       JOIN company_projects p ON m.project_id = p.id
       WHERE m.user_id = $1
       ORDER BY p.created_at DESC`,
      [id]
    )
    const projects = projectsResult.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      role: row.role,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      description: row.description,
      joined_at: row.joined_at,
    }))

    const orgsResult = await query(
      `SELECT
        uo.org_id as id,
        o.name,
        uo.org_role,
        d.name as department_name,
        uo.is_primary,
        uo.is_active
      FROM user_organizations uo
      JOIN organizations o ON uo.org_id = o.id
      LEFT JOIN departments d ON uo.department_id = d.id
      WHERE uo.user_id = $1 AND uo.is_active = true
      ORDER BY uo.is_primary DESC, o.name`,
      [id]
    )

    res.json({
      ...user,
      organizations: orgsResult.rows,
      subordinates,
      skills,
      projects,
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

/**
 * @swagger
 * /users/{id}/primary-org:
 *   patch:
 *     tags: [Users]
 *     summary: Изменить основную организацию сотрудника
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
 *             required: [orgId]
 *             properties:
 *               orgId: { type: integer }
 *     responses:
 *       200:
 *         description: Основная организация обновлена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *       400:
 *         description: orgId обязателен
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: 'Организация не найдена или не привязана к сотруднику'
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.patch('/:id/primary-org', authenticateToken, authorizeRoles('admin', 'hr'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    const orgId = parseInt(req.body.orgId)

    if (!orgId) {
      return res.status(400).json({ error: 'orgId обязателен' })
    }

    const membership = await query(
      'SELECT 1 FROM user_organizations WHERE user_id = $1 AND org_id = $2 AND is_active = true',
      [userId, orgId]
    )
    if (membership.rows.length === 0) {
      return res.status(404).json({ error: 'Организация не найдена или не привязана к сотруднику' })
    }

    await query(
      'UPDATE user_organizations SET is_primary = false WHERE user_id = $1 AND is_primary = true',
      [userId]
    )
    await query(
      'UPDATE user_organizations SET is_primary = true WHERE user_id = $1 AND org_id = $2 AND is_active = true',
      [userId, orgId]
    )

    res.json({ ok: true })
  } catch (error) {
    console.error('Error setting primary organization:', error)
    res.status(500).json({ error: 'Не удалось изменить основную организацию' })
  }
})

// Add skill to user
/**
 * @swagger
 * /users/{id}/skills:
 *   post:
 *     tags: [Users]
 *     summary: Добавить навык пользователю
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
 *             required: [skill]
 *             properties:
 *               skill: { type: string }
 *     responses:
 *       200:
 *         description: Навык добавлен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skills: { type: array, items: { type: string } }
 */
router.post('/:id/skills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { skill } = req.body

    if (!(await checkProfileAccess(req, parseInt(id)))) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (!skill || typeof skill !== 'string' || skill.trim().length === 0) {
      return res.status(400).json({ error: 'Skill name is required' })
    }

    const skillName = skill.trim()

    // Check if skill exists in dictionary, if not create it
    const skillLookupQuery = orgScopedQuery('SELECT id FROM skills_dictionary WHERE name = $1', [skillName], req)
    const skillResult = await query(skillLookupQuery.text, skillLookupQuery.values)

    let skillId
    if (skillResult.rows.length === 0) {
      const insertResult = await query(
        'INSERT INTO skills_dictionary (name, organization_id) VALUES ($1, $2) RETURNING id',
        [skillName, currentOrgId(req)]
      )
      skillId = insertResult.rows[0].id
    } else {
      skillId = skillResult.rows[0].id
    }

    // Link user to skill
    await query(
      'INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2) ON CONFLICT (user_id, skill_id) DO NOTHING',
      [id, skillId]
    )

    // Get updated skills list
    const skillsResult = await query(
      'SELECT sd.name FROM skills_dictionary sd JOIN user_skills us ON sd.id = us.skill_id WHERE us.user_id = $1 ORDER BY sd.name',
      [id]
    )
    const skills = skillsResult.rows.map(row => row.name)

    res.json({ skills })
  } catch (error) {
    console.error('Error adding skill:', error)
    res.status(500).json({ error: 'Failed to add skill' })
  }
})

// Remove skill from user
/**
 * @swagger
 * /users/{id}/skills:
 *   delete:
 *     tags: [Users]
 *     summary: Удалить навык у пользователя
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
 *             required: [skill]
 *             properties:
 *               skill: { type: string }
 *     responses:
 *       200:
 *         description: Навык удалён
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skills: { type: array, items: { type: string } }
 */
router.delete('/:id/skills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { skill } = req.body

    if (!(await checkProfileAccess(req, parseInt(id)))) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (!skill || typeof skill !== 'string' || skill.trim().length === 0) {
      return res.status(400).json({ error: 'Skill name is required' })
    }

    // Delete only the user-skill link, NOT the skill itself
    await query(
      'DELETE FROM user_skills WHERE user_id = $1 AND skill_id = (SELECT id FROM skills_dictionary WHERE name = $2)',
      [id, skill.trim()]
    )

    // Get updated skills list
    const skillsResult = await query(
      'SELECT sd.name FROM skills_dictionary sd JOIN user_skills us ON sd.id = us.skill_id WHERE us.user_id = $1 ORDER BY sd.name',
      [id]
    )
    const skills = skillsResult.rows.map(row => row.name)

    res.json({ skills })
  } catch (error) {
    console.error('Error removing skill:', error)
    res.status(500).json({ error: 'Failed to remove skill' })
  }
})

// Add project to user
/**
 * @swagger
 * /users/{id}/projects:
 *   post:
 *     tags: [Users]
 *     summary: Добавить проект в профиль
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
 *             required: [name, role]
 *             properties:
 *               name: { type: string }
 *               role: { type: string }
 *               status: { type: string }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Проект добавлен
 */
router.post('/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { name, role, status, startDate, endDate, description } = req.body

    if (!(await checkProfileAccess(req, parseInt(id)))) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' })
    }

    if (!role || typeof role !== 'string' || role.trim().length === 0) {
      return res.status(400).json({ error: 'Project role is required' })
    }

    const validStatuses = ['active', 'completed', 'paused']
    const projectStatus = status && validStatuses.includes(status) ? status : 'active'

    const result = await query(
      `INSERT INTO projects (user_id, name, role, status, start_date, end_date, description, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, role, status, start_date, end_date, description`,
      [
        id,
        name.trim(),
        role.trim(),
        projectStatus,
        startDate || null,
        endDate || null,
        description ? description.trim() : null,
        currentOrgId(req),
      ]
    )

    const project = result.rows[0]

    res.json({
      id: project.id.toString(),
      name: project.name,
      role: project.role,
      status: project.status,
      startDate: project.start_date,
      endDate: project.end_date,
      description: project.description,
    })
  } catch (error) {
    console.error('Error adding project:', error)
    res.status(500).json({ error: 'Failed to add project' })
  }
})

// Delete project
/**
 * @swagger
 * /users/{id}/projects/{projectId}:
 *   delete:
 *     tags: [Users]
 *     summary: Удалить проект из профиля
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Проект удалён
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 */
router.delete('/:id/projects/:projectId', authenticateToken, async (req, res) => {
  try {
    const { id, projectId } = req.params

    if (!(await checkProfileAccess(req, parseInt(id)))) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const deleteQuery = orgScopedQuery('DELETE FROM projects WHERE id = $1 AND user_id = $2', [projectId, id], req)
    await query(deleteQuery.text, deleteQuery.values)

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

// Update user profile
/**
 * @swagger
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Обновить профиль пользователя
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
 *             properties:
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               middle_name: { type: string }
 *               phone: { type: string }
 *               responsibility_area: { type: string }
 *               office: { type: string, description: 'Офис (адрес)' }
 *               cabinet: { type: string, description: 'Кабинет/рабочее место' }
 *     responses:
 *       200:
 *         description: Профиль обновлён
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *       403:
 *         description: Доступ запрещён
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { responsibility_area, phone, first_name, last_name, middle_name, office, cabinet } = req.body

    if (!(await checkProfileAccess(req, parseInt(id)))) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const updates = []
    const values = []
    let paramIndex = 1

    if (responsibility_area !== undefined && typeof responsibility_area === 'string') {
      updates.push(`responsibility_area = $${paramIndex++}`)
      values.push(responsibility_area.trim())
    }

    if (phone !== undefined && typeof phone === 'string') {
      updates.push(`phone = $${paramIndex++}`)
      values.push(phone.trim())
    }

    if (first_name !== undefined && typeof first_name === 'string' && first_name.trim()) {
      updates.push(`first_name = $${paramIndex++}`)
      values.push(first_name.trim())
    }

    if (last_name !== undefined && typeof last_name === 'string' && last_name.trim()) {
      updates.push(`last_name = $${paramIndex++}`)
      values.push(last_name.trim())
    }

    if (middle_name !== undefined && typeof middle_name === 'string') {
      updates.push(`middle_name = $${paramIndex++}`)
      values.push(middle_name.trim())
    }

    if (office !== undefined && typeof office === 'string') {
      updates.push(`office = $${paramIndex++}`)
      values.push(office.trim())
    }

    if (cabinet !== undefined && typeof cabinet === 'string') {
      updates.push(`cabinet = $${paramIndex++}`)
      values.push(cabinet.trim())
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    values.push(id)

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    )

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

export default router
