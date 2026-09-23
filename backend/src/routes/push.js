import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler, ValidationError } from '../middleware/errors.js'
import { query } from '../config/database.js'
import { isPushConfigured, getPublicKey } from '../services/pushService.js'

const router = express.Router()

/**
 * @swagger
 * /push/config:
 *   get:
 *     tags: [Push]
 *     summary: Конфигурация Web Push
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Настройки Push
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled: { type: boolean }
 *                 publicKey: { type: string }
 */
router.get('/config', authenticateToken, asyncHandler(async (req, res) => {
  const enabled = isPushConfigured()
  res.json({ enabled, publicKey: enabled ? getPublicKey() : '' })
}))

/**
 * @swagger
 * /push/status:
 *   get:
 *     tags: [Push]
 *     summary: Есть ли активная подписка у текущего пользователя
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Статус подписки
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscribed: { type: boolean }
 */
router.get('/status', authenticateToken, asyncHandler(async (req, res) => {
  if (!isPushConfigured()) return res.json({ subscribed: false })
  const result = await query('SELECT 1 FROM push_subscriptions WHERE user_id = $1 LIMIT 1', [req.user.id])
  res.json({ subscribed: result.rows.length > 0 })
}))

/**
 * @swagger
 * /push/subscribe:
 *   post:
 *     tags: [Push]
 *     summary: Подписаться на Web Push
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint, keys]
 *             properties:
 *               endpoint: { type: string }
 *               keys:
 *                 type: object
 *                 required: [p256dh, auth]
 *                 properties:
 *                   p256dh: { type: string }
 *                   auth: { type: string }
 *     responses:
 *       201:
 *         description: Подписка сохранена
 *       400:
 *         description: Некорректные данные
 */
router.post('/subscribe', authenticateToken, asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body
  if (!endpoint?.trim()) throw new ValidationError('endpoint обязателен')
  if (!keys?.p256dh || !keys?.auth) throw new ValidationError('keys.p256dh и keys.auth обязательны')

  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys = $3`,
    [req.user.id, endpoint, JSON.stringify(keys)]
  )

  res.status(201).json({ subscribed: true })
}))

/**
 * @swagger
 * /push/unsubscribe:
 *   post:
 *     tags: [Push]
 *     summary: Отписаться от Web Push
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint]
 *             properties:
 *               endpoint: { type: string }
 *     responses:
 *       200:
 *         description: Подписка удалена
 */
router.post('/unsubscribe', authenticateToken, asyncHandler(async (req, res) => {
  const { endpoint } = req.body
  if (!endpoint?.trim()) throw new ValidationError('endpoint обязателен')

  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.id, endpoint])

  res.json({ subscribed: false })
}))

export default router
