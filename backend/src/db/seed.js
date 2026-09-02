import { query } from '../config/database.js'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { runMigrations } from './migrate.js'

dotenv.config()

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

const FIRST_NAMES_M = [
  'Александр','Алексей','Андрей','Борис','Вадим','Валерий','Василий','Виктор','Виталий','Владимир','Владислав','Геннадий','Георгий','Дмитрий','Евгений','Игорь','Илья','Кирилл','Константин','Максим','Михаил','Никита','Николай','Олег','Павел','Роман','Руслан','Сергей','Станислав','Тимофей','Фёдор','Юрий','Ярослав',
]
const FIRST_NAMES_F = [
  'Алина','Алина','Анастасия','Анна','Вера','Виктория','Галина','Дарья','Ева','Екатерина','Елена','Ирина','Карина','Ксения','Лариса','Марина','Мария','Наталья','Ольга','Полина','Светлана','Тамара','Татьяна','Юлия',
]
const LAST_NAMES_M = [
  'Абрамов','Аксёнов','Алексеев','Андреев','Антипов','Баранов','Белов','Беляев','Борисов','Васильев','Волков','Воробьёв','Григорьев','Гусев','Данилов','Демидов','Егоров','Ефимов','Зайцев','Захаров','Зуев','Иванов','Ильин','Калинин','Козлов','Колесников','Комаров','Коновалов','Копылов','Кузнецов','Куликов','Лебедев','Лебедев','Макаров','Мельников','Морозов','Москов','Никонов','Новиков','Орлов','Павлов','Пономарёв','Попов','Прохоров','Романов','Савельев','Сергеев','Сидоров','Смирнов','Соколов','Сорокин','Тарасов','Титов','Фёдоров','Филиппов','Фролов','Харитонов','Чернов','Шарипов','Шевченко','Ширяев','Щербаков','Яковлев',
]
const LAST_NAMES_F = [
  'Абрамова','Аксёнова','Алексеева','Андреева','Антонова','Белова','Беляева','Борисова','Васильева','Волкова','Воробьёва','Григорьева','Гусева','Данилова','Демидова','Егорова','Ефимова','Зайцева','Захарова','Зуева','Иванова','Ильина','Калинина','Козлова','Колесникова','Комарова','Коновалова','Кузнецова','Куликова','Лебедева','Макарова','Морозова','Москвина','Никонова','Новикова','Орлова','Павлова','Попова','Романова','Сергеева','Сидорова','Смирнова','Соколова','Тарасова','Титова','Фёдорова','Филиппова','Фролова','Чернова','Шевченко','Щербакова','Яковлева',
]
const MIDDLE_PATRONYMIC_ENDINGS_M = ['ович','еевич','евич','ьевич']
const MIDDLE_PATRONYMIC_ENDINGS_F = ['овна','евна','евна','инична']

function generatePatronymic(gender) {
  const endings = gender === 'F' ? MIDDLE_PATRONYMIC_ENDINGS_F : MIDDLE_PATRONYMIC_ENDINGS_M
  const bases = ['Александр','Андрей','Борис','Виктор','Владимир','Дмитрий','Евгений','Иван','Игорь','Михаил','Николай','Павел','Сергей']
  return bases[Math.floor(Math.random() * bases.length)].replace(/.$/, endings[Math.floor(Math.random() * endings.length)])
}

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

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const TRANSLIT_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}

