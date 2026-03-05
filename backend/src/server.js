import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import vacationRoutes from './routes/vacation.js'
import userRoutes from './routes/users.js'
import telegramRoutes from './routes/telegram.js'
import notificationsRoutes from './routes/notifications.js'
import projectsRoutes from './routes/projects.js'
import documentsRoutes from './routes/documents.js'
import userDocumentsRoutes from './routes/userDocuments.js'
import analyticsRoutes from './routes/analytics.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:57173',
    'http://localhost:8080', // OnlyOffice Document Server
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:8080',
    '*',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/vacation', vacationRoutes)
app.use('/api/users', userRoutes)
app.use('/api/telegram', telegramRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/documents', documentsRoutes)
app.use('/api/user-documents', userDocumentsRoutes)
app.use('/api/analytics', analyticsRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  })
})

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV}`)
})
