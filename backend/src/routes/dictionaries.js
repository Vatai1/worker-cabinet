import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errors.js'

const router = express.Router()

router.get('/departments', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT d.id, d.name, d.manager_id, d.vacation_requests_blocked,
            m.first_name || ' ' || m.last_name as manager_name,
            (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
     FROM departments d
     LEFT JOIN users m ON d.manager_id = m.id
     ORDER BY d.name`
  )
  res.json(result.rows)
}))

router.post('/departments', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название отдела обязательно')

  const existing = await query('SELECT id FROM departments WHERE name = $1', [name.trim()])
  if (existing.rows.length > 0) throw new ConflictError('Отдел с таким названием уже существует')

  const result = await query(
    'INSERT INTO departments (name) VALUES ($1) RETURNING id, name',
    [name.trim()]
  )
  res.status(201).json(result.rows[0])
}))

router.put('/departments/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название отдела обязательно')

  const existing = await query('SELECT id FROM departments WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Отдел не найден')

  const duplicate = await query('SELECT id FROM departments WHERE name = $1 AND id != $2', [name.trim(), id])
  if (duplicate.rows.length > 0) throw new ConflictError('Отдел с таким названием уже существует')

  const result = await query(
    'UPDATE departments SET name = $1 WHERE id = $2 RETURNING id, name',
    [name.trim(), id]
  )
  res.json(result.rows[0])
}))

router.delete('/departments/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query('SELECT id FROM departments WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Отдел не найден')

  const usersInDept = await query('SELECT COUNT(*) as cnt FROM users WHERE department_id = $1', [id])
  if (parseInt(usersInDept.rows[0].cnt) > 0) {
    throw new ConflictError('Нельзя удалить отдел, в котором есть сотрудники')
  }

  await query('DELETE FROM departments WHERE id = $1', [id])
  res.json({ success: true })
}))

router.get('/skills', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT sd.id, sd.name, sd.created_at,
            (SELECT COUNT(*) FROM user_skills WHERE skill_id = sd.id) as user_count
     FROM skills_dictionary sd
     ORDER BY sd.name`
  )
  res.json(result.rows)
}))

router.post('/skills', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название навыка обязательно')

  const existing = await query('SELECT id FROM skills_dictionary WHERE name = $1', [name.trim()])
  if (existing.rows.length > 0) throw new ConflictError('Навык с таким названием уже существует')

  const result = await query(
    'INSERT INTO skills_dictionary (name) VALUES ($1) RETURNING id, name',
    [name.trim()]
  )
  res.status(201).json(result.rows[0])
}))

router.put('/skills/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название навыка обязательно')

  const existing = await query('SELECT id FROM skills_dictionary WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Навык не найден')

  const duplicate = await query('SELECT id FROM skills_dictionary WHERE name = $1 AND id != $2', [name.trim(), id])
  if (duplicate.rows.length > 0) throw new ConflictError('Навык с таким названием уже существует')

  const result = await query(
    'UPDATE skills_dictionary SET name = $1 WHERE id = $2 RETURNING id, name',
    [name.trim(), id]
  )
  res.json(result.rows[0])
}))

router.delete('/skills/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query('SELECT id FROM skills_dictionary WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Навык не найден')

  const usersWithSkill = await query('SELECT COUNT(*) as cnt FROM user_skills WHERE skill_id = $1', [id])
  if (parseInt(usersWithSkill.rows[0].cnt) > 0) {
    throw new ConflictError('Нельзя удалить навык, который привязан к сотрудникам')
  }

  await query('DELETE FROM skills_dictionary WHERE id = $1', [id])
  res.json({ success: true })
}))

router.get('/vacation-types', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT vt.id, vt.code, vt.name,
            (SELECT COUNT(*) FROM vacation_requests WHERE vacation_type_id = vt.id) as request_count
     FROM vacation_types vt
     ORDER BY vt.name`
  )
  res.json(result.rows)
}))

router.post('/vacation-types', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { code, name } = req.body
  if (!code?.trim()) throw new ValidationError('Код типа отпуска обязателен')
  if (!name?.trim()) throw new ValidationError('Название типа отпуска обязательно')

  const existingCode = await query('SELECT id FROM vacation_types WHERE code = $1', [code.trim()])
  if (existingCode.rows.length > 0) throw new ConflictError('Тип отпуска с таким кодом уже существует')

  const existingName = await query('SELECT id FROM vacation_types WHERE name = $1', [name.trim()])
  if (existingName.rows.length > 0) throw new ConflictError('Тип отпуска с таким названием уже существует')

  const result = await query(
    'INSERT INTO vacation_types (code, name) VALUES ($1, $2) RETURNING id, code, name',
    [code.trim(), name.trim()]
  )
  res.status(201).json(result.rows[0])
}))

router.put('/vacation-types/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { code, name } = req.body
  if (!code?.trim()) throw new ValidationError('Код типа отпуска обязателен')
  if (!name?.trim()) throw new ValidationError('Название типа отпуска обязательно')

  const existing = await query('SELECT id FROM vacation_types WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Тип отпуска не найден')

  const dupCode = await query('SELECT id FROM vacation_types WHERE code = $1 AND id != $2', [code.trim(), id])
  if (dupCode.rows.length > 0) throw new ConflictError('Тип отпуска с таким кодом уже существует')

  const dupName = await query('SELECT id FROM vacation_types WHERE name = $1 AND id != $2', [name.trim(), id])
  if (dupName.rows.length > 0) throw new ConflictError('Тип отпуска с таким названием уже существует')

  const result = await query(
    'UPDATE vacation_types SET code = $1, name = $2 WHERE id = $3 RETURNING id, code, name',
    [code.trim(), name.trim(), id]
  )
  res.json(result.rows[0])
}))

router.delete('/vacation-types/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await query('SELECT id FROM vacation_types WHERE id = $1', [id])
  if (existing.rows.length === 0) throw new NotFoundError('Тип отпуска не найден')

  const requestsWithType = await query('SELECT COUNT(*) as cnt FROM vacation_requests WHERE vacation_type_id = $1', [id])
  if (parseInt(requestsWithType.rows[0].cnt) > 0) {
    throw new ConflictError('Нельзя удалить тип отпуска, который используется в заявках')
  }

  await query('DELETE FROM vacation_types WHERE id = $1', [id])
  res.json({ success: true })
}))

router.get('/positions', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT DISTINCT position as name, COUNT(*) as employee_count
     FROM users
     WHERE position IS NOT NULL AND position != ''
     GROUP BY position
     ORDER BY position`
  )
  res.json(result.rows)
}))

export default router
