import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { query } from '../config/database.js'

const router = express.Router()

router.use(authenticateToken)

/**
 * @swagger
 * /appearance:
 *   get:
 *     tags: [Appearance]
 *     summary: Получить текущую тему оформления
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Текущие настройки внешнего вида
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeTheme:
 *                   type: string
 *                   example: crct
 */
router.get('/', asyncHandler(async (req, res) => {
  const result = await query("SELECT settings FROM modules WHERE code = 'appearance'")
  const settings = result.rows[0]?.settings || { activeTheme: 'crct' }
  res.json({ activeTheme: settings.activeTheme || 'crct' })
}))

export default router
