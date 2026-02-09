import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'

const router = express.Router()

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate, role } = req.body

    // Check if user exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    )

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const result = await query(
      `INSERT INTO users 
       (email, password_hash, first_name, last_name, middle_name, position, department_id, phone, birth_date, hire_date, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, email, first_name, last_name, middle_name, position, department_id, role, created_at`,
      [email, passwordHash, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate, role || 'employee']
    )

    const user = result.rows[0]

    // Create vacation balance
    await query(
      'INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)',
      [user.id]
    )

    // Generate token
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
  } catch (error) {
    console.error('Error registering user:', error)
    res.status(500).json({ error: 'Failed to register user' })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user
    const result = await query(
      `SELECT u.*, d.name as department_name, d.manager_id as department_manager_id
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.email = $1`,
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const user = result.rows[0]

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash)

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    // Get subordinates if manager
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
      },
    })
  } catch (error) {
    console.error('Error logging in:', error)
    res.status(500).json({ error: 'Failed to login' })
  }
})

// Get current user
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
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
      return res.status(404).json({ error: 'User not found' })
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
    })
  } catch (error) {
    console.error('Error getting current user:', error)
    res.status(403).json({ error: 'Invalid or expired token' })
  }
})

export default router
