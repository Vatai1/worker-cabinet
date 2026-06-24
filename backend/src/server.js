import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import cookieParser from 'cookie-parser'
import { swaggerSpec } from './config/swagger.js'
import authRoutes from './routes/auth.js'
import vacationRoutes from './routes/vacation.js'
import userRoutes from './routes/users.js'

import projectsRoutes from './routes/projects.js'
import documentsRoutes from './routes/documents.js'
import userDocumentsRoutes from './routes/userDocuments.js'
import departmentsRoutes from './routes/departments.js'
import surveysRoutes from './routes/surveys.js'
import onboardingRoutes from './routes/onboarding.js'
import hierarchyRoutes from './routes/hierarchy.js'
import dictionariesRoutes from './routes/dictionaries.js'
import timesheetRoutes from './routes/timesheet.js'
import calendarRoutes from './routes/calendar.js'
import notificationsRoutes from './routes/notifications.js'
import adminRoutes from './routes/admin.js'
import assistantRoutes from './routes/assistant.js'
import { scheduleTimesheetCron } from './cron/timesheetCron.js'
import { runMigrations } from './db/migrate.js'
import { errorHandler } from './middleware/errors.js'
import * as rabbitmq from './config/rabbitmq.js'
import { generateCsrfToken, csrfMiddleware } from './middleware/csrf.js'
import bcrypt from 'bcryptjs'
import { query } from './config/database.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables')
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 5000

app.set('trust proxy', 1)

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:57173',
      'http://localhost:8080',
      'http://localhost',
      'http://localhost:80',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:8080',
      'http://host.docker.internal:5000',
      process.env.FRONTEND_URL,
    ].filter(Boolean)
    if (!origin || allowed.includes(origin) || /^https?:\/\/[\d.]+(:\d+)?$/.test(origin) || /^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?$/.test(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(generateCsrfToken)

// CSRF protection for mutating API requests (safe methods exempt)
app.use('/api', csrfMiddleware)

if (process.env.NODE_ENV !== 'production') {
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec))
  app.get('/api-docs', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'api-docs.html'))
  })
}

app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress
  console.log(`${req.method} ${req.path} - ${ip}`)
  next()
})

app.use('/api/auth', authRoutes)
app.use('/api/vacation', vacationRoutes)
app.use('/api/users', userRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/documents', documentsRoutes)
app.use('/api/user-documents', userDocumentsRoutes)
app.use('/api/departments', departmentsRoutes)
app.use('/api/surveys', surveysRoutes)
app.use('/api/onboarding', onboardingRoutes)
app.use('/api/hierarchy', hierarchyRoutes)
app.use('/api/dictionaries', dictionariesRoutes)
app.use('/api/timesheet', timesheetRoutes)
app.use('/api/calendar', calendarRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/assistant', assistantRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/modules', async (req, res) => {
  try {
    const { query } = await import('./config/database.js')
    const result = await query('SELECT code, is_enabled FROM modules ORDER BY sort_order')
    const enabled = result.rows.filter(r => r.is_enabled).map(r => r.code)
    res.json({ modules: result.rows, enabled })
  } catch {
    res.json({ modules: [], enabled: [] })
  }
})

app.get('/api/settings/public', async (req, res) => {
  try {
    const { query } = await import('./config/database.js')
    const result = await query(
      "SELECT key, value FROM system_settings WHERE key LIKE 'login_%' OR key = 'company_name'"
    )
    const settings = {}
    for (const row of result.rows) {
      settings[row.key] = row.value
    }
    res.json(settings)
  } catch {
    res.json({})
  }
})

app.use(errorHandler)

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

// Run database migrations on startup
try {
  await runMigrations()
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exit(1)
}

async function ensureAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL || 'admin@example.com'
    const password = process.env.ADMIN_PASSWORD || 'admin123'
    const existing = await query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length === 0) {
      const passwordHash = await bcrypt.hash(password, 10)
      const deptResult = await query('SELECT id FROM departments ORDER BY id LIMIT 1')
      const deptId = deptResult.rows[0]?.id || null
      await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, position, department_id, hire_date, role)
         VALUES ($1, $2, 'Администратор', 'Системы', '', 'System Administrator', $3, NOW(), 'admin')`,
        [email, passwordHash, deptId]
      )
      console.log(`✅ Admin account created: ${email} / ${password}`)
    }
  } catch (err) {
    console.warn(`[ADMIN] Could not ensure admin account: ${err.message}`)
  }
}

await ensureAdmin()

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV}`)
  scheduleTimesheetCron()

  if (process.env.RABBITMQ_URL) {
    try {
      await rabbitmq.connect()
    } catch (err) {
      console.warn(`[RABBITMQ] Connection failed: ${err.message}. Publishing disabled.`)
    }
  } else {
    console.warn('[RABBITMQ] RABBITMQ_URL not set. Publishing disabled.')
  }
})
