import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

const DEFAULT_DATA = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }

/**
 * @swagger
 * /hierarchy:
 *   get:
 *     tags: [Hierarchy]
 *     summary: Получить организационную структуру
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные иерархии (ReactFlow)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     nodes: { type: array, items: { type: object } }
 *                     edges: { type: array, items: { type: object } }
 *                     viewport: { type: object }
 *                 updated_at: { type: string, format: date-time, nullable: true }
 *                 updated_by: { type: integer, nullable: true }
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT data, updated_at, updated_by FROM hr_hierarchy WHERE id = 1')
    if (result.rows.length === 0) {
      return res.json({ data: DEFAULT_DATA, updated_at: null, updated_by: null })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('GET /hierarchy error:', error)
    res.status(500).json({ error: 'Не удалось загрузить иерархию' })
  }
})

/**
 * @swagger
 * /hierarchy:
 *   put:
 *     tags: [Hierarchy]
 *     summary: Сохранить организационную структуру (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nodes, edges]
 *             properties:
 *               nodes: { type: array, items: { type: object } }
 *               edges: { type: array, items: { type: object } }
 *               viewport: { type: object }
 *     responses:
 *       200:
 *         description: Структура сохранена
 */
router.put('/', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  const { nodes, edges, viewport } = req.body
  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Поля nodes и edges обязательны' })
  }
  try {
    const data = JSON.stringify({ nodes, edges, viewport: viewport ?? DEFAULT_DATA.viewport })
    const result = await query(
      `INSERT INTO hr_hierarchy (id, data, updated_at, updated_by)
       VALUES (1, $1, NOW(), $2)
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by
       RETURNING updated_at`,
      [data, req.user.id]
    )
    res.json({ updated_at: result.rows[0].updated_at })
  } catch (error) {
    console.error('PUT /hierarchy error:', error)
    res.status(500).json({ error: 'Не удалось сохранить иерархию' })
  }
})

/**
 * @swagger
 * /hierarchy/department/{id}:
 *   get:
 *     tags: [Hierarchy]
 *     summary: Получить иерархию отдела
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Данные иерархии отдела
 */
router.get('/department/:id', authenticateToken, async (req, res) => {
  const { id } = req.params
  try {
    const result = await query(
      'SELECT data, updated_at, updated_by FROM department_hierarchy WHERE department_id = $1',
      [id]
    )
    if (result.rows.length === 0) {
      return res.json({ data: DEFAULT_DATA, updated_at: null, updated_by: null })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('GET /hierarchy/department/:id error:', error)
    res.status(500).json({ error: 'Не удалось загрузить иерархию отдела' })
  }
})

/**
 * @swagger
 * /hierarchy/department/{id}:
 *   put:
 *     tags: [Hierarchy]
 *     summary: Сохранить иерархию отдела (HR/admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nodes, edges]
 *             properties:
 *               nodes: { type: array, items: { type: object } }
 *               edges: { type: array, items: { type: object } }
 *               viewport: { type: object }
 *     responses:
 *       200:
 *         description: Иерархия сохранена
 */
router.put('/department/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  const { id } = req.params
  const { nodes, edges, viewport } = req.body
  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Поля nodes и edges обязательны' })
  }
  try {
    const data = JSON.stringify({ nodes, edges, viewport: viewport ?? DEFAULT_DATA.viewport })
    const result = await query(
      `INSERT INTO department_hierarchy (department_id, data, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (department_id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by
       RETURNING updated_at`,
      [id, data, req.user.id]
    )
    res.json({ updated_at: result.rows[0].updated_at })
  } catch (error) {
    console.error('PUT /hierarchy/department/:id error:', error)
    res.status(500).json({ error: 'Не удалось сохранить иерархию отдела' })
  }
})

export default router
