import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

// Get all unique skills
router.get('/skills/all', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name FROM skills_dictionary ORDER BY name'
    )
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching all skills:', error)
    res.status(500).json({ error: 'Failed to fetch skills' })
  }
})

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

    // Get skills
    const skillsResult = await query(
      'SELECT sd.name FROM skills_dictionary sd JOIN user_skills us ON sd.id = us.skill_id WHERE us.user_id = $1 ORDER BY sd.name',
      [id]
    )
    const skills = skillsResult.rows.map(row => row.name)

    // Get projects
    const projectsResult = await query(
      'SELECT id, name, role, status, start_date, end_date, description FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
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
    }))

    res.json({
      ...user,
      subordinates,
      skills,
      projects,
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// Add skill to user
router.post('/:id/skills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { skill } = req.body
    const currentUser = req.user

    // Проверка прав: только владелец профиля или admin
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (!skill || typeof skill !== 'string' || skill.trim().length === 0) {
      return res.status(400).json({ error: 'Skill name is required' })
    }

    const skillName = skill.trim()

    // Check if skill exists in dictionary, if not create it
    const skillResult = await query(
      'SELECT id FROM skills_dictionary WHERE name = $1',
      [skillName]
    )

    let skillId
    if (skillResult.rows.length === 0) {
      const insertResult = await query(
        'INSERT INTO skills_dictionary (name) VALUES ($1) RETURNING id',
        [skillName]
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
router.delete('/:id/skills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { skill } = req.body
    const currentUser = req.user

    // Проверка прав: только владелец профиля или admin
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(id)) {
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
router.post('/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { name, role, status, startDate, endDate, description } = req.body
    const currentUser = req.user

    // Проверка прав: только владелец профиля или admin
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(id)) {
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
      `INSERT INTO projects (user_id, name, role, status, start_date, end_date, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, role, status, start_date, end_date, description`,
      [
        id,
        name.trim(),
        role.trim(),
        projectStatus,
        startDate || null,
        endDate || null,
        description ? description.trim() : null,
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
router.delete('/:id/projects/:projectId', authenticateToken, async (req, res) => {
  try {
    const { id, projectId } = req.params
    const currentUser = req.user

    // Проверка прав: только владелец профиля или admin
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, id]
    )

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

export default router
