import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { query } from '../config/database.js'
import { currentOrgId } from '../lib/orgQuery.js'

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
  const result = await query(
    `SELECT m.settings as global_settings, mo.settings as org_settings
     FROM modules m
     LEFT JOIN module_overrides mo ON mo.module_code = m.code AND mo.org_id = $1
     WHERE m.code = 'appearance' AND m.organization_id IS NULL`,
    [currentOrgId(req)]
  )
  const row = result.rows[0]
  const activeTheme = row?.org_settings?.activeTheme || row?.global_settings?.activeTheme || 'crct'
  res.json({ activeTheme })
}))

export default router
