import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        d.id,
        d.name,
        d.manager_id,
        d.created_at,
        d.updated_at,
        m.first_name || ' ' || m.last_name as manager_name,
        (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
      FROM departments d
      LEFT JOIN users m ON d.manager_id = m.id
      ORDER BY d.name
    `)

    const employeesResult = await query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.email,
        u.phone,
        u.status,
        u.role,
        u.avatar,
        u.department_id
      FROM users u
      WHERE u.department_id IS NOT NULL
      ORDER BY u.last_name, u.first_name
    `)

    const departmentsWithEmployees = result.rows.map(dept => ({
      ...dept,
      employees: employeesResult.rows.filter(emp => emp.department_id === dept.id)
    }))

    res.json(departmentsWithEmployees)
  } catch (error) {
    console.error('Error fetching departments:', error)
    res.status(500).json({ error: 'Failed to fetch departments' })
  }
})

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(`
      SELECT 
        d.id,
        d.name,
        d.manager_id,
        d.created_at,
        d.updated_at,
        m.first_name || ' ' || m.last_name as manager_name
      FROM departments d
      LEFT JOIN users m ON d.manager_id = m.id
      WHERE d.id = $1
    `, [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' })
    }

    const employeesResult = await query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.email,
        u.phone,
        u.status,
        u.role,
        u.avatar
      FROM users u
      WHERE u.department_id = $1
      ORDER BY u.last_name, u.first_name
    `, [id])

    res.json({
      ...result.rows[0],
      employees: employeesResult.rows
    })
  } catch (error) {
    console.error('Error fetching department:', error)
    res.status(500).json({ error: 'Failed to fetch department' })
  }
})

export default router
