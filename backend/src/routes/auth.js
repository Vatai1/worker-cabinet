import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { validateLogin, validateRegister, sanitizeInput } from '../middleware/validation.js'
import { asyncHandler, ValidationError, UnauthorizedError } from '../middleware/errors.js'

const router = express.Router()

router.use(sanitizeInput)

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

  res.status(201).json({
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

router.post('/login', authLimiter, validateLogin, asyncHandler(async (req, res) => {
  const { email, password } = req.body

  const result = await query(
    `SELECT u.*, d.name as department_name, d.manager_id as department_manager_id
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.email = $1`,
    [email]
  )

  if (result.rows.length === 0) {
    throw new UnauthorizedError('Неверный email или пароль')
  }

  const user = result.rows[0]

  const validPassword = await bcrypt.compare(password, user.password_hash)

  if (!validPassword) {
    throw new UnauthorizedError('Неверный email или пароль')
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  let subordinates = []
  if (user.role === 'manager' || user.role === 'hr' || user.role === 'admin') {
    const subordinatesResult = await query(
      'SELECT id FROM users WHERE manager_id = $1',
      [user.id]
    )
    subordinates = subordinatesResult.rows.map(row => row.id)
  }

  res.json({
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
