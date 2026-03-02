import express from 'express'
import { query } from '../config/database.js'
import { TelegramService } from '../services/telegramService.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

router.get('/bot-info', authenticateToken, async (req, res) => {
  try {
    const isAvailable = TelegramService.isAvailable()

    if (!isAvailable) {
      return res.json({
        available: false,
        message: 'Telegram bot не настроен'
      })
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '@bot'
    res.json({
      available: true,
      botUsername,
      message: 'Telegram бот доступен'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/user-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      `SELECT telegram_chat_id, telegram_username, telegram_notifications_enabled
       FROM users WHERE id = $1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]
    res.json({
      connected: !!user.telegram_chat_id,
      username: user.telegram_username,
      notificationsEnabled: user.telegram_notifications_enabled
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/connect', authenticateToken, async (req, res) => {
  try {
    const { telegramUsername } = req.body
    const userId = req.user.id

    if (!telegramUsername) {
      return res.status(400).json({ error: 'Telegram username is required' })
    }

    if (!TelegramService.isAvailable()) {
      return res.status(500).json({ error: 'Telegram bot is not available' })
    }

    const normalizedUsername = telegramUsername.startsWith('@')
      ? telegramUsername
      : `@${telegramUsername}`

    await query(
      `UPDATE users
       SET telegram_username = $1, telegram_chat_id = NULL, telegram_notifications_enabled = false
       WHERE id = $2`,
      [normalizedUsername, userId]
    )

    await TelegramService.sendMessage(
      process.env.TELEGRAM_ADMIN_CHAT_ID || '',
      `Пользователь хочет подключить Telegram: ${normalizedUsername}`
    )

    res.json({
      success: true,
      message: 'Username сохранен. Отправьте команду /start в Telegram боте для завершения подключения'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/disconnect', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    await query(
      `UPDATE users
       SET telegram_chat_id = NULL,
           telegram_username = NULL,
           telegram_notifications_enabled = false
       WHERE id = $1`,
      [userId]
    )

    res.json({ success: true, message: 'Telegram отключен' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/toggle-notifications', authenticateToken, async (req, res) => {
  try {
    const { enabled } = req.body
    const userId = req.user.id

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be boolean' })
    }

    const result = await query(
      `UPDATE users
       SET telegram_notifications_enabled = $1
       WHERE id = $2
       RETURNING telegram_chat_id`,
      [enabled, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]

    if (enabled && user.telegram_chat_id) {
      await TelegramService.sendMessage(
        user.telegram_chat_id,
        '✅ Уведомления в Telegram включены'
      )
    }

    res.json({ success: true, enabled })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
