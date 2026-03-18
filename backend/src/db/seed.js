import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function seed() {
  try {
    console.log('Starting seed...')

    let departmentId
    const existingDept = await query("SELECT id FROM departments WHERE name = 'Отдел разработки'")
    
    if (existingDept.rows.length > 0) {
      departmentId = existingDept.rows[0].id
      console.log('  Department already exists, skipping...')
    } else {
      const deptResult = await query(
        `INSERT INTO departments (name, manager_id)
         VALUES ('Отдел разработки', NULL)
         RETURNING id`
      )
      departmentId = deptResult.rows[0].id
    }

    const passwordHash = await bcrypt.hash('password123', 10)

    const users = [
      {
        email: 'ivanov@example.com',
        firstName: 'Иван',
        lastName: 'Иванов',
        middleName: 'Иванович',
        position: 'Senior Frontend Developer',
        role: 'employee',
        managerId: null,
      },
      {
        email: 'petrov@example.com',
        firstName: 'Петр',
        lastName: 'Петров',
        middleName: 'Петрович',
        position: 'Руководитель отдела разработки',
        role: 'manager',
        managerId: null,
      },
      {
        email: 'sidorov@example.com',
        firstName: 'Сидор',
        lastName: 'Сидоров',
        middleName: 'Сидорович',
        position: 'Backend Developer',
        role: 'employee',
        managerId: null,
      },
      {
        email: 'ivanova@example.com',
        firstName: 'Анна',
        lastName: 'Иванова',
        middleName: 'Сергеевна',
        position: 'UI/UX Designer',
        role: 'employee',
        managerId: null,
      },
      {
        email: 'petrova@example.com',
        firstName: 'Мария',
        lastName: 'Петрова',
        middleName: 'Александровна',
        position: 'QA Engineer',
        role: 'employee',
        managerId: null,
      },
    ]

    const createdUsers = []
    
    async function getOrCreateUser(user, hireDate, managerId = null) {
      const existing = await query('SELECT id FROM users WHERE email = $1', [user.email])
      if (existing.rows.length > 0) {
        console.log(`  User ${user.email} already exists, skipping...`)
        return { ...user, id: existing.rows[0].id }
      }
      
      const result = await query(
        `INSERT INTO users 
         (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role, manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [user.email, passwordHash, user.firstName, user.lastName, user.middleName, 
         user.position, departmentId, hireDate, user.role, managerId]
      )
      return { ...user, id: result.rows[0].id }
    }

    const manager = users[1]
    const managerResult = await getOrCreateUser(manager, '2018-01-15')
    const managerId = managerResult.id
    createdUsers.push(managerResult)

    await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [managerId, departmentId])

    for (let i = 0; i < users.length; i++) {
      if (i === 1) continue
      
      const user = users[i]
      const userResult = await getOrCreateUser(user, i === 0 ? '2020-03-01' : '2019-05-15', managerId)
      createdUsers.push(userResult)
    }

    for (const user of createdUsers) {
      const existingBalance = await query('SELECT 1 FROM vacation_balances WHERE user_id = $1', [user.id])
      if (existingBalance.rows.length > 0) continue
      
      await query(
        `INSERT INTO vacation_balances 
         (user_id, total_days, used_days, available_days, reserved_days, travel_available)
         VALUES ($1, 28, 0, 28, 0, true)`,
        [user.id]
      )
    }

    const ivanov = createdUsers.find(u => u.email === 'ivanov@example.com')
    const petrov = createdUsers.find(u => u.email === 'petrov@example.com')
    const sidorov = createdUsers.find(u => u.email === 'sidorov@example.com')
    const ivanova = createdUsers.find(u => u.email === 'ivanova@example.com')
    const petrova = createdUsers.find(u => u.email === 'petrova@example.com')

    const vacationRequests = [
      { user: ivanov, start: '2026-01-15', end: '2026-01-29', duration: 15, status: 'approved', reviewedBy: petrov.id },
      { user: ivanov, start: '2026-06-02', end: '2026-06-15', duration: 14, status: 'on_approval', reviewedBy: null },
      { user: petrov, start: '2026-02-01', end: '2026-02-14', duration: 14, status: 'approved', reviewedBy: null },
      { user: sidorov, start: '2026-03-01', end: '2026-03-14', duration: 14, status: 'approved', reviewedBy: null },
      { user: ivanova, start: '2026-04-01', end: '2026-04-14', duration: 14, status: 'approved', reviewedBy: null },
      { user: petrova, start: '2026-05-01', end: '2026-05-14', duration: 14, status: 'approved', reviewedBy: null },
    ]

    for (const req of vacationRequests) {
      const existing = await query(
        'SELECT 1 FROM vacation_requests WHERE user_id = $1 AND start_date = $2',
        [req.user.id, req.start]
      )
      if (existing.rows.length > 0) continue

      await query(
        `INSERT INTO vacation_requests 
         (user_id, start_date, end_date, duration, vacation_type, status, has_travel, reviewed_by)
         VALUES ($1, $2, $3, $4, 'annual_paid', $5, false, $6)`,
        [req.user.id, req.start, req.end, req.duration, req.status, req.reviewedBy]
      )
    }

    const existingRestrictions = await query('SELECT 1 FROM vacation_restrictions WHERE department_id = $1', [departmentId])
    if (existingRestrictions.rows.length === 0) {
      await query(
        `INSERT INTO vacation_restrictions
         (department_id, restriction_type, employee_ids, max_concurrent, description, created_by)
         VALUES ($1, 'pair', ARRAY[$2::int, $3::int], NULL, 'Парное ограничение: Иванов и Сидоров не могут одновременно быть в отпуске', $4::int)`,
        [departmentId, ivanov.id, sidorov.id, petrov.id]
      )

      await query(
        `INSERT INTO vacation_restrictions
          (department_id, restriction_type, employee_ids, max_concurrent, description, created_by)
          VALUES ($1, 'group', ARRAY[$2::int, $3::int], 1, 'Групповое ограничение: не более 1 из Ивановой и Петровой', $4::int)`,
        [departmentId, ivanova.id, petrova.id, petrov.id]
      )
    }

    const existingProjects = await query('SELECT 1 FROM company_projects LIMIT 1')
    if (existingProjects.rows.length === 0) {
      const projectResult = await query(
        `INSERT INTO company_projects (name, full_name, description, status, start_date, created_by)
         VALUES ('CRM', 'Customer Relationship Management', 'Система управления взаимоотношениями с клиентами', 'active', '2025-01-15', $1)
         RETURNING id`,
        [petrov.id]
      )
      const projectId = projectResult.rows[0].id

      await query(
        `INSERT INTO company_project_members (project_id, user_id, role, description) VALUES
          ($1, $2, 'lead', 'Руководитель проекта'),
          ($1, $3, 'member', 'Frontend разработчик'),
          ($1, $4, 'member', 'Backend разработчик'),
          ($1, $5, 'member', 'UI/UX дизайнер'),
          ($1, $6, 'member', 'QA инженер')`,
        [projectId, petrov.id, ivanov.id, sidorov.id, ivanova.id, petrova.id]
      )

      const project2Result = await query(
        `INSERT INTO company_projects (name, full_name, description, status, start_date, created_by)
         VALUES ('HR Portal', 'Human Resources Portal', 'Портал управления персоналом', 'active', '2025-06-01', $1)
         RETURNING id`,
        [petrov.id]
      )
      const project2Id = project2Result.rows[0].id

      await query(
        `INSERT INTO company_project_members (project_id, user_id, role, description) VALUES
          ($1, $2, 'lead', 'Руководитель проекта'),
          ($1, $3, 'member', 'Frontend разработчик')`,
        [project2Id, petrov.id, ivanov.id]
      )
    }

    console.log('✅ Seed completed successfully')
    console.log('Created users:', createdUsers.length)
    console.log('Login credentials:')
    console.log('  Email: ivanov@example.com (сотрудник)')
    console.log('  Email: petrov@example.com (руководитель)')
    console.log('  Password: password123 (for all users)')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Seed error:', error)
    process.exit(1)
  }
}

seed()
