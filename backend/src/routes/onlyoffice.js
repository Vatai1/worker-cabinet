import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'

const router = Router()

const OO_JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET || 'changeme'

/**
 * @swagger
 * /api/onlyoffice/config:
 *   get:
 *     summary: URL OnlyOffice Document Server для фронтенда
 *     tags: [OnlyOffice]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Конфигурация OnlyOffice
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 */

router.get('/config', authenticateToken, asyncHandler(async (req, res) => {
  res.json({ url: process.env.ONLYOFFICE_URL || 'http://localhost:8080' })
}))

/**
 * @swagger
 * /api/onlyoffice/sign:
 *   post:
 *     summary: Подпись конфигурации OnlyOffice JWT-токеном
 *     tags: [OnlyOffice]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Конфигурация DocEditor
 *     responses:
 *       200:
 *         description: JWT-токен для config.token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 */

/**
 * @swagger
 * /api/onlyoffice/callback:
 *   post:
 *     summary: Callback для сохранения документов OnlyOffice
 *     tags: [OnlyOffice]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: integer
 *               key:
 *                 type: string
 *               url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Результат обработки
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: integer
 */

router.post('/sign', authenticateToken, asyncHandler(async (req, res) => {
  const config = req.body
  const token = jwt.sign(config, OO_JWT_SECRET)
  res.json({ token })
}))

router.post('/callback', asyncHandler(async (req, res) => {
  const { status, key, url } = req.body

  if (status === 2 || status === 3 || status === 6) {
    if (url) {
      console.log(`[OnlyOffice] Document ${key} saved, download URL: ${url}`)
    }
  }

  res.json({ error: 0 })
}))

export default router
