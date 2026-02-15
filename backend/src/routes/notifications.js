import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Получить все уведомления пользователя
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      `SELECT id, user_id as "userId", title, message, type, read, created_at as "createdAt"
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// Получить количество непрочитанных уведомлений
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false',
      [userId]
    )

    res.json({ count: parseInt(result.rows[0].count) })
  } catch (error) {
    console.error('Error fetching unread count:', error)
    res.status(500).json({ error: 'Failed to fetch unread count' })
  }
})

// Отметить уведомление как прочитанное
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const result = await query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error marking notification as read:', error)
    res.status(500).json({ error: 'Failed to mark notification as read' })
  }
})

// Отметить все уведомления как прочитанные
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false RETURNING *',
      [userId]
    )

    res.json({ updated: result.rows.length })
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    res.status(500).json({ error: 'Failed to mark all notifications as read' })
  }
})

// Удалить уведомление
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const result = await query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    res.json({ message: 'Notification deleted' })
  } catch (error) {
    console.error('Error deleting notification:', error)
    res.status(500).json({ error: 'Failed to delete notification' })
  }
})

// Создать уведомление (для использования внутри бэкенда)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { userId, title, message, type } = req.body

    if (!userId || !title || !message || !type) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (!['info', 'success', 'warning', 'error'].includes(type)) {
      return res.status(400).json({ error: 'Invalid notification type' })
    }

    const result = await query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id as "userId", title, message, type, read, created_at as "createdAt"`,
      [userId, title, message, type]
    )

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error creating notification:', error)
    res.status(500).json({ error: 'Failed to create notification' })
  }
})

export default router
