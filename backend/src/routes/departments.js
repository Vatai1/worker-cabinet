import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

/**
 * @swagger
 * /departments:
 *   get:
 *     tags: [Departments]
 *     summary: Получить список всех отделов
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список отделов с сотрудниками
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Department' }
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        d.id,
        d.name,
        d.manager_id,
        d.created_at,
        d.updated_at,
        d.vacation_requests_blocked,
        m.first_name || ' ' || m.last_name as manager_name,
        (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
      FROM departments d
      LEFT JOIN users m ON d.manager_id = m.id
      ORDER BY d.name
    `)

    const employeesResult = await query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.email,
        u.phone,
        u.status,
        u.role,
        u.avatar,
        u.department_id
      FROM users u
      WHERE u.department_id IS NOT NULL
      ORDER BY u.last_name, u.first_name
    `)

    const departmentsWithEmployees = result.rows.map(dept => ({
      ...dept,
      employees: employeesResult.rows.filter(emp => emp.department_id === dept.id)
    }))

    res.json(departmentsWithEmployees)
  } catch (error) {
    console.error('Error fetching departments:', error)
    res.status(500).json({ error: 'Failed to fetch departments' })
  }
})

/**
 * @swagger
 * /departments/{id}:
 *   get:
 *     tags: [Departments]
 *     summary: Получить отдел по ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Отдел с сотрудниками
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Department' }
 *       404:
 *         description: Отдел не найден
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(`
      SELECT 
        d.id,
        d.name,
        d.manager_id,
        d.created_at,
        d.updated_at,
        d.vacation_requests_blocked,
        m.first_name || ' ' || m.last_name as manager_name
      FROM departments d
      LEFT JOIN users m ON d.manager_id = m.id
      WHERE d.id = $1
    `, [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' })
    }

    const employeesResult = await query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.email,
        u.phone,
        u.status,
        u.role,
        u.avatar
      FROM users u
      WHERE u.department_id = $1
      ORDER BY u.last_name, u.first_name
    `, [id])

    res.json({
      ...result.rows[0],
      employees: employeesResult.rows
    })
  } catch (error) {
    console.error('Error fetching department:', error)
    res.status(500).json({ error: 'Failed to fetch department' })
  }
})

/**
 * @swagger
 * /departments/vacation-block-all:
 *   patch:
 *     tags: [Departments]
 *     summary: Заблокировать/разблокировать заявки на отпуск во всех отделах
 *     description: 'Доступно для ролей: hr, admin'
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [blocked]
 *             properties:
 *               blocked: { type: boolean }
 *     responses:
 *       200:
 *         description: Статус обновлён
 */
router.patch('/vacation-block-all', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { blocked } = req.body

    if (typeof blocked !== 'boolean') {
      return res.status(400).json({ error: 'Поле blocked обязательно (boolean)' })
    }

    await query(
      `UPDATE departments SET vacation_requests_blocked = $1`,
      [blocked]
    )

    res.json({ success: true, blocked })
  } catch (error) {
    console.error('Error toggling vacation block all:', error)
    res.status(500).json({ error: 'Failed to toggle vacation block' })
  }
})

/**
 * @swagger
 * /departments/{id}/vacation-block:
 *   patch:
 *     tags: [Departments]
 *     summary: Заблокировать/разблокировать заявки на отпуск в отделе
 *     description: 'Доступно для ролей: hr, admin'
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
 *             required: [blocked]
 *             properties:
 *               blocked: { type: boolean }
 *     responses:
 *       200:
 *         description: Статус обновлён
 */
router.patch('/:id/vacation-block', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { blocked } = req.body

    if (typeof blocked !== 'boolean') {
      return res.status(400).json({ error: 'Поле blocked обязательно (boolean)' })
    }

    const result = await query(
      `UPDATE departments SET vacation_requests_blocked = $1 WHERE id = $2 RETURNING *`,
      [blocked, id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Отдел не найден' })
    }

    res.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      vacation_requests_blocked: result.rows[0].vacation_requests_blocked,
    })
  } catch (error) {
    console.error('Error toggling vacation block:', error)
    res.status(500).json({ error: 'Failed to toggle vacation block' })
  }
})

export default router
