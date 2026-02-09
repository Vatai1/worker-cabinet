import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function seed() {
  try {
    console.log('Starting seed...')

    // Создание подразделения
    const deptResult = await query(
      `INSERT INTO departments (name, manager_id)
       VALUES ('Отдел разработки', NULL)
       RETURNING id`
    )
    const departmentId = deptResult.rows[0].id

    // Создание пользователей
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
    
    // Сначала создаём руководителя
    const manager = users[1]
    const managerResult = await query(
      `INSERT INTO users 
       (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [manager.email, passwordHash, manager.firstName, manager.lastName, manager.middleName, 
       manager.position, departmentId, '2018-01-15', manager.role]
    )
    const managerId = managerResult.rows[0].id
    createdUsers.push({ ...manager, id: managerId })

    // Обновляем department.manager_id
    await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [managerId, departmentId])

    // Создаём остальных пользователей
    for (let i = 0; i < users.length; i++) {
      if (i === 1) continue // Skip manager, already created
      
      const user = users[i]
      const userResult = await query(
        `INSERT INTO users 
         (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role, manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [user.email, passwordHash, user.firstName, user.lastName, user.middleName, 
         user.position, departmentId, i === 0 ? '2020-03-01' : '2019-05-15', user.role, managerId]
      )
      createdUsers.push({ ...user, id: userResult.rows[0].id })
    }

    // Создание балансов для всех пользователей
    for (const user of createdUsers) {
      await query(
        `INSERT INTO vacation_balances 
         (user_id, total_days, used_days, available_days, reserved_days, travel_available, hire_date)
         VALUES ($1, 28, 0, 28, 0, true, $2)`,
        [user.id, user.id === managerId ? '2018-01-15' : '2020-03-01']
      )
    }

    // Создание тестовых заявок на отпуск
    const ivanov = createdUsers[0]
    const petrov = createdUsers[1]
    const sidorov = createdUsers[2]
    const ivanova = createdUsers[3]
    const petrova = createdUsers[4]

    // Заявка Иванова (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel, reviewed_by)
       VALUES ($1, '2026-01-15', '2026-01-29', 15, 'annual_paid', 'approved', false, $2)`,
      [ivanov.id, petrov.id]
    )

    // Заявка Иванова (на согласовании)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-06-02', '2026-06-15', 14, 'annual_paid', 'on_approval', true)`,
      [ivanov.id]
    )

    // Заявка Петрова (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-02-01', '2026-02-14', 14, 'annual_paid', 'approved', false)`,
      [petrov.id]
    )

    // Заявка Сидорова (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-03-01', '2026-03-14', 14, 'annual_paid', 'approved', false)`,
      [sidorov.id]
    )

    // Заявка Ивановой (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-04-01', '2026-04-14', 14, 'annual_paid', 'approved', true)`,
      [ivanova.id]
    )

    // Заявка Петровой (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-05-01', '2026-05-14', 14, 'annual_paid', 'approved', false)`,
      [petrova.id]
    )

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
