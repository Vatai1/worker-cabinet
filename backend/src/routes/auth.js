import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { validateLogin, validateRegister, sanitizeInput } from '../middleware/validation.js'
import { asyncHandler, ValidationError, UnauthorizedError } from '../middleware/errors.js'

const router = express.Router()

router.use(sanitizeInput)

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Регистрация нового пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email: { type: string, format: email, example: user@example.com }
 *               password: { type: string, format: password, example: password123 }
 *               firstName: { type: string, example: Иван }
 *               lastName: { type: string, example: Иванов }
 *               middleName: { type: string, example: Петрович }
 *               position: { type: string }
 *               departmentId: { type: integer }
 *               phone: { type: string }
 *               birthDate: { type: string, format: date }
 *               hireDate: { type: string, format: date }
 *               role: { type: string, enum: [employee, manager, hr, admin], default: employee }
 *     responses:
 *       201:
 *         description: Пользователь зарегистрирован
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Ошибка валидации
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Email уже зарегистрирован
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/register', authLimiter, validateRegister, asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate, role } = req.body

  const existingUser = await query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  )

  if (existingUser.rows.length > 0) {
    throw new ValidationError('Email уже зарегистрирован')
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const result = await query(
    `INSERT INTO users 
     (email, password_hash, first_name, last_name, middle_name, position, department_id, phone, birth_date, hire_date, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, email, first_name, last_name, middle_name, position, department_id, role, created_at`,
    [email, passwordHash, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate, role || 'employee']
  )

  const user = result.rows[0]

  await query(
    'INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)',
    [user.id]
  )

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  res.status(201)
    .cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    })
    .json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        middleName: user.middle_name,
        position: user.position,
        departmentId: user.department_id,
        role: user.role,
      },
    })
}))

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Авторизация пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginRequest' }
 *     responses:
 *       200:
 *         description: Успешная авторизация
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LoginResponse' }
 *       401:
 *         description: 'Неверные учётные данные или аккаунт заблокирован (5+ неудачных попыток → 30 мин блокировка)'
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429:
 *         description: Слишком много попыток (rate limit)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', authLimiter, validateLogin, asyncHandler(async (req, res) => {
  const { email, password } = req.body
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip

  const result = await query(
    `SELECT u.*, d.name as department_name, d.manager_id as department_manager_id
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.email = $1`,
    [email]
  )

  if (result.rows.length === 0) {
    await query(`INSERT INTO failed_login_attempts (email, ip_address) VALUES ($1, $2)`, [email, ip]).catch(() => {})
    throw new UnauthorizedError('Неверный email или пароль')
  }

  const user = result.rows[0]

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new UnauthorizedError('Аккаунт временно заблокирован. Обратитесь к администратору.')
  }

  const validPassword = await bcrypt.compare(password, user.password_hash)

  if (!validPassword) {
    const newCount = (user.failed_login_count || 0) + 1
    const lockThreshold = 5
    if (newCount >= lockThreshold) {
      await query(
        `UPDATE users SET failed_login_count = $1, locked_until = NOW() + interval '30 minutes' WHERE id = $2`,
        [newCount, user.id]
      )
    } else {
      await query(`UPDATE users SET failed_login_count = $1 WHERE id = $2`, [newCount, user.id])
    }
    await query(`INSERT INTO failed_login_attempts (email, ip_address) VALUES ($1, $2)`, [email, ip]).catch(() => {})
    throw new UnauthorizedError('Неверный email или пароль')
  }

  if (user.failed_login_count > 0 || user.locked_until) {
    await query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [user.id])
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  await query(
    `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, ip_address) VALUES ($1, $2, 'login', 'user', $3, $4)`,
    [user.id, `${user.first_name} ${user.last_name}`, String(user.id), ip]
  ).catch(() => {})

  let subordinates = []
  if (user.role === 'manager' || user.role === 'hr' || user.role === 'admin') {
    const subordinatesResult = await query(
      'SELECT id FROM users WHERE manager_id = $1',
      [user.id]
    )
    subordinates = subordinatesResult.rows.map(row => row.id)
  }

  res
    .cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    })
    .json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        middleName: user.middle_name,
        position: user.position,
        department: user.department_name,
        departmentId: user.department_id,
        phone: user.phone,
        birthDate: user.birth_date,
        hireDate: user.hire_date,
        status: user.status,
        role: user.role,
        managerId: user.manager_id,
        subordinates,
        avatar: user.avatar,
      },
    })
}))

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Получить данные текущего пользователя
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные пользователя
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Не авторизован
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    throw new UnauthorizedError('Требуется токен авторизации')
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET)

  const result = await query(
    `SELECT u.*, d.name as department_name
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.id = $1`,
    [decoded.id]
  )

  if (result.rows.length === 0) {
    throw new UnauthorizedError('Пользователь не найден')
  }

  const user = result.rows[0]

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    middleName: user.middle_name,
    position: user.position,
    department: user.department_name,
    departmentId: user.department_id,
    phone: user.phone,
    birthDate: user.birth_date,
    hireDate: user.hire_date,
    status: user.status,
    role: user.role,
    managerId: user.manager_id,
    avatar: user.avatar,
  })
}))

export default router