function translit(str) {
  return [...str].map(ch => TRANSLIT_MAP[ch] ?? ch).join('')
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDate(start, end) {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
  return date.toISOString().split('T')[0]
}

async function seed() {
  try {
    console.log('Running migrations...')
    await runMigrations()
    console.log('Starting seed...')

    const statusResult = await query('SELECT id, code FROM request_statuses')
    const statusMap = Object.fromEntries(statusResult.rows.map(r => [r.code, r.id]))

    const typeResult = await query('SELECT id, code FROM vacation_types')
    const typeMap = Object.fromEntries(typeResult.rows.map(r => [r.code, r.id]))

    console.log('Creating skills dictionary...')
    for (const skill of SKILLS_DATA) {
      const existing = await query('SELECT id FROM skills_dictionary WHERE name = $1', [skill])
      if (existing.rows.length > 0) {
        continue
      }
      await query('INSERT INTO skills_dictionary (name) VALUES ($1) RETURNING id', [skill])
    }
    console.log(`  ✓ ${SKILLS_DATA.length} skills in dictionary`)

    console.log('Creating departments...')
    for (const deptData of DEPARTMENTS_DATA) {
      const existing = await query('SELECT id FROM departments WHERE name = $1', [deptData.name])
      if (existing.rows.length > 0) {
        continue
      }
      await query('INSERT INTO departments (name, manager_id, organization_id) VALUES ($1, NULL, 1)', [deptData.name])
    }
    console.log(`  ✓ ${DEPARTMENTS_DATA.length} departments`)

    console.log('Creating test organizations...')
    await query(`
      INSERT INTO organizations (name, slug, inn, is_active)
      VALUES ('ГКУ СО ЦРЦТ', 'crct', '6511000001', true)
      ON CONFLICT (slug) DO NOTHING
    `)
    await query(`
      INSERT INTO organizations (name, slug, inn, is_active)
      VALUES ('Минцифры Сахалинской области', 'mindit', '6501000001', true)
      ON CONFLICT (slug) DO NOTHING
    `)
    const crctOrg = await query("SELECT id FROM organizations WHERE slug = 'crct'")
    const minditOrg = await query("SELECT id FROM organizations WHERE slug = 'mindit'")
    const crctId = crctOrg.rows[0]?.id || 1
    const minditId = minditOrg.rows[0]?.id || 2
    console.log(`  ✓ test organizations (crct=${crctId}, mindit=${minditId})`)

    console.log('Creating test users...')
    const passwordHash = await bcrypt.hash('password123', 10)
    const depts = await query('SELECT id, name FROM departments ORDER BY id')
    const deptMap = Object.fromEntries(depts.rows.map(d => [d.name, d.id]))
    const devDept = deptMap['Отдел разработки'] || depts.rows[0]?.id
    const hrDept = deptMap['HR отдел'] || depts.rows[0]?.id

    const FIXED_USERS = [
      { email: 'admin@example.com', firstName: 'Админ', lastName: 'Системы', middleName: '', position: 'System Administrator', role: 'admin', deptId: devDept },
      { email: 'superadmin@example.com', firstName: 'Супер', lastName: 'Админ', middleName: 'Глобальный', position: 'Super Administrator', role: 'superadmin', deptId: devDept },
      { email: 'ivanov@example.com', firstName: 'Иван', lastName: 'Иванов', middleName: 'Иванович', position: 'Senior Backend Developer', role: 'employee', deptId: devDept },
      { email: 'petrov@example.com', firstName: 'Пётр', lastName: 'Петров', middleName: 'Петрович', position: 'Middle Frontend Developer', role: 'manager', deptId: devDept },
      { email: 'elena@example.com', firstName: 'Елена', lastName: 'Смирнова', middleName: 'Александровна', position: 'HR Manager', role: 'hr', deptId: hrDept },
      { email: 'volkov@crct.ru', firstName: 'Дмитрий', lastName: 'Волков', middleName: 'Сергеевич', position: 'Руководитель отдела ИТ', role: 'manager', deptId: devDept },
      { email: 'morozova@crct.ru', firstName: 'Ольга', lastName: 'Морозова', middleName: 'Викторовна', position: 'Ведущий специалист', role: 'employee', deptId: devDept },
      { email: 'kuznetsov@crct.ru', firstName: 'Алексей', lastName: 'Кузнецов', middleName: 'Игоревич', position: 'Системный администратор', role: 'employee', deptId: devDept },
      { email: 'zaitseva@crct.ru', firstName: 'Наталья', lastName: 'Зайцева', middleName: 'Александровна', position: 'HR-менеджер', role: 'hr', deptId: hrDept },
      { email: 'orlova@mindit.ru', firstName: 'Мария', lastName: 'Орлова', middleName: 'Анатольевна', position: 'Администратор системы', role: 'admin', deptId: devDept },
      { email: 'fedorov@mindit.ru', firstName: 'Сергей', lastName: 'Фёдоров', middleName: 'Николаевич', position: 'HR-директор', role: 'hr', deptId: hrDept },
      { email: 'belova@mindit.ru', firstName: 'Анна', lastName: 'Белова', middleName: 'Дмитриевна', position: 'Начальник отдела', role: 'manager', deptId: devDept },
      { email: 'sidorov@mindit.ru', firstName: 'Михаил', lastName: 'Сидоров', middleName: 'Петрович', position: 'Инженер', role: 'employee', deptId: devDept },
    ]

    for (const u of FIXED_USERS) {
      const existing = await query('SELECT id FROM users WHERE email = $1', [u.email])
      if (existing.rows.length > 0) {
        await query('UPDATE users SET password_hash = $1 WHERE email = $2', [passwordHash, u.email])
        continue
      }
      await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '2023-01-15', $8)`,
        [u.email, passwordHash, u.firstName, u.lastName, u.middleName || '', u.position, u.deptId, u.role]
      )
    }

    const BULK_COUNT = 180
    const existingEmails = new Set(FIXED_USERS.map(u => u.email))
    const emailsFromDb = await query("SELECT email FROM users WHERE email LIKE '%@example.com'")
    for (const row of emailsFromDb.rows) existingEmails.add(row.email)

    const deptNames = DEPARTMENTS_DATA.map(d => d.name)
    let created = 0
    const hireStart = new Date('2019-01-01')
    const hireEnd = new Date('2024-06-01')

    for (let i = 0; i < BULK_COUNT; i++) {
      const gender = Math.random() < 0.45 ? 'F' : 'M'
      const firstName = gender === 'M' ? randomItem(FIRST_NAMES_M) : randomItem(FIRST_NAMES_F)
      const lastName = gender === 'M' ? randomItem(LAST_NAMES_M) : randomItem(LAST_NAMES_F)
      const middleName = generatePatronymic(gender)
      const deptName = randomItem(deptNames)
      const deptPositions = DEPARTMENTS_DATA.find(d => d.name === deptName)?.positions || ['Сотрудник']
      const position = randomItem(deptPositions)
      const deptId = deptMap[deptName] || depts.rows[0]?.id

      const emailBase = translit(`${firstName.toLowerCase()}.${lastName.toLowerCase()}`).replace(/\s+/g, '')
      let email = `${emailBase}@example.com`
      let suffix = 2
      while (existingEmails.has(email)) {
        email = `${emailBase}${suffix}@example.com`
        suffix++
      }
      existingEmails.add(email)

      const hireDate = randomDate(hireStart, hireEnd)
      const roles = ['employee', 'employee', 'employee', 'employee', 'manager']
      const role = randomItem(roles)

      await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [email, passwordHash, firstName, lastName, middleName, position, deptId, hireDate, role]
      )
      created++
    }
    console.log(`  ✓ ${FIXED_USERS.length} fixed users + ${created} generated users (${FIXED_USERS.length + created} total, password: password123)`)

    const uoResult = await query(`
      INSERT INTO user_organizations (user_id, org_id, org_role, is_active)
      SELECT u.id, 1,
        CASE u.role
          WHEN 'employee' THEN 'employee'::org_role_enum
          WHEN 'manager' THEN 'manager'::org_role_enum
          WHEN 'hr' THEN 'hr'::org_role_enum
          WHEN 'admin' THEN 'admin'::org_role_enum
          WHEN 'director' THEN 'admin'::org_role_enum
          WHEN 'superadmin' THEN 'admin'::org_role_enum
          ELSE 'employee'::org_role_enum
        END,
        true
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM user_organizations uo WHERE uo.user_id = u.id AND uo.org_id = 1
      )
      RETURNING user_id
    `)
    console.log(`  ✓ ${uoResult.rows.length} user_organizations entries`)

    const adminUser = await query("SELECT id FROM users WHERE email = 'admin@example.com'")
    const petrovUser = await query("SELECT id FROM users WHERE email = 'petrov@example.com'")
    if (adminUser.rows.length > 0) {
      await query(`
        INSERT INTO user_organizations (user_id, org_id, org_role, is_active)
        VALUES ($1, $2, 'hr', true)
        ON CONFLICT (user_id, org_id) DO UPDATE SET org_role = EXCLUDED.org_role, is_active = true
      `, [adminUser.rows[0].id, minditId]).catch(() => {})
    }
    if (petrovUser.rows.length > 0) {
      await query(`
        INSERT INTO user_organizations (user_id, org_id, org_role, is_active)
        VALUES ($1, $2, 'manager', true)
        ON CONFLICT (user_id, org_id) DO UPDATE SET org_role = EXCLUDED.org_role, is_active = true
      `, [petrovUser.rows[0].id, minditId]).catch(() => {})
    }
    console.log('  ✓ cross-org memberships (admin→mindit hr, petrov→mindit manager)')

    const ORG_USERS = [
      { email: 'volkov@crct.ru', orgId: crctId, orgRole: 'manager' },
      { email: 'morozova@crct.ru', orgId: crctId, orgRole: 'employee' },
      { email: 'kuznetsov@crct.ru', orgId: crctId, orgRole: 'employee' },
      { email: 'zaitseva@crct.ru', orgId: crctId, orgRole: 'hr' },
      { email: 'orlova@mindit.ru', orgId: minditId, orgRole: 'admin' },
      { email: 'fedorov@mindit.ru', orgId: minditId, orgRole: 'hr' },
      { email: 'belova@mindit.ru', orgId: minditId, orgRole: 'manager' },
      { email: 'sidorov@mindit.ru', orgId: minditId, orgRole: 'employee' },
    ]
    for (const ou of ORG_USERS) {
      const u = await query('SELECT id FROM users WHERE email = $1', [ou.email])
      if (u.rows.length > 0) {
        await query(`
          INSERT INTO user_organizations (user_id, org_id, org_role, is_active)
          VALUES ($1, $2, $3::org_role_enum, true)
          ON CONFLICT (user_id, org_id) DO UPDATE SET org_role = EXCLUDED.org_role, is_active = true
        `, [u.rows[0].id, ou.orgId, ou.orgRole]).catch(() => {})
      }
    }
    console.log(`  ✓ ${ORG_USERS.length} org-scoped users (crct + mindit)`)

    await query(`
      UPDATE user_organizations SET is_primary = true
      WHERE id IN (
        SELECT DISTINCT ON (user_id) id
        FROM user_organizations
        WHERE is_active = true AND user_id NOT IN (
          SELECT user_id FROM user_organizations WHERE is_primary = true
        )
        ORDER BY user_id, created_at ASC
      )
    `)
    console.log('  ✓ user_organizations is_primary set')

    console.log('Creating vacation balances...')
    const allUsers = await query('SELECT id, hire_date FROM users ORDER BY id')
    let balancesCreated = 0
    for (const u of allUsers.rows) {
      const existing = await query('SELECT id FROM vacation_balances WHERE user_id = $1', [u.id])
      if (existing.rows.length > 0) continue
      const totalDays = randomItem([28, 28, 28, 28, 30, 35])
      const usedDays = randomInt(0, totalDays)
      await query(
        `INSERT INTO vacation_balances (user_id, total_days, used_days, available_days, reserved_days, last_accrual_date)
         VALUES ($1, $2, $3, $4, 0, CURRENT_DATE)`,
        [u.id, totalDays, usedDays, totalDays - usedDays]
      )
      balancesCreated++
    }
    console.log(`  ✓ ${balancesCreated} vacation balances`)

    console.log('Creating vacation requests...')
    const managers = (await query("SELECT id FROM users WHERE role IN ('manager', 'admin', 'hr') ORDER BY id")).rows
    const typeIdAnnual = typeMap['annual_paid']
    const statusApproved = statusMap['approved']
    const statusOnApproval = statusMap['on_approval']
    const statusRejected = statusMap['rejected']
    const statusCancelled = statusMap['cancelled_by_employee']

    let requestsCreated = 0
    const yearStart = new Date('2025-01-01')
    const yearEnd = new Date('2025-12-31')

    for (const u of allUsers.rows) {
      const reqCount = randomInt(0, 3)
      for (let j = 0; j < reqCount; j++) {
        const start = randomDate(yearStart, yearEnd)
        const duration = randomItem([7, 7, 14, 14, 21, 28])
        const endDate = new Date(new Date(start).getTime() + (duration - 1) * 86400000)
        const statusRoll = Math.random()
        let statusId
        if (statusRoll < 0.55) statusId = statusApproved
        else if (statusRoll < 0.75) statusId = statusOnApproval
        else if (statusRoll < 0.88) statusId = statusRejected
        else statusId = statusCancelled

        const reviewer = statusId !== statusOnApproval ? randomItem(managers).id : null
        const reviewedAt = statusId !== statusOnApproval ? new Date().toISOString() : null

        const result = await query(
          `INSERT INTO vacation_requests
             (user_id, start_date, end_date, duration, vacation_type_id, status_id, reviewed_at, reviewed_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [u.id, start, endDate.toISOString().split('T')[0], duration, typeIdAnnual, statusId, reviewedAt, reviewer, new Date(Date.now() - randomInt(1, 90) * 86400000).toISOString()]
        )

        const requestId = result.rows[0].id
        await query(
          `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, changed_at)
           VALUES ($1, $2, $3, $4)`,
          [requestId, statusId, u.id, new Date().toISOString()]
        )
        requestsCreated++
      }
    }
    console.log(`  ✓ ${requestsCreated} vacation requests`)

    console.log('Creating company projects...')
    const PROJECT_NAMES = [
      'Миграция на микросервисы', 'Внедрение CI/CD', 'Редизайн корпоративного портала',
      'Внедрение системы мониторинга', 'Разработка мобильного приложения',
      'Автоматизация HR-процессов', 'Интеграция с 1С', 'Внедрение Docker',
      'Миграция базы данных', 'Создание API-шлюза', 'Внедрение OAuth 2.0',
      'Разработка дашбордов аналитики', 'Оптимизация производительности',
      'Внедрение Kubernetes', 'Разработка системы документооборота',
      'Создание тестовой среды', 'Внедрение Sentry', 'Миграция на TypeScript',
      'Разработка чат-бота', 'Внедрение ELK Stack',
    ]
    const PROJECT_DESCRIPTIONS = [
      'Переход от монолитной архитектуры к микросервисам для улучшения масштабируемости.',
      'Настройка автоматической сборки и деплоя через GitLab CI.',
      'Обновление UI/UX корпоративного портала с использованием нового дизайн-сайта.',
      'Внедрение Prometheus + Grafana для мониторинга инфраструктуры.',
      'Кросс-платформенное приложение для сотрудников на React Native.',
      'Автоматизация процесса онбординга и адаптации новых сотрудников.',
      'Двусторонний обмен данными между системой и бухгалтерией 1С.',
      'Контейнеризация всех сервисов и настройка Docker Compose для разработки.',
      'Переход с PostgreSQL 13 на 16 версию с минимальным простоем.',
      'Единая точка входа для всех API-запросов через Nginx + JWT.',
      'Внедрение единого входа через Keycloak для всех сервисов.',
      'Интерактивные дашборды для руководства на базе аналитических данных.',
      'Профилирование и оптимизация медленных SQL-запросов и API-эндпоинтов.',
      'Развертывание оркестрации контейнеров в продакшн-среде.',
      'Электронный документооборот с подписанием и маршрутизацией.',
      'Изолированная тестовая среда с генерацией фиктивных данных.',
      'Сбор и анализ ошибок в реальном времени через Sentry.',
      'Постепенная миграция фронтенда с JavaScript на TypeScript.',
      'Telegram-бот для уведомлений и быстрых запросов к системе.',
      'Централизованный сбор логов через Elasticsearch, Logstash, Kibana.',
    ]
    const PROJECT_STATUSES = ['active', 'active', 'active', 'completed', 'paused']

    const managersAndAdmins = (await query("SELECT id FROM users WHERE role IN ('manager', 'admin', 'hr') ORDER BY id")).rows
    const allUserIds = (await query('SELECT id FROM users ORDER BY id')).rows.map(r => r.id)
    const existingProjects = await query('SELECT name FROM company_projects')
    const existingProjectNames = new Set(existingProjects.rows.map(r => r.name))

    let projectsCreated = 0
    const projectStart = new Date('2023-01-01')
    const projectEnd = new Date('2025-06-01')
    const MEMBER_ROLES = ['lead', 'lead', 'developer', 'developer', 'developer', 'tester', 'designer', 'analyst']

    for (let i = 0; i < PROJECT_NAMES.length; i++) {
      if (existingProjectNames.has(PROJECT_NAMES[i])) continue
      const status = randomItem(PROJECT_STATUSES)
      const startDate = randomDate(projectStart, projectEnd)
      const endDate = status === 'completed' ? randomDate(new Date(startDate), projectEnd) : null
      const createdBy = randomItem(managersAndAdmins).id

      const result = await query(
        `INSERT INTO company_projects (name, description, status, start_date, end_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [PROJECT_NAMES[i], PROJECT_DESCRIPTIONS[i], status, startDate, endDate, createdBy]
      )
      const projectId = result.rows[0].id

      const memberCount = randomInt(3, 8)
      const memberIds = new Set()
      while (memberIds.size < memberCount) {
        memberIds.add(randomItem(allUserIds))
      }
      const members = [...memberIds]
      members[0] = createdBy
      for (const userId of members) {
        const role = userId === createdBy ? 'lead' : randomItem(MEMBER_ROLES)
        await query(
          `INSERT INTO company_project_members (project_id, user_id, role, joined_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [projectId, userId, role, new Date(Date.now() - randomInt(1, 365) * 86400000).toISOString()]
        )
      }
      projectsCreated++
    }
    console.log(`  ✓ ${projectsCreated} company projects with members`)

    console.log('Creating personal projects for users...')
    const PERSONAL_PROJECT_NAMES = [
      'Внутренний портал', 'CRM-система', 'Сайт компании', 'Мобильное приложение',
      'API интеграция', 'Рефакторинг модуля', 'Дизайн-система', 'База знаний',
      'Система отчётности', 'Биллинг', 'Личный кабинет', 'Админ-панель',
      'Telegram-бот', 'Email-рассылки', 'Система поиска', 'Аналитика',
    ]
    const PERSONAL_ROLES = ['Developer', 'Tech Lead', 'Architect', 'QA Engineer', 'Fullstack Developer', 'Backend Developer', 'Frontend Developer', 'DevOps Engineer']

    let personalCreated = 0
    for (const userId of allUserIds) {
      const count = randomInt(0, 3)
      for (let j = 0; j < count; j++) {
        const name = randomItem(PERSONAL_PROJECT_NAMES)
        const role = randomItem(PERSONAL_ROLES)
        const status = randomItem(PROJECT_STATUSES)
        const startDate = randomDate(projectStart, projectEnd)
        const endDate = status === 'completed' ? randomDate(new Date(startDate), projectEnd) : null
        await query(
          `INSERT INTO projects (user_id, name, role, status, start_date, end_date)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, name, role, status, startDate, endDate]
        )
        personalCreated++
      }
    }
    console.log(`  ✓ ${personalCreated} personal projects`)

    console.log('\n✅ Seed completed successfully!')
    console.log('\nSummary:')
    console.log(`  Departments: ${DEPARTMENTS_DATA.length}`)
    console.log(`  Skills in dictionary: ${SKILLS_DATA.length}`)
    console.log(`  Total users: ${FIXED_USERS.length + created}`)
    console.log(`  Vacation balances: ${balancesCreated}`)
    console.log(`  Vacation requests: ${requestsCreated}`)
    console.log(`  Company projects: ${projectsCreated}`)
    console.log(`  Personal projects: ${personalCreated}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Seed error:', error)
    process.exit(1)
  }
}

seed()
