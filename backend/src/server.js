import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
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
import { errorHandler } from './middleware/errors.js'
import * as rabbitmq from './config/rabbitmq.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables')
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:57173',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:8080',
      'http://host.docker.internal:5000',
      process.env.FRONTEND_URL,
    ].filter(Boolean)
    if (!origin || allowed.includes(origin) || /^http:\/\/172\.\d+\.\d+\.\d+:3000$/.test(origin)) {
      callback(null, true)
    } else {
      callback(null, true)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
