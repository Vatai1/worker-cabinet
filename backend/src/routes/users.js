import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

// Get all users (for managers/hr)
router.get('/', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  try {
    const { departmentId } = req.query
    
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
        m.first_name || ' ' || m.last_name as manager_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE 1=1
    `
    
    const params = []

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

// Get user by id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const currentUser = req.user

    // Проверка прав
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Forbidden' })
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
        u.phone,
        u.birth_date,
        u.hire_date,
        u.status,
        u.role,
        u.manager_id,
        m.first_name || ' ' || m.last_name as manager_name,
        vb.total_days,
        vb.used_days,
        vb.available_days,
        vb.reserved_days,
        vb.travel_available,
        vb.travel_next_available_date
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
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

    res.json({
      ...user,
      subordinates,
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

export default router
