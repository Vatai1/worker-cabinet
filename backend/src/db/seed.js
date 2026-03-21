import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import dotenv from 'dotenv'

dotenv.config()

const FIRST_NAMES_MALE = ['Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Артём', 'Илья', 'Кирилл', 'Михаил', 'Никита', 'Егор', 'Иван', 'Владимир', 'Павел', 'Роман', 'Николай', 'Евгений', 'Денис', 'Виталий', 'Олег', 'Антон', 'Игорь', 'Вадим', 'Тимофей', 'Константин', 'Георгий', 'Степан', 'Фёдор', 'Борис']
const FIRST_NAMES_FEMALE = ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Ирина', 'Татьяна', 'Светлана', 'Екатерина', 'Юлия', 'Алина', 'Виктория', 'Дарья', 'Марина', 'Полина', 'Ксения', 'Александра', 'Маргарита', 'Диана', 'Варвара', 'Валерия', 'София', 'Анастасия', 'Милана', 'Вероника']
const LAST_NAMES_MALE = ['Иванов', 'Петров', 'Сидоров', 'Козлов', 'Новиков', 'Морозов', 'Волков', 'Соколов', 'Лебедев', 'Кузнецов', 'Попов', 'Смирнов', 'Орлов', 'Макаров', 'Зайцев', 'Павлов', 'Голубев', 'Васильев', 'Белов', 'Медведев', 'Тарасов', 'Борисов', 'Королёв', 'Григорьев', 'Романов', 'Степанов', 'Семёнов', 'Филиппов', 'Дмитриев', 'Егоров']
const LAST_NAMES_FEMALE = ['Иванова', 'Петрова', 'Сидорова', 'Козлова', 'Новикова', 'Морозова', 'Волкова', 'Соколова', 'Лебедева', 'Кузнецова', 'Попова', 'Смирнова', 'Орлова', 'Макарова', 'Зайцева', 'Павлова', 'Голубева', 'Васильева', 'Белова', 'Медведева', 'Тарасова', 'Борисова', 'Королёва', 'Григорьева', 'Романова', 'Степанова', 'Семёнова', 'Филиппова', 'Дмитриева', 'Егорова']
const MIDDLE_NAMES_MALE = ['Александрович', 'Дмитриевич', 'Максимович', 'Сергеевич', 'Андреевич', 'Алексеевич', 'Иванович', 'Владимирович', 'Павлович', 'Романович', 'Николаевич', 'Евгеньевич', 'Олегович', 'Игоревич', 'Вадимович']
const MIDDLE_NAMES_FEMALE = ['Александровна', 'Дмитриевна', 'Максимовна', 'Сергеевна', 'Андреевна', 'Алексеевна', 'Ивановна', 'Владимировна', 'Павловна', 'Романовна', 'Николаевна', 'Евгеньевна', 'Олеговна', 'Игоревна', 'Вадимовна']

const DEPARTMENTS_DATA = [
  { name: 'Отдел разработки', positions: ['Senior Frontend Developer', 'Backend Developer', 'Fullstack Developer', 'Junior Developer', 'Tech Lead'] },
  { name: 'Отдел дизайна', positions: ['UI/UX Designer', 'Graphic Designer', 'Motion Designer', 'Art Director'] },
  { name: 'Отдел QA', positions: ['QA Engineer', 'QA Automation Engineer', 'QA Lead', 'Manual QA'] },
  { name: 'Отдел маркетинга', positions: ['Marketing Manager', 'Content Manager', 'SEO Specialist', 'Marketing Lead'] },
  { name: 'Отдел продаж', positions: ['Sales Manager', 'Account Manager', 'Sales Lead', 'Business Development Manager'] },
  { name: 'Отдел аналитики', positions: ['Data Analyst', 'Business Analyst', 'Analytics Lead', 'Product Analyst'] },
  { name: 'Отдел поддержки', positions: ['Support Specialist', 'Senior Support', 'Support Lead', 'Technical Support'] },
  { name: 'Финансовый отдел', positions: ['Accountant', 'Financial Analyst', 'Finance Lead', 'Controller'] },
  { name: 'HR отдел', positions: ['HR Manager', 'Recruiter', 'HR Lead', 'People Partner'] },
  { name: 'Отдел DevOps', positions: ['DevOps Engineer', 'SRE Engineer', 'DevOps Lead', 'Cloud Architect'] },
]

