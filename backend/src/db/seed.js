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
  { name: 'Отдел разработки', positions: ['Senior Frontend Developer', 'Backend Developer', 'Fullstack Developer', 'Junior Developer', 'Tech Lead', 'Senior Backend Developer', 'Middle Frontend Developer'] },
  { name: 'Отдел дизайна', positions: ['UI/UX Designer', 'Graphic Designer', 'Motion Designer', 'Art Director', 'Product Designer', 'UX Researcher'] },
  { name: 'Отдел QA', positions: ['QA Engineer', 'QA Automation Engineer', 'QA Lead', 'Manual QA', 'Performance QA', 'Security QA'] },
  { name: 'Отдел маркетинга', positions: ['Marketing Manager', 'Content Manager', 'SEO Specialist', 'Marketing Lead', 'Social Media Manager', 'Brand Manager', 'Growth Hacker'] },
  { name: 'Отдел продаж', positions: ['Sales Manager', 'Account Manager', 'Sales Lead', 'Business Development Manager', 'Enterprise Sales', 'Inside Sales Representative'] },
  { name: 'Отдел аналитики', positions: ['Data Analyst', 'Business Analyst', 'Analytics Lead', 'Product Analyst', 'Data Scientist', 'BI Analyst'] },
  { name: 'Отдел поддержки', positions: ['Support Specialist', 'Senior Support', 'Support Lead', 'Technical Support', 'Customer Success Manager', 'Implementation Specialist'] },
  { name: 'Финансовый отдел', positions: ['Accountant', 'Financial Analyst', 'Finance Lead', 'Controller', 'Payroll Specialist', 'Treasury Analyst', 'Risk Manager'] },
  { name: 'HR отдел', positions: ['HR Manager', 'Recruiter', 'HR Lead', 'People Partner', 'Talent Acquisition', 'HR Business Partner', 'Compensation Analyst'] },
  { name: 'Отдел DevOps', positions: ['DevOps Engineer', 'SRE Engineer', 'DevOps Lead', 'Cloud Architect', 'Platform Engineer', 'Infrastructure Engineer'] },
  { name: 'Юридический отдел', positions: ['Legal Counsel', 'Corporate Lawyer', 'Legal Lead', 'Compliance Officer', 'Contract Manager'] },
  { name: 'Отдел продукта', positions: ['Product Manager', 'Senior Product Manager', 'Product Owner', 'Scrum Master', 'Product Director'] },
  { name: 'Отдел безопасности', positions: ['Security Engineer', 'CISO', 'Security Analyst', 'Penetration Tester', 'Security Architect'] },
  { name: 'Отдел мобильной разработки', positions: ['iOS Developer', 'Android Developer', 'Mobile Team Lead', 'Flutter Developer', 'React Native Developer'] },
]

