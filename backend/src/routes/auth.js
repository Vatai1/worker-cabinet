import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'
import log from '../utils/logger.js'

const router = express.Router()

router.post('/register', async (req, res) => {
  log.api.start(req, 'AUTH', 'POST /register')
  
  try {
    const { email, password, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate, role } = req.body

    log.info('AUTH', 'Registration attempt', { email, firstName, lastName, role })

    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    )

    if (existingUser.rows.length > 0) {
      log.warn('AUTH', 'Registration failed - email exists', { email })
      return res.status(400).json({ error: 'Email already registered' })
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
    log.info('AUTH', 'User created', { userId: user.id, email: user.email, role: user.role })

    await query(
      'INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)',
      [user.id]
    )

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    log.api.success(req, 'AUTH', 'POST /register', 201, { userId: user.id, email: user.email })
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
  } catch (error) {
    log.api.error(req, 'AUTH', 'POST /register', error)
    res.status(500).json({ error: 'Failed to register user' })
  }
})

router.post('/login', async (req, res) => {
  log.api.start(req, 'AUTH', 'POST /login')
  
  try {
    const { email, password } = req.body

    log.info('AUTH', 'Login attempt', { email })

    const result = await query(
      `SELECT u.*, d.name as department_name, d.manager_id as department_manager_id
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.email = $1`,
      [email]
    )

    if (result.rows.length === 0) {
      log.warn('AUTH', 'Login failed - user not found', { email })
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const user = result.rows[0]

    const validPassword = await bcrypt.compare(password, user.password_hash)

    if (!validPassword) {
      log.warn('AUTH', 'Login failed - invalid password', { email, userId: user.id })
      return res.status(401).json({ error: 'Invalid email or password' })
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

    log.info('AUTH', 'Login successful', { 
      userId: user.id, 
      email: user.email, 
      role: user.role,
      departmentId: user.department_id,
      subordinatesCount: subordinates.length 
    })

    log.api.success(req, 'AUTH', 'POST /login', 200, { userId: user.id, role: user.role })
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
      },
    })
  } catch (error) {
    log.api.error(req, 'AUTH', 'POST /login', error)
    res.status(500).json({ error: 'Failed to login' })
  }
})

router.get('/me', async (req, res) => {
  log.api.start(req, 'AUTH', 'GET /me')
  
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    log.warn('AUTH', 'GET /me - no token provided')
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const result = await query(
      `SELECT u.*, d.name as department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [decoded.id]
    )

    if (result.rows.length === 0) {
      log.warn('AUTH', 'GET /me - user not found', { decodedId: decoded.id })
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]

    log.api.success(req, 'AUTH', 'GET /me', 200, { userId: user.id, email: user.email })
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
    })
  } catch (error) {
    log.api.error(req, 'AUTH', 'GET /me', error, 403)
    res.status(403).json({ error: 'Invalid or expired token' })
  }
})

export default router