const SKILLS_DATA = [
  'JavaScript', 'TypeScript', 'React', 'Vue.js', 'Angular', 'Node.js', 'Python', 'Java', 'Go', 'C#',
  'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Git', 'CI/CD', 'Linux', 'Nginx',
  'Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'After Effects',
  'Selenium', 'Cypress', 'Jest', 'Playwright',
  'Jira', 'Confluence', 'Slack', 'Agile', 'Scrum'
]

const PROJECTS_DATA = [
  { name: 'CRM', full_name: 'Customer Relationship Management', description: 'Система управления взаимоотношениями с клиентами', status: 'active' },
  { name: 'HR Portal', full_name: 'Human Resources Portal', description: 'Портал управления персоналом и кадровыми процессами', status: 'active' },
  { name: 'Analytics Dashboard', full_name: 'Business Analytics Dashboard', description: 'Дашборд бизнес-аналитики и отчётности', status: 'active' },
  { name: 'Mobile App', full_name: 'Mobile Application', description: 'Мобильное приложение для клиентов', status: 'active' },
  { name: 'API Gateway', full_name: 'API Gateway Service', description: 'Централизованный API шлюз', status: 'active' },
  { name: 'Data Warehouse', full_name: 'Enterprise Data Warehouse', description: 'Корпоративное хранилище данных', status: 'active' },
  { name: 'E-commerce', full_name: 'E-commerce Platform', description: 'Платформа электронной коммерции', status: 'paused' },
  { name: 'Chat Bot', full_name: 'AI Chat Bot', description: 'Интеллектуальный чат-бот поддержки', status: 'active' },
  { name: 'Security Audit', full_name: 'Security Audit System', description: 'Система аудита безопасности', status: 'completed' },
  { name: 'Docs Portal', full_name: 'Documentation Portal', description: 'Портал документации компании', status: 'active' },
  { name: 'Invoice System', full_name: 'Invoice Management System', description: 'Система управления счетами', status: 'active' },
  { name: 'Training Platform', full_name: 'Employee Training Platform', description: 'Платформа обучения сотрудников', status: 'active' },
  { name: 'Inventory', full_name: 'Inventory Management', description: 'Система управления складом', status: 'paused' },
  { name: 'Video Conferencing', full_name: 'Video Conferencing Tool', description: 'Инструмент видеоконференций', status: 'active' },
  { name: 'Feedback System', full_name: 'Employee Feedback System', description: 'Система обратной связи сотрудников', status: 'completed' },
]

const NOTIFICATION_TEMPLATES = [
  { title: 'Новый отпуск на согласовании', message: 'Сотрудник {name} запросил отпуск с {date} по {date2}' },
  { title: 'Отпуск согласован', message: 'Ваш отпуск с {date} по {date2} был согласован' },
  { title: 'Отпуск отклонён', message: 'Ваш отпуск с {date} по {date2} был отклонён' },
  { title: 'Новый участник проекта', message: '{name} добавлен в проект {project}' },
  { title: 'Обновление проекта', message: 'Проект {project} был обновлён' },
  { title: 'Новая задача', message: 'Вам назначена новая задача в проекте {project}' },
  { title: 'Напоминание о документах', message: 'Пожалуйста, обновите личные документы' },
  { title: 'Баланс отпуска', message: 'Ваш доступный баланс отпуска: {days} дней' },
]

const ROADMAP_ROWS = ['Планирование', 'Разработка', 'Тестирование', 'Деплой', 'Поддержка']
const ROADMAP_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981']

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDate(start, end) {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
  return date.toISOString().split('T')[0]
}

function generateEmail(firstName, lastName, index) {
  const translit = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  }
  const name = (firstName + lastName).toLowerCase().split('').map(c => translit[c] || c).join('')
  return `${name}${index}@example.com`
}

