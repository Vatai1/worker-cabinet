import express from 'express'
import { query } from '../config/database.js'
import { authenticateInternal } from '../middleware/auth.js'
import {
  createNotification,
  retryFailedNotifications,
  getNotificationStats,
} from '../services/notificationService.js'

const router = express.Router()

router.use(authenticateInternal)

router.post('/send', async (req, res, next) => {
  try {
    const { userId, type, channel, data, sendAt } = req.body

    if (!userId || !type) {
      return res.status(400).json({ error: 'userId и type обязательны' })
    }

    const notification = await createNotification({ userId, type, channel, data, sendAt })
    res.status(201).json(notification)
  } catch (err) {
    next(err)
  }
})

router.post('/send-batch', async (req, res, next) => {
  try {
    const { userIds, type, channel, data, sendAt } = req.body

    if (!Array.isArray(userIds) || userIds.length === 0 || !type) {
      return res.status(400).json({ error: 'userIds (массив) и type обязательны' })
    }

    const notifications = []
    for (const userId of userIds) {
      const notification = await createNotification({ userId, type, channel, data, sendAt })
      notifications.push(notification)
    }

    res.status(201).json({ created: notifications.length, notifications })
  } catch (err) {
    next(err)
  }
})

router.get('/status/:id', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, user_id, type, channel, status, attempts, error, created_at, sent_at FROM notification_queue WHERE id = $1',
      [req.params.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Уведомление не найдено' })
    }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
})

router.post('/retry-failed', async (req, res, next) => {
  try {
    const retried = await retryFailedNotifications()
    res.json({ retried })
  } catch (err) {
    next(err)
  }
})

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getNotificationStats()
    res.json(stats)
  } catch (err) {
    next(err)
  }
})

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default router