const SKILLS_DATA = [
  'JavaScript', 'TypeScript', 'React', 'Vue.js', 'Angular', 'Node.js', 'Python', 'Java', 'Go', 'C#',
  'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Git', 'CI/CD', 'Linux', 'Nginx',
  'Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'After Effects',
  'Selenium', 'Cypress', 'Jest', 'Playwright',
  'Jira', 'Confluence', 'Slack', 'Agile', 'Scrum',
  'GraphQL', 'REST API', 'Microservices', 'RabbitMQ', 'Kafka',
  'Machine Learning', 'TensorFlow', 'PyTorch', 'Data Science',
  'Swift', 'Kotlin', 'Flutter', 'React Native',
  'Elasticsearch', 'Terraform', 'Ansible', 'Prometheus', 'Grafana',
  'Product Management', 'User Research', 'A/B Testing', 'Analytics',
  'SEO', 'SEM', 'Google Analytics', 'Facebook Ads', 'Content Marketing',
  'Salesforce', 'HubSpot', 'Pardot', 'Marketo',
  'English', 'German', 'French', 'Spanish', 'Chinese',
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
  { name: 'Knowledge Base', full_name: 'Corporate Knowledge Base', description: 'Корпоративная база знаний', status: 'active' },
  { name: 'Time Tracking', full_name: 'Time Tracking System', description: 'Система учёта рабочего времени', status: 'active' },
  { name: 'Helpdesk', full_name: 'IT Helpdesk System', description: 'Система технической поддержки', status: 'active' },
  { name: 'Compliance Monitor', full_name: 'Compliance Monitoring System', description: 'Система мониторинга соответствия', status: 'active' },
  { name: 'Performance Review', full_name: 'Performance Review Platform', description: 'Платформа оценки эффективности', status: 'active' },
  { name: 'Onboarding App', full_name: 'Employee Onboarding Application', description: 'Приложение для адаптации сотрудников', status: 'active' },
  { name: 'Budget Planner', full_name: 'Budget Planning System', description: 'Система планирования бюджета', status: 'active' },
  { name: 'Asset Management', full_name: 'IT Asset Management', description: 'Управление IT-активами', status: 'paused' },
  { name: 'Integration Hub', full_name: 'Integration Hub Platform', description: 'Платформа интеграций', status: 'active' },
  { name: 'Report Generator', full_name: 'Automated Report Generator', description: 'Автоматический генератор отчётов', status: 'active' },
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
      { email: 'anna@example.com', firstName: 'Анна', lastName: 'Петрова', middleName: 'Сергеевна', position: 'Recruiter', isMale: false },
      { email: 'irina@example.com', firstName: 'Ирина', lastName: 'Смирнова', middleName: 'Николаевна', position: 'People Partner', isMale: false },
      { email: 'olga@example.com', firstName: 'Ольга', lastName: 'Волкова', middleName: 'Дмитриевна', position: 'Talent Acquisition', isMale: false },
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

    const fixedUsers = [
      { email: 'ivanov@example.com', firstName: 'Иван', lastName: 'Иванов', middleName: 'Петрович', position: 'Frontend Developer', isMale: true, role: 'employee', deptIndex: 1 },
      { email: 'petrov@example.com', firstName: 'Пётр', lastName: 'Петров', middleName: 'Иванович', position: 'Руководитель разработки', isMale: true, role: 'manager', deptIndex: 1 },
    ]

    const fixedUserResults = []
    for (const fu of fixedUsers) {
      if (emailSet.has(fu.email)) continue
      emailSet.add(fu.email)
      const existing = await query('SELECT id FROM users WHERE email = $1', [fu.email])
      if (existing.rows.length > 0) {
        fixedUserResults.push({ ...fu, id: existing.rows[0].id, departmentId: departments[fu.deptIndex].id })
        continue
      }
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role, manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL) RETURNING id`,
        [fu.email, passwordHash, fu.firstName, fu.lastName, fu.middleName, fu.position, departments[fu.deptIndex].id, randomDate(new Date(2020, 0, 1), new Date(2023, 0, 1)), fu.role]
      )
      fixedUserResults.push({ ...fu, id: result.rows[0].id, departmentId: departments[fu.deptIndex].id })
    }
    users.push(...fixedUserResults)

    if (fixedUserResults.find(u => u.role === 'manager')) {
      const deptId = departments[1].id
      const mgr = fixedUserResults.find(u => u.role === 'manager')
      if (mgr) {
        await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [mgr.id, deptId])
        departments[1].managerId = mgr.id
      }
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

    const employeesPerDept = Math.ceil((150 - 1 - 3 - managers.length) / departments.length)
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
      
      const totalDays = 47
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

    console.log('Creating surveys...')
    const hrUsersList = users.filter(u => u.role === 'hr')
    const surveyIds = []
    let surveysCreated = 0

    const SURVEYS_DATA = [
      {
        title: 'Удовлетворённость условиями работы',
        description: 'Опрос для оценки общего уровня удовлетворённости сотрудников условиями работы в компании.',
        targetType: 'all',
        targetIds: [],
        deadline: '2026-06-30',
        anonymous: true,
        status: 'active',
        questions: [
          { order_index: 1, type: 'scale', text: 'Оцените ваш общий уровень удовлетворённости работой в компании', options: [], scale_min: 1, scale_max: 10, required: true },
          { order_index: 2, type: 'radio', text: 'Как вы оцениваете баланс между работой и личной жизнью?', options: ['Отлично', 'Хорошо', 'Удовлетворительно', 'Плохо', 'Очень плохо'], required: true },
          { order_index: 3, type: 'radio', text: 'Довольны ли вы оборудованием и рабочим местом?', options: ['Полностью доволен', 'Скорее доволен', 'Нейтрально', 'Скорее недоволен', 'Полностью недоволен'], required: true },
          { order_index: 4, type: 'checkbox', text: 'Что бы вы хотели улучшить на рабочем месте?', options: ['Освещение', 'Температура', 'Шумоизоляция', 'Оборудование', 'Переговорные комнаты', 'Зона отдыха', 'Парковка', 'Кухня'], required: false },
          { order_index: 5, type: 'text', text: 'Ваши предложения по улучшению условий работы', options: [], required: false },
        ]
      },
      {
        title: 'Обратная связь по процессу онбординга',
        description: 'Опрос для новых сотрудников о качестве процесса адаптации в компании.',
        targetType: 'employees',
        targetIds: [],
        deadline: '2026-04-15',
        anonymous: false,
        status: 'active',
        questions: [
          { order_index: 1, type: 'radio', text: 'Насколько хорошо вас ознакомили с компанией и культурой в первый день?', options: ['Отлично', 'Хорошо', 'Средне', 'Плохо'], required: true },
          { order_index: 2, type: 'radio', text: 'Был ли назначен вам наставник?', options: ['Да, в первый день', 'Да, через несколько дней', 'Да, через неделю и более', 'Нет'], required: true },
          { order_index: 3, type: 'scale', text: 'Оцените качество вводных материалов и документации', options: [], scale_min: 1, scale_max: 5, required: true },
          { order_index: 4, type: 'checkbox', text: 'Какие аспекты онбординга были наиболее полезны?', options: ['Знакомство с командой', 'Обзор продуктов компании', 'Настройка оборудования', 'Обучение инструментам', 'Знакомство с процессами', 'Менторство'], required: false },
          { order_index: 5, type: 'text', text: 'Что бы вы улучшили в процессе онбординга?', options: [], required: false },
        ]
      },
      {
        title: 'Предпочтения по формату работы',
        description: 'Опрос отдела разработки о предпочтениях между удалённой и офисной работой.',
        targetType: 'department',
        targetIds: [],
        deadline: '2026-05-01',
        anonymous: true,
        status: 'active',
        questions: [
          { order_index: 1, type: 'radio', text: 'Какой формат работы вы предпочитаете?', options: ['Полностью удалённый', 'Гибридный (2-3 дня в офисе)', 'Гибридный (1 день удалённо)', 'Полностью из офиса'], required: true },
          { order_index: 2, type: 'checkbox', text: 'Какие дни вам удобнее работать из офиса?', options: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'], required: false },
          { order_index: 3, type: 'scale', text: 'Оцените продуктивность при работе из дома (1 — очень низкая, 5 — очень высокая)', options: [], scale_min: 1, scale_max: 5, required: true },
          { order_index: 4, type: 'text', text: 'Что мешает вам эффективно работать удалённо?', options: [], required: false },
        ]
      },
      {
        title: 'Оценка корпоративных мероприятий 2025',
        description: 'Обратная связь по прошедшим корпоративным мероприятиям за 2025 год.',
        targetType: 'all',
        targetIds: [],
        deadline: '2025-12-31',
        anonymous: false,
        status: 'closed',
        questions: [
          { order_index: 1, type: 'radio', text: 'Как вы оцениваете новогодний корпоратив?', options: ['Отлично', 'Хорошо', 'Средне', 'Плохо', 'Не посещал'], required: true },
          { order_index: 2, type: 'radio', text: 'Как вы оцениваете летний тимбилдинг?', options: ['Отлично', 'Хорошо', 'Средне', 'Плохо', 'Не посещал'], required: true },
          { order_index: 3, type: 'checkbox', text: 'Какие мероприятия вы посещали?', options: ['Новогодний корпоратив', 'Летний тимбилдинг', 'День рождения компании', 'Спортивные турниры', 'Мастер-классы', 'Благотворительные акции'], required: true },
          { order_index: 4, type: 'scale', text: 'Общая оценка корпоративной культуры', options: [], scale_min: 1, scale_max: 10, required: true },
          { order_index: 5, type: 'text', text: 'Какие мероприятия вы бы хотели видеть в будущем?', options: [], required: false },
        ]
      },
      {
        title: 'Качество внутреннего обучения',
        description: 'Опрос по оценке программ обучения и развития.',
        targetType: 'all',
        targetIds: [],
        deadline: '2026-07-15',
        anonymous: true,
        status: 'closed',
        questions: [
          { order_index: 1, type: 'radio', text: 'Прошли ли вы какие-либо внутренние курсы за последний год?', options: ['Да, несколько', 'Да, один', 'Нет'], required: true },
          { order_index: 2, type: 'scale', text: 'Оцените качество пройденных курсов', options: [], scale_min: 1, scale_max: 5, required: true },
          { order_index: 3, type: 'checkbox', text: 'Какие темы вам были наиболее полезны?', options: ['Технические навыки', 'Мягкие навыки', 'Управление проектами', 'Лидерство', 'Безопасность', 'Продуктовые знания'], required: false },
          { order_index: 4, type: 'text', text: 'Какие темы обучения вы бы хотели видеть в будущем?', options: [], required: false },
        ]
      },
      {
        title: 'Опрос вовлечённости сотрудников (черновик)',
        description: 'Ежеквартальный опрос для измерения уровня вовлечённости.',
        targetType: 'all',
        targetIds: [],
        deadline: null,
        anonymous: true,
        status: 'draft',
        questions: [
          { order_index: 1, type: 'scale', text: 'Насколько вы чувствуете себя частью команды?', options: [], scale_min: 1, scale_max: 10, required: true },
          { order_index: 2, type: 'radio', text: 'Понимаете ли вы, как ваша работа влияет на успех компании?', options: ['Полностью понимаю', 'В общих чертах', 'Слабо понимаю', 'Не понимаю'], required: true },
          { order_index: 3, type: 'radio', text: 'Получаете ли вы достаточно признания за свою работу?', options: ['Да, регулярно', 'Иногда', 'Редко', 'Никогда'], required: true },
          { order_index: 4, type: 'text', text: 'Что может повысить вашу вовлечённость в работу?', options: [], required: false },
        ]
      },
      {
        title: 'Потребности в обучении Q2 2026',
        description: 'Опрос для планирования обучающих программ на второй квартал.',
        targetType: 'all',
        targetIds: [],
        deadline: '2026-04-30',
        anonymous: false,
        status: 'draft',
        questions: [
          { order_index: 1, type: 'checkbox', text: 'В каких направлениях вы хотели бы развиваться?', options: ['Программирование', 'Управление', 'Дизайн', 'Аналитика', 'DevOps', 'Soft skills', 'Безопасность', 'Mobile'], required: true },
          { order_index: 2, type: 'radio', text: 'Предпочтительный формат обучения?', options: ['Онлайн-курсы', 'Вебинары', 'Очные тренинги', 'Менторство', 'Самостоятельное изучение'], required: true },
          { order_index: 3, type: 'text', text: 'Укажите конкретные курсы или темы, которые вас интересуют', options: [], required: false },
        ]
      },
    ]

    const devDept = departments.find(d => d.name === 'Отдел разработки')
    const recentHires = users.filter(u => u.role === 'employee').slice(-10)

    for (let i = 0; i < SURVEYS_DATA.length; i++) {
      const sd = SURVEYS_DATA[i]
      const existing = await query('SELECT id FROM surveys WHERE title = $1', [sd.title])
      if (existing.rows.length > 0) {
        surveyIds.push({ id: existing.rows[0].id, status: sd.status, ...sd })
        continue
      }

      let targetIds = sd.targetIds
      if (sd.targetType === 'department' && devDept) {
        targetIds = [devDept.id]
      } else if (sd.targetType === 'employees') {
        targetIds = recentHires.slice(0, 5).map(u => u.id)
      }

      const creator = randomItem(hrUsersList)
      const result = await query(
        `INSERT INTO surveys (title, description, created_by, target_type, target_ids, deadline, anonymous, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [sd.title, sd.description, creator.id, sd.targetType, JSON.stringify(targetIds), sd.deadline, sd.anonymous, sd.status, new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000).toISOString()]
      )
      const surveyId = result.rows[0].id

      for (const q of sd.questions) {
        await query(
          `INSERT INTO survey_questions (survey_id, order_index, type, text, options, scale_min, scale_max, required)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [surveyId, q.order_index, q.type, q.text, JSON.stringify(q.options), q.scale_min || 1, q.scale_max || 5, q.required]
        )
      }

      surveyIds.push({ id: surveyId, status: sd.status, ...sd })
      surveysCreated++
    }
    console.log(`  ✓ ${surveysCreated} surveys created`)

    console.log('Creating survey responses and answers...')
    let responsesCreated = 0
    let answersCreated = 0

    for (const survey of surveyIds) {
      if (survey.status === 'draft') continue

      const questionRows = await query('SELECT id, type, options, scale_min, scale_max FROM survey_questions WHERE survey_id = $1 ORDER BY order_index', [survey.id])
      if (questionRows.rows.length === 0) continue

      const respondentCount = survey.status === 'closed' ? randomInt(8, 15) : randomInt(3, 8)
      let respondents

      if (survey.targetType === 'all') {
        respondents = [...users].filter(u => u.role !== 'admin').sort(() => Math.random() - 0.5).slice(0, respondentCount)
      } else if (survey.targetType === 'department' && devDept) {
        respondents = users.filter(u => u.departmentId === devDept.id).sort(() => Math.random() - 0.5).slice(0, respondentCount)
      } else {
        respondents = recentHires.slice(0, Math.min(respondentCount, recentHires.length))
      }

      for (const respondent of respondents) {
        const existingResp = await query(
          'SELECT id FROM survey_responses WHERE survey_id = $1 AND user_id = $2',
          [survey.id, respondent.id]
        )
        if (existingResp.rows.length > 0) continue

        const respResult = await query(
          `INSERT INTO survey_responses (survey_id, user_id, submitted_at) VALUES ($1, $2, $3) RETURNING id`,
          [survey.id, survey.anonymous ? null : respondent.id, new Date(Date.now() - randomInt(0, 14) * 24 * 60 * 60 * 1000).toISOString()]
        )
        const responseId = respResult.rows[0].id
        responsesCreated++

        for (const question of questionRows.rows) {
          let value = null
          let values = null

          if (question.type === 'radio') {
            const opts = question.options || []
            if (opts.length > 0) value = randomItem(opts)
          } else if (question.type === 'checkbox') {
            const opts = question.options || []
            if (opts.length > 0) {
              const count = randomInt(1, Math.min(3, opts.length))
              const shuffled = [...opts].sort(() => Math.random() - 0.5)
              values = shuffled.slice(0, count)
            }
          } else if (question.type === 'scale') {
            value = String(randomInt(question.scale_min, question.scale_max))
          } else if (question.type === 'text') {
            if (Math.random() > 0.4) {
              const textAnswers = [
                'Всё устраивает, продолжайте в том же духе.',
                'Хотелось бы больше неформального общения с коллегами.',
                'Нужно улучшить документацию по внутренним процессам.',
                'Отличная работа команды HR, спасибо!',
                'Было бы здорово добавить больше гибкости в график.',
                'Рекомендую добавить регулярные встречи один на один с руководителем.',
                'Хотелось бы видеть больше прозрачности в карьерном росте.',
                'Неплохо, но есть куда расти.',
              ]
              value = randomItem(textAnswers)
            }
          }

          if (value || values) {
            await query(
              `INSERT INTO survey_answers (response_id, question_id, value, values) VALUES ($1, $2, $3, $4)`,
              [responseId, question.id, value, values ? JSON.stringify(values) : null]
            )
            answersCreated++
          }
        }
      }
    }
    console.log(`  ✓ ${responsesCreated} survey responses, ${answersCreated} answers created`)

    console.log('\n✅ Comprehensive seed completed successfully!')
    console.log('\nSummary:')
    console.log(`  Departments: ${departments.length}`)
    console.log(`  Users: ${users.length} (1 admin, ${hrUsersList.length} HR, ${managers.length} managers, ${users.length - 1 - hrUsersList.length - managers.length} employees)`)
    console.log(`  Projects: ${projects.length}`)
    console.log(`  Skills in dictionary: ${SKILLS_DATA.length}`)
    console.log(`  Vacation requests: ${requestsCreated}`)
    console.log(`  Vacation restrictions: ${restrictionsCreated}`)
    console.log(`  Surveys: ${surveysCreated}`)
    console.log(`  Survey responses: ${responsesCreated}`)
    console.log('\nLogin credentials:')
    console.log('  admin@example.com (admin)')
    console.log('  ivanov@example.com (employee)')
    console.log('  petrov@example.com (manager)')
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
