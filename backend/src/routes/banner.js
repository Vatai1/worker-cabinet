import { Router } from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'

const router = Router()

/**
 * @swagger
 * /banner:
 *   get:
 *     tags: [Banner]
 *     summary: Активные баннеры предупреждений (глобальный и организации)
 *     description: 'Организационный баннер определяется по заголовку X-Organization-Id; без заголовка org = null'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: X-Organization-Id, in: header, required: false, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: 'Объект { global, org } — активные баннеры или null'
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 global:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     level: { type: string, enum: [info, warning, danger] }
 *                     text: { type: string }
 *                 org:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     level: { type: string, enum: [info, warning, danger] }
 *                     text: { type: string }
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const globalRow = await query(
    "SELECT level, text FROM app_banners WHERE scope = 'global' AND is_active = true LIMIT 1"
  )
  const orgId = parseInt(req.headers['x-organization-id'])
  let orgRow = { rows: [] }
  if (orgId) {
    orgRow = await query(
      "SELECT level, text FROM app_banners WHERE scope = 'org' AND organization_id = $1 AND is_active = true LIMIT 1",
      [orgId]
    )
  }
  res.json({
    global: globalRow.rows[0] || null,
    org: orgRow.rows[0] || null,
  })
}))

export default router
