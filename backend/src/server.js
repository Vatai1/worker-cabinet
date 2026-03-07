import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import vacationRoutes from './routes/vacation.js'
import userRoutes from './routes/users.js'
import log from './utils/logger.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:57173', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', '*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use((req, res, next) => {
  const start = Date.now()
  
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.connection?.remoteAddress ||
             req.socket?.remoteAddress ||
             req.ip ||
             'unknown'
  
  log.info('HTTP', `--> ${req.method} ${req.originalUrl}`, {
    ip,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    contentType: req.headers['content-type'],
    body: req.method !== 'GET' ? req.body : undefined,
  })
  
  const originalSend = res.send
  res.send = function (data) {
    const duration = Date.now() - start
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m'
    
    log.info('HTTP', `<-- ${req.method} ${req.originalUrl}`, {
      ip,
      status: res.statusCode,
      duration: `${duration}ms`,
      responseSize: typeof data === 'string' ? `${data.length} bytes` : 'object',
    })
    
    return originalSend.call(this, data)
  }
  
  next()
})

app.use('/api/auth', authRoutes)
app.use('/api/vacation', vacationRoutes)
app.use('/api/users', userRoutes)

app.get('/api/health', (req, res) => {
  log.debug('HEALTH', 'Health check')
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((err, req, res, next) => {
  log.error('ERROR', 'Unhandled error', {
    method: req.method,
    url: req.originalUrl,
    error: err.message,
    stack: err.stack?.split('\n').slice(0, 5),
  })
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  })
})

app.use((req, res) => {
  log.warn('HTTP', `404 Not Found: ${req.method} ${req.originalUrl}`)
  res.status(404).json({ error: 'Not Found' })
})

app.listen(PORT, () => {
  log.info('SERVER', `Server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
  })
})
