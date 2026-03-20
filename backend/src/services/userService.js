import { query } from '../config/database.js'
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/errors.js'

class UserService {
  async getAllSkills() {
    const result = await query('SELECT id, name FROM skills_dictionary ORDER BY name')
    return result.rows
  }

  async searchUsers(options = {}) {
    const { departmentId, searchQuery } = options
    
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
        m.first_name || '' || m.last_name as manager_name
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
    
    if (searchQuery) {
      sql += ` AND (u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1} OR u.position ILIKE $${params.length + 1})`
      params.push(`%${searchQuery}%`)
    }
    
    sql += ' ORDER BY u.last_name, u.first_name'
    
    const result = await query(sql, params)
    return result.rows
  }

  async getUserById(userId, currentUser) {
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      throw new ForbiddenError('Недостаточно прав для просмотра профиля')
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
        u.responsibility_area,
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
      [userId]
    )

    if (result.rows.length === 0) {
      throw new NotFoundError('Пользователь не найден')
    }

    const user = result.rows[0]
    const subordinates = await this.getSubordinates(userId, user.role)
    const skills = await this.getUserSkills(userId)
    const projects = await this.getUserProjects(userId)

    return {
      ...user,
      subordinates,
      skills,
      projects,
    }
  }

  async getSubordinates(userId, role) {
    if (role !== 'manager' && role !== 'hr' && role !== 'admin') {
      return []
    }
    const result = await query(
      'SELECT id, first_name, last_name FROM users WHERE manager_id = $1',
      [userId]
    )
    return result.rows
  }

  async getUserSkills(userId) {
    const result = await query(
      'SELECT sd.name FROM skills_dictionary sd JOIN user_skills us ON sd.id = us.skill_id WHERE us.user_id = $1 ORDER BY sd.name',
      [userId]
    )
    return result.rows.map(row => row.name)
  }

  async getUserProjects(userId) {
    const result = await query(
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
      [userId]
    )
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      role: row.role,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      description: row.description,
      joined_at: row.joined_at,
    }))
  }

  async addSkillToUser(userId, skillName, currentUser) {
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      throw new ForbiddenError('Недостаточно прав для добавления навыка')
    }

    if (!skillName || typeof skillName !== 'string' || skillName.trim().length === 0) {
      throw new ValidationError('Название навыка обязательно')
    }

    const trimmedSkill = skillName.trim()

    const skillResult = await query(
      'SELECT id FROM skills_dictionary WHERE name = $1',
      [trimmedSkill]
    )

    let skillId
    if (skillResult.rows.length === 0) {
      const insertResult = await query(
        'INSERT INTO skills_dictionary (name) VALUES ($1) RETURNING id',
        [trimmedSkill]
      )
      skillId = insertResult.rows[0].id
    } else {
      skillId = skillResult.rows[0].id
    }

    await query(
      'INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2) ON CONFLICT (user_id, skill_id) DO NOTHING',
      [userId, skillId]
    )

    return this.getUserSkills(userId)
  }

  async removeSkillFromUser(userId, skillName, currentUser) {
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      throw new ForbiddenError('Недостаточно прав для удаления навыка')
    }

    if (!skillName || typeof skillName !== 'string' || skillName.trim().length === 0) {
      throw new ValidationError('Название навыка обязательно')
    }

    await query(
      'DELETE FROM user_skills WHERE user_id = $1 AND skill_id = (SELECT id FROM skills_dictionary WHERE name = $2)',
      [userId, skillName.trim()]
    )

    return this.getUserSkills(userId)
  }

  async updateUserProfile(userId, updates, currentUser) {
    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      throw new ForbiddenError('Недостаточно прав для обновления профиля')
    }

    const allowedFields = ['responsibility_area', 'phone', 'first_name', 'last_name', 'middle_name']
    const setClauses = []
    const values = []
    let paramIndex = 1

    for (const [field, value] of Object.entries(updates)) {
      if (!allowedFields.includes(field)) continue
      
      if (typeof value === 'string') {
        if (field === 'first_name' || field === 'last_name') {
          if (!value.trim()) continue
        }
        setClauses.push(`${field} = $${paramIndex++}`)
        values.push(value.trim())
      }
    }

    if (setClauses.length === 0) {
      throw new ValidationError('Нет полей для обновления')
    }

    values.push(userId)
    await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      values
    )

    return { success: true }
  }
}

export const userService = new UserService()
export default userService
