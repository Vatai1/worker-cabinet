import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { migrate } from './db/migrate.js'
import { verifyConnection } from './config/email.js'
import { connect, close as closeRabbitMQ } from './config/rabbitmq.js'
import { startConsumer, retryFailedNotifications } from './services/notificationService.js'
import notificationsRoutes from './routes/notifications.js'
import { errorHandler } from './middleware/errorHandler.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5173',
  ],
  credentials: true,
}))
app.use(express.json())

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

app.use('/notifications', notificationsRoutes)

app.post('/retry-failed', async (req, res, next) => {
  try {
    const retried = await retryFailedNotifications()
    res.json({ retried })
  } catch (err) {
    next(err)
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service', timestamp: new Date().toISOString() })
})

app.use(errorHandler)

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

async function bootstrap() {
  console.log('[BOOT] Running migrations...')
  await migrate()

  console.log('[BOOT] Verifying SMTP connection...')
  const mailOk = await verifyConnection()
  if (!mailOk) {
    console.warn('[BOOT] WARNING: SMTP connection failed. Emails will not be sent until configured.')
  }

  console.log('[BOOT] Connecting to RabbitMQ...')
  await connect()

  startConsumer()

  app.listen(PORT, () => {
    console.log(`[BOOT] Notification service running on port ${PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error('[BOOT] Fatal:', err)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  await closeRabbitMQ()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await closeRabbitMQ()
  process.exit(0)
})