async function seed() {
  try {
    console.log('Starting comprehensive seed...')
    const passwordHash = await bcrypt.hash('password123', 10)

    const statusResult = await query('SELECT id, code FROM request_statuses')
    const statusMap = Object.fromEntries(statusResult.rows.map(r => [r.code, r.id]))
    
    const typeResult = await query('SELECT id, code FROM vacation_types')
    const typeMap = Object.fromEntries(typeResult.rows.map(r => [r.code, r.id]))

    console.log('Creating skills dictionary...')
    const skillIds = {}
    for (const skill of SKILLS_DATA) {
      const existing = await query('SELECT id FROM skills_dictionary WHERE name = $1', [skill])
      if (existing.rows.length > 0) {
        skillIds[skill] = existing.rows[0].id
      } else {
        const result = await query('INSERT INTO skills_dictionary (name) VALUES ($1) RETURNING id', [skill])
        skillIds[skill] = result.rows[0].id
      }
    }
    console.log(`  ✓ ${SKILLS_DATA.length} skills in dictionary`)

    console.log('Creating departments...')
    const departments = []
    for (let i = 0; i < DEPARTMENTS_DATA.length; i++) {
      const deptData = DEPARTMENTS_DATA[i]
      const existing = await query('SELECT id, manager_id FROM departments WHERE name = $1', [deptData.name])
      if (existing.rows.length > 0) {
        departments.push({ id: existing.rows[0].id, ...deptData, managerId: existing.rows[0].manager_id })
      } else {
        const result = await query('INSERT INTO departments (name, manager_id) VALUES ($1, NULL) RETURNING id', [deptData.name])
        departments.push({ id: result.rows[0].id, ...deptData, managerId: null })
      }
    }
    console.log(`  ✓ ${departments.length} departments`)

    console.log('Creating users...')
    const users = []
    const emailSet = new Set()

    const adminUser = {
      email: 'admin@example.com',
      firstName: 'Администратор',
      lastName: 'Системы',
      middleName: 'Главный',
      position: 'System Administrator',
      role: 'admin',
      departmentId: departments[0].id,
      isMale: true
    }
    
    const existingAdmin = await query('SELECT id FROM users WHERE email = $1', [adminUser.email])
    if (existingAdmin.rows.length === 0) {
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role, manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL) RETURNING id`,
        [adminUser.email, passwordHash, adminUser.firstName, adminUser.lastName, adminUser.middleName, adminUser.position, adminUser.departmentId, '2020-01-01', adminUser.role]
      )
      users.push({ ...adminUser, id: result.rows[0].id })
    } else {
      users.push({ ...adminUser, id: existingAdmin.rows[0].id })
    }
    emailSet.add(adminUser.email)

    const hrUsers = [
      { email: 'elena@example.com', firstName: 'Елена', lastName: 'Соколова', middleName: 'Владимировна', position: 'HR Director', isMale: false },
      { email: 'maria@example.com', firstName: 'Мария', lastName: 'Кузнецова', middleName: 'Александровна', position: 'HR Manager', isMale: false },
    ]
    
    const hrDept = departments.find(d => d.name === 'HR отдел')
    for (const hr of hrUsers) {
      if (emailSet.has(hr.email)) continue
      emailSet.add(hr.email)
      const existing = await query('SELECT id FROM users WHERE email = $1', [hr.email])
      if (existing.rows.length > 0) {
        users.push({ ...hr, id: existing.rows[0].id, role: 'hr', departmentId: hrDept.id })
        continue
      }
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role, manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'hr', NULL) RETURNING id`,
        [hr.email, passwordHash, hr.firstName, hr.lastName, hr.middleName, hr.position, hrDept.id, randomDate(new Date(2018, 0, 1), new Date(2022, 0, 1))]
      )
      users.push({ ...hr, id: result.rows[0].id, role: 'hr', departmentId: hrDept.id })
    }

    const managers = []
    for (let i = 0; i < departments.length; i++) {
      const dept = departments[i]
      const isMale = Math.random() > 0.4
      const firstName = isMale ? randomItem(FIRST_NAMES_MALE) : randomItem(FIRST_NAMES_FEMALE)
      const lastName = isMale ? randomItem(LAST_NAMES_MALE) : randomItem(LAST_NAMES_FEMALE)
      const middleName = isMale ? randomItem(MIDDLE_NAMES_MALE) : randomItem(MIDDLE_NAMES_FEMALE)
      const email = generateEmail(firstName, lastName, i)
      
      if (emailSet.has(email)) continue
      emailSet.add(email)
      
      const existing = await query('SELECT id FROM users WHERE email = $1', [email])
      if (existing.rows.length > 0) {
        managers.push({ id: existing.rows[0].id, departmentId: dept.id, email, role: 'manager', firstName, lastName })
        continue
      }
      
      const position = `Руководитель ${dept.name.toLowerCase()}`
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role, manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manager', NULL) RETURNING id`,
        [email, passwordHash, firstName, lastName, middleName, position, dept.id, randomDate(new Date(2015, 0, 1), new Date(2020, 0, 1))]
      )
      managers.push({ id: result.rows[0].id, departmentId: dept.id, email, firstName, lastName })
    }

    for (const manager of managers) {
      await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [manager.id, manager.departmentId])
      const dept = departments.find(d => d.id === manager.departmentId)
      if (dept) dept.managerId = manager.id
    }
    users.push(...managers)

    const employeesPerDept = Math.ceil((100 - 1 - 2 - managers.length) / departments.length)
    let userIndex = 0
    
    for (const dept of departments) {
      const deptManager = managers.find(m => m.departmentId === dept.id)
      const count = randomInt(employeesPerDept - 2, employeesPerDept + 2)
      
      for (let i = 0; i < count; i++) {
        const isMale = Math.random() > 0.45
        const firstName = isMale ? randomItem(FIRST_NAMES_MALE) : randomItem(FIRST_NAMES_FEMALE)
        const lastName = isMale ? randomItem(LAST_NAMES_MALE) : randomItem(LAST_NAMES_FEMALE)
        const middleName = isMale ? randomItem(MIDDLE_NAMES_MALE) : randomItem(MIDDLE_NAMES_FEMALE)
        const position = randomItem(dept.positions)
        const email = generateEmail(firstName, lastName, userIndex++)
        
        if (emailSet.has(email)) continue
        emailSet.add(email)
        
        const existing = await query('SELECT id FROM users WHERE email = $1', [email])
        if (existing.rows.length > 0) {
          users.push({ id: existing.rows[0].id, departmentId: dept.id, email, role: 'employee', firstName, lastName })
          continue
        }
        
        const result = await query(
          `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role, manager_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'employee', $9) RETURNING id`,
          [email, passwordHash, firstName, lastName, middleName, position, dept.id, randomDate(new Date(2019, 0, 1), new Date(2025, 0, 1)), deptManager?.id]
        )
        users.push({ id: result.rows[0].id, departmentId: dept.id, email, firstName, lastName, managerId: deptManager?.id, role: 'employee' })
      }
    }
    console.log(`  ✓ ${users.length} users created`)

    console.log('Creating vacation balances...')
    let balancesCreated = 0
    for (const user of users) {
      const existing = await query('SELECT 1 FROM vacation_balances WHERE user_id = $1', [user.id])
      if (existing.rows.length > 0) continue
      
      const totalDays = randomInt(28, 35)
      const usedDays = randomInt(0, 14)
      await query(
        `INSERT INTO vacation_balances (user_id, total_days, used_days, available_days, reserved_days, travel_available)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, totalDays, usedDays, totalDays - usedDays, randomInt(0, 5), Math.random() > 0.3]
      )
      balancesCreated++
    }
    console.log(`  ✓ ${balancesCreated} vacation balances created`)

    console.log('Creating vacation requests...')
    let requestsCreated = 0
    const requestIds = []
    const statuses = ['on_approval', 'approved', 'rejected', 'cancelled_by_employee', 'cancelled_by_manager']
    const weights = [0.15, 0.55, 0.1, 0.1, 0.1]
    
    function weightedRandom() {
      const rand = Math.random()
      let sum = 0
      for (let i = 0; i < weights.length; i++) {
        sum += weights[i]
        if (rand < sum) return statuses[i]
      }
      return statuses[0]
    }

    for (const user of users) {
      if (user.role === 'admin') continue
      
      const requestCount = randomInt(1, 4)
      for (let i = 0; i < requestCount; i++) {
        const startDate = randomDate(new Date(2025, 0, 1), new Date(2026, 11, 31))
        const duration = randomInt(7, 21)
        const endDateObj = new Date(startDate)
        endDateObj.setDate(endDateObj.getDate() + duration)
        const endDate = endDateObj.toISOString().split('T')[0]
        
        const status = weightedRandom()
        const vacationType = Math.random() > 0.85 ? 'unpaid' : 'annual_paid'
        const hasTravel = vacationType === 'annual_paid' && Math.random() > 0.7
        
        const dept = departments.find(d => d.id === user.departmentId)
        const reviewer = managers.find(m => m.departmentId === user.departmentId)
        
        const existing = await query(
          'SELECT id FROM vacation_requests WHERE user_id = $1 AND start_date = $2',
          [user.id, startDate]
        )
        if (existing.rows.length > 0) continue
        
        const result = await query(
          `INSERT INTO vacation_requests 
           (user_id, start_date, end_date, duration, vacation_type_id, status_id, has_travel, reviewed_by, reviewed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            user.id, startDate, endDate, duration, typeMap[vacationType], statusMap[status], hasTravel,
            status !== 'on_approval' ? reviewer?.id : null,
            status !== 'on_approval' ? new Date().toISOString() : null
          ]
        )
        requestIds.push({ id: result.rows[0].id, userId: user.id, status, reviewerId: reviewer?.id })
        requestsCreated++
      }
    }
    console.log(`  ✓ ${requestsCreated} vacation requests created`)

    console.log('Creating vacation request status history...')
    let historyCreated = 0
    for (const req of requestIds) {
      const existing = await query('SELECT 1 FROM vacation_request_status_history WHERE request_id = $1', [req.id])
      if (existing.rows.length > 0) continue
      
      await query(
        `INSERT INTO vacation_request_status_history (request_id, status_id, changed_at, changed_by, comment)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.id, statusMap['on_approval'], new Date().toISOString(), req.userId, 'Создание заявки']
      )
      historyCreated++
      
      if (req.status !== 'on_approval') {
        await query(
          `INSERT INTO vacation_request_status_history (request_id, status_id, changed_at, changed_by, comment)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.id, statusMap[req.status], new Date().toISOString(), req.reviewerId, req.status === 'approved' ? 'Согласовано' : 'Изменение статуса']
        )
        historyCreated++
      }
    }
    console.log(`  ✓ ${historyCreated} status history records created`)

    console.log('Creating projects...')
    const projects = []
    for (let i = 0; i < PROJECTS_DATA.length; i++) {
      const projData = PROJECTS_DATA[i]
      const existing = await query('SELECT id FROM company_projects WHERE name = $1', [projData.name])
      if (existing.rows.length > 0) {
        projects.push({ id: existing.rows[0].id, ...projData })
        continue
      }
      
      const creator = randomItem(managers)
      const result = await query(
        `INSERT INTO company_projects (name, full_name, description, status, start_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [projData.name, projData.full_name, projData.description, projData.status, randomDate(new Date(2024, 0, 1), new Date(2025, 0, 1)), creator.id]
      )
      projects.push({ id: result.rows[0].id, ...projData })
    }
    console.log(`  ✓ ${projects.length} projects created`)

    console.log('Creating project members...')
    let membersCreated = 0
    for (const project of projects) {
      const memberCount = randomInt(3, 8)
      const projectUsers = [...users].sort(() => Math.random() - 0.5).slice(0, memberCount)
      
      for (let i = 0; i < projectUsers.length; i++) {
        const user = projectUsers[i]
        const existing = await query(
          'SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2',
          [project.id, user.id]
        )
        if (existing.rows.length > 0) continue
        
        const role = i === 0 ? 'lead' : 'member'
        await query(
          `INSERT INTO company_project_members (project_id, user_id, role, description)
           VALUES ($1, $2, $3, $4)`,
          [project.id, user.id, role, role === 'lead' ? 'Руководитель проекта' : 'Участник проекта']
        )
        membersCreated++
      }
    }
    console.log(`  ✓ ${membersCreated} project members created`)

    console.log('Creating project roadmap rows and tasks...')
    let rowsCreated = 0
    let tasksCreated = 0
    
    for (const project of projects) {
      for (let i = 0; i < ROADMAP_ROWS.length; i++) {
        const existingRow = await query(
          'SELECT id FROM project_roadmap_rows WHERE project_id = $1 AND title = $2',
          [project.id, ROADMAP_ROWS[i]]
        )
        
        let rowId
        if (existingRow.rows.length > 0) {
          rowId = existingRow.rows[0].id
        } else {
          const rowResult = await query(
            `INSERT INTO project_roadmap_rows (project_id, title, color, order_index, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [project.id, ROADMAP_ROWS[i], ROADMAP_COLORS[i], i, randomItem(managers).id]
          )
          rowId = rowResult.rows[0].id
          rowsCreated++
        }
        
        const taskCount = randomInt(2, 5)
        for (let j = 0; j < taskCount; j++) {
          const taskTitle = `Задача ${ROADMAP_ROWS[i].toLowerCase()} ${j + 1}`
          const existingTask = await query(
            'SELECT 1 FROM project_roadmap_tasks WHERE project_id = $1 AND row_id = $2 AND title = $3',
            [project.id, rowId, taskTitle]
          )
          if (existingTask.rows.length > 0) continue
          
          const taskStatus = randomItem(['pending', 'in_progress', 'completed'])
          const startDate = randomDate(new Date(2025, 0, 1), new Date(2025, 6, 1))
          const endDateObj = new Date(startDate)
          endDateObj.setMonth(endDateObj.getMonth() + randomInt(1, 3))
          
          await query(
            `INSERT INTO project_roadmap_tasks 
             (project_id, row_id, title, description, start_date, end_date, status, priority, assignee_id, order_index, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              project.id, rowId, taskTitle, `Описание задачи: ${taskTitle}`,
              startDate, endDateObj.toISOString().split('T')[0], taskStatus,
              randomItem(['low', 'medium', 'high']), randomItem(users).id, j, randomItem(managers).id
            ]
          )
          tasksCreated++
        }
      }
    }
    console.log(`  ✓ ${rowsCreated} roadmap rows, ${tasksCreated} roadmap tasks created`)

    console.log('Creating roadmap_rows and roadmap_tasks (alternate tables)...')
    let altRowsCreated = 0
    let altTasksCreated = 0
    
    for (const project of projects) {
      for (let i = 0; i < ROADMAP_ROWS.length; i++) {
        const existingRow = await query(
          'SELECT id FROM roadmap_rows WHERE project_id = $1 AND title = $2',
          [project.id, ROADMAP_ROWS[i]]
        )
        
        let rowId
        if (existingRow.rows.length > 0) {
          rowId = existingRow.rows[0].id
        } else {
          const rowResult = await query(
            `INSERT INTO roadmap_rows (project_id, title, color, order_index, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [project.id, ROADMAP_ROWS[i], ROADMAP_COLORS[i], i, randomItem(managers).id]
          )
          rowId = rowResult.rows[0].id
          altRowsCreated++
        }
        
        const taskCount = randomInt(1, 3)
        for (let j = 0; j < taskCount; j++) {
          const taskTitle = `Milestone ${ROADMAP_ROWS[i]} ${j + 1}`
          const existingTask = await query(
            'SELECT 1 FROM roadmap_tasks WHERE project_id = $1 AND row_id = $2 AND title = $3',
            [project.id, rowId, taskTitle]
          )
          if (existingTask.rows.length > 0) continue
          
          const startMonth = `2025-${String(randomInt(1, 12)).padStart(2, '0')}`
          const endMonthNum = randomInt(1, 12)
          const endMonth = `2025-${String(endMonthNum).padStart(2, '0')}`
          
          await query(
            `INSERT INTO roadmap_tasks 
             (project_id, row_id, title, description, start_month, end_month, status, priority, is_milestone, color, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              project.id, rowId, taskTitle, `Описание: ${taskTitle}`,
              startMonth, endMonth, randomItem(['pending', 'in_progress', 'completed']),
              randomItem(['low', 'medium', 'high']), Math.random() > 0.7,
              randomItem(ROADMAP_COLORS), randomItem(managers).id
            ]
          )
          altTasksCreated++
        }
      }
    }
    console.log(`  ✓ ${altRowsCreated} alt roadmap rows, ${altTasksCreated} alt roadmap tasks created`)

    console.log('Assigning skills to users...')
    let skillsAssigned = 0
    const skillNames = Object.keys(skillIds)
    
    for (const user of users) {
      if (user.role === 'admin') continue
      
      const skillCount = randomInt(3, 7)
      const userSkills = [...skillNames].sort(() => Math.random() - 0.5).slice(0, skillCount)
      
      for (const skillName of userSkills) {
        const existing = await query(
          'SELECT 1 FROM user_skills WHERE user_id = $1 AND skill_id = $2',
          [user.id, skillIds[skillName]]
        )
        if (existing.rows.length > 0) continue
        
        await query(
          `INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2)`,
          [user.id, skillIds[skillName]]
        )
        skillsAssigned++
      }
    }
    console.log(`  ✓ ${skillsAssigned} user skills assigned`)

    console.log('Creating notifications...')
    let notificationsCreated = 0
    const notificationUsers = users.filter(u => u.role !== 'admin')
    
    for (let i = 0; i < 100; i++) {
      const user = randomItem(notificationUsers)
      const template = randomItem(NOTIFICATION_TEMPLATES)
      
      let title = template.title
      let message = template.message
        .replace('{name}', `${randomItem(FIRST_NAMES_MALE)} ${randomItem(LAST_NAMES_MALE)}`)
        .replace('{date}', randomDate(new Date(2025, 0, 1), new Date(2025, 6, 1)))
        .replace('{date2}', randomDate(new Date(2025, 6, 1), new Date(2025, 11, 31)))
        .replace('{project}', randomItem(PROJECTS_DATA).name)
        .replace('{days}', String(randomInt(5, 28)))
      
      const existing = await query(
        'SELECT 1 FROM notifications WHERE user_id = $1 AND title = $2 AND message = $3',
        [user.id, title, message]
      )
      if (existing.rows.length > 0) continue
      
      await query(
        `INSERT INTO notifications (user_id, title, message, type, read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, title, message, randomItem(['info', 'warning', 'success']), Math.random() > 0.3, new Date(Date.now() - randomInt(0, 30) * 24 * 60 * 60 * 1000).toISOString()]
      )
      notificationsCreated++
    }
    console.log(`  ✓ ${notificationsCreated} notifications created`)

    console.log('Creating vacation restrictions...')
    let restrictionsCreated = 0
    
    for (const dept of departments) {
      const deptUsers = users.filter(u => u.departmentId === dept.id && u.role === 'employee')
      if (deptUsers.length < 3) continue
      
      const manager = managers.find(m => m.departmentId === dept.id)
      if (!manager) continue
      
      const pairUsers = deptUsers.slice(0, 2)
      if (pairUsers.length === 2) {
        const existingPair = await query(
          `SELECT 1 FROM vacation_restrictions WHERE department_id = $1 AND restriction_type = 'pair' AND employee_ids @> ARRAY[$2::int, $3::int]`,
          [dept.id, pairUsers[0].id, pairUsers[1].id]
        )
        if (existingPair.rows.length === 0) {
          await query(
            `INSERT INTO vacation_restrictions
             (department_id, restriction_type, employee_ids, max_concurrent, description, created_by)
             VALUES ($1, 'pair', ARRAY[$2::int, $3::int], NULL, $4, $5)`,
            [dept.id, pairUsers[0].id, pairUsers[1].id, `Парное ограничение: ${pairUsers[0].firstName || 'Сотрудник'} и ${pairUsers[1].firstName || 'Сотрудник'} не могут одновременно быть в отпуске`, manager.id]
          )
          restrictionsCreated++
        }
      }
      
      const groupUsers = deptUsers.slice(2, 5)
      if (groupUsers.length >= 2) {
        const existingGroup = await query(
          `SELECT 1 FROM vacation_restrictions WHERE department_id = $1 AND restriction_type = 'group' AND max_concurrent = 1`,
          [dept.id]
        )
        if (existingGroup.rows.length === 0) {
          await query(
            `INSERT INTO vacation_restrictions
             (department_id, restriction_type, employee_ids, max_concurrent, description, created_by)
             VALUES ($1, 'group', $2::int[], 1, $3, $4)`,
            [dept.id, groupUsers.map(u => u.id), `Групповое ограничение: не более 1 сотрудника из группы`, manager.id]
          )
          restrictionsCreated++
        }
      }
    }
    console.log(`  ✓ ${restrictionsCreated} vacation restrictions created`)

    console.log('\n✅ Comprehensive seed completed successfully!')
    console.log('\nSummary:')
    console.log(`  Departments: ${departments.length}`)
    console.log(`  Users: ${users.length} (1 admin, 2 HR, ${managers.length} managers, ${users.length - 1 - 2 - managers.length} employees)`)
    console.log(`  Projects: ${projects.length}`)
    console.log(`  Skills in dictionary: ${SKILLS_DATA.length}`)
    console.log(`  Vacation requests: ${requestsCreated}`)
    console.log(`  Notifications: ${notificationsCreated}`)
    console.log(`  Vacation restrictions: ${restrictionsCreated}`)
    console.log('\nLogin credentials:')
    console.log('  admin@example.com (admin)')
    console.log('  elena@example.com (HR Director)')
    console.log('  maria@example.com (HR Manager)')
    console.log('  Password: password123 (for all users)')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Seed error:', error)
    process.exit(1)
  }
}

seed()
