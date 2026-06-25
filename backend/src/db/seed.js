import { query } from '../config/database.js'
import dotenv from 'dotenv'

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDate(start, end) {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
  return date.toISOString().split('T')[0]
}

async function seed() {
  try {
    console.log('Starting seed (Keycloak mode — users managed externally)...')

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
      await query('INSERT INTO departments (name, manager_id) VALUES ($1, NULL)', [deptData.name])
    }
    console.log(`  ✓ ${DEPARTMENTS_DATA.length} departments`)


    console.log('\n✅ Seed completed successfully!')
    console.log('\nSummary:')
    console.log(`  Departments: ${DEPARTMENTS_DATA.length}`)
    console.log(`  Skills in dictionary: ${SKILLS_DATA.length}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Seed error:', error)
    process.exit(1)
  }
}

seed()
