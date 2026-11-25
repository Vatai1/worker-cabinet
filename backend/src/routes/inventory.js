import { Router } from 'express'
import { query, getClient } from '../config/database.js'
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errors.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = Router()

const ITEM_STATUSES = ['in_stock', 'assigned', 'repair', 'written_off']
const ITEM_CONDITIONS = ['new', 'good', 'worn', 'broken']
const FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox']

function slugifyKey(label, index) {
  const slug = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
  return slug || `f${index + 1}`
}

function normalizeFieldSchema(fields) {
  if (fields === undefined || fields === null) return []
  if (!Array.isArray(fields)) throw new ValidationError('Поля раздела должны быть массивом')

  const seenKeys = new Set()
  return fields.map((f, index) => {
    if (!f || typeof f !== 'object') throw new ValidationError('Некорректное описание поля')
    if (!f.label?.trim()) throw new ValidationError('У каждого поля должно быть название')

    const type = FIELD_TYPES.includes(f.type) ? f.type : 'text'
    let key = typeof f.key === 'string' && f.key.trim() ? f.key.trim() : slugifyKey(f.label, index)
    while (seenKeys.has(key)) key = `${key}_${index + 1}`
    seenKeys.add(key)

    const options = type === 'select'
      ? (Array.isArray(f.options) ? f.options.map((o) => String(o).trim()).filter(Boolean) : [])
      : null

    return {
      key,
      label: f.label.trim(),
      type,
      required: Boolean(f.required),
      options: options && options.length > 0 ? options : null,
      unit: f.unit?.toString().trim() || null
    }
  })
}

function validateFieldValues(schema, values) {
  if (!Array.isArray(schema) || schema.length === 0) return {}
  const byKey = new Map(schema.map((f) => [f.key, f]))
  const cleaned = {}

  for (const [key, raw] of Object.entries(values ?? {})) {
    const field = byKey.get(key)
    if (!field) throw new ValidationError(`Неизвестное поле «${key}» — обновите схему раздела`)

    if (raw === null || raw === undefined || raw === '') continue

    if (field.type === 'number') {
      if (isNaN(Number(raw))) throw new ValidationError(`Поле «${field.label}» должно быть числом`)
      cleaned[key] = Number(raw)
    } else if (field.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) throw new ValidationError(`Поле «${field.label}» должно быть датой ГГГГ-ММ-ДД`)
      cleaned[key] = String(raw)
    } else if (field.type === 'checkbox') {
      cleaned[key] = Boolean(raw)
    } else if (field.type === 'select') {
      const value = String(raw)
      if (field.options && !field.options.includes(value)) throw new ValidationError(`Поле «${field.label}»: недопустимое значение «${value}»`)
      cleaned[key] = value
    } else {
      cleaned[key] = String(raw)
    }
  }

  for (const field of schema) {
    if (field.required && cleaned[field.key] === undefined) {
      throw new ValidationError(`Поле «${field.label}» обязательно для заполнения`)
    }
  }
  return cleaned
}

const ITEM_LIST_SQL = `
  SELECT i.*,
    s.name AS section_name,
    s.field_schema AS section_schema,
    CONCAT_WS(' ', u.last_name, u.first_name, u.middle_name) AS assigned_name
  FROM inventory_items i
  LEFT JOIN inventory_sections s ON s.id = i.section_id
  LEFT JOIN users u ON u.id = i.assigned_to
`

/**
 * @swagger
 * /inventory/sections:
 *   get:
 *     tags: [Inventory]
 *     summary: Список разделов инвентаризации
 *     description: 'Разделы (АРМ, Мебель и т.д.) со схемой полей и количеством позиций. Доступно всем авторизованным.'
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Список разделов'
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   code: { type: string }
 *                   name: { type: string }
 *                   description: { type: string, nullable: true }
 *                   icon: { type: string, nullable: true }
 *                   sort_order: { type: integer }
 *                   field_schema:
 *                     type: array
 *                     description: 'Конструктор полей: key, label, type (text/number/date/select/checkbox), required, options, unit'
 *                     items: { type: object }
 *                   items_count: { type: integer }
 */
router.get('/sections', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT s.*, (SELECT COUNT(*) FROM inventory_items i WHERE i.section_id = s.id)::int AS items_count
    FROM inventory_sections s
    WHERE s.is_active = true
    ORDER BY s.sort_order, s.name
  `)
  res.json(result.rows)
}))

/**
 * @swagger
 * /inventory/sections:
 *   post:
 *     tags: [Inventory]
 *     summary: Создать раздел
 *     description: 'Доступно ролям: hr, admin. fields — массив описаний полей конструктора.'
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, description: 'Название раздела' }
 *               description: { type: string }
 *               icon: { type: string }
 *               sort_order: { type: integer }
 *               fields:
 *                 type: array
 *                 description: 'Поля раздела'
 *                 items:
 *                   type: object
 *                   required: [label]
 *                   properties:
 *                     key: { type: string, description: 'Ключ (генерируется автоматически, если не задан)' }
 *                     label: { type: string, description: 'Название поля' }
 *                     type: { type: string, enum: [text, number, date, select, checkbox] }
 *                     required: { type: boolean }
 *                     options: { type: array, items: { type: string }, description: 'Варианты для типа select' }
 *                     unit: { type: string, description: 'Единица измерения для отображения' }
 *     responses:
 *       201:
 *         description: 'Раздел создан'
 *       400:
 *         description: 'Ошибка валидации'
 *       403:
 *         description: 'Доступ запрещён'
 */
router.post('/sections', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { name, description, icon, sort_order, fields } = req.body
  if (!name?.trim()) throw new ValidationError('Название раздела обязательно')

  const fieldSchema = normalizeFieldSchema(fields)
  const code = name.trim().toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'section'
  const result = await query(
    `INSERT INTO inventory_sections (code, name, description, icon, sort_order, field_schema)
     VALUES ($1 || '_' || (SELECT COALESCE(MAX(id), 0) + 1 FROM inventory_sections), $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [code, name.trim(), description?.trim() || null, icon?.trim() || null, sort_order ?? 100, JSON.stringify(fieldSchema)]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /inventory/sections/{id}:
 *   put:
 *     tags: [Inventory]
 *     summary: Обновить раздел и схему полей
 *     description: 'Доступно ролям: hr, admin. Схема полей заменяется целиком.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               icon: { type: string }
 *               sort_order: { type: integer }
 *               fields: { type: array, items: { type: object } }
 *     responses:
 *       200:
 *         description: 'Раздел обновлён'
 *       404:
 *         description: 'Раздел не найден'
 */
router.put('/sections/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { name, description, icon, sort_order, fields } = req.body
  if (!name?.trim()) throw new ValidationError('Название раздела обязательно')

  const fieldSchema = normalizeFieldSchema(fields)
  const result = await query(
    `UPDATE inventory_sections SET name = $1, description = $2, icon = $3, sort_order = $4, field_schema = $5::jsonb
     WHERE id = $6 RETURNING *`,
    [name.trim(), description?.trim() || null, icon?.trim() || null, sort_order ?? 100, JSON.stringify(fieldSchema), req.params.id]
  )
  if (result.rows.length === 0) throw new NotFoundError('Раздел не найден')
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /inventory/sections/{id}:
 *   delete:
 *     tags: [Inventory]
 *     summary: Удалить раздел
 *     description: 'Нельзя удалить раздел, в котором есть позиции.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: 'Раздел удалён'
 *       404:
 *         description: 'Раздел не найден'
 *       409:
 *         description: 'В разделе есть позиции'
 */
router.delete('/sections/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const itemsCount = await query('SELECT COUNT(*) AS cnt FROM inventory_items WHERE section_id = $1', [req.params.id])
  if (Number(itemsCount.rows[0].cnt) > 0) throw new ConflictError('В разделе есть позиции — сначала перенесите их')

  const result = await query('DELETE FROM inventory_sections WHERE id = $1 RETURNING id', [req.params.id])
  if (result.rows.length === 0) throw new NotFoundError('Раздел не найден')
  res.json({ success: true })
}))

/**
 * @swagger
 * /inventory/items:
 *   get:
 *     tags: [Inventory]
 *     summary: Список позиций имущества
 *     description: 'Фильтры: search, section_id, status, mine=1. Возвращает значения кастомных полей (field_values) и схему раздела.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: search, in: query, required: false, schema: { type: string }, description: 'Поиск по названию, инвентарному и серийному номеру' }
 *       - { name: section_id, in: query, required: false, schema: { type: integer } }
 *       - { name: status, in: query, required: false, schema: { type: string, enum: [in_stock, assigned, repair, written_off] } }
 *       - { name: mine, in: query, required: false, schema: { type: string, enum: ['1'] }, description: 'Только моё имущество' }
 *     responses:
 *       200:
 *         description: 'Список позиций с разделом и получателем'
 */
router.get('/items', authenticateToken, asyncHandler(async (req, res) => {
  const { search, section_id, status, mine } = req.query
  const conditions = []
  const params = []

  if (mine === '1') {
    conditions.push(`i.assigned_to = $${params.push(req.user.id)}`)
  }
  if (search?.trim()) {
    const p = params.push(`%${search.trim()}%`)
    conditions.push(`(i.name ILIKE $${p} OR i.inventory_number ILIKE $${p} OR i.serial_number ILIKE $${p} OR i.location ILIKE $${p})`)
  }
  if (section_id) {
    conditions.push(`i.section_id = $${params.push(section_id)}`)
  }
  if (status) {
    conditions.push(`i.status = $${params.push(status)}`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await query(
    `${ITEM_LIST_SQL} ${where} ORDER BY i.created_at DESC LIMIT 500`,
    params
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /inventory/my:
 *   get:
 *     tags: [Inventory]
 *     summary: Моё имущество
 *     description: 'Позиции, выданные текущему работнику.'
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Список позиций'
 */
router.get('/my', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `${ITEM_LIST_SQL} WHERE i.assigned_to = $1 ORDER BY i.created_at DESC`,
    [req.user.id]
  )
  res.json(result.rows)
}))

/**
 * @swagger
 * /inventory/stats:
 *   get:
 *     tags: [Inventory]
 *     summary: Статистика инвентаризации
 *     description: 'Количество позиций по статусам и разделам, суммарная стоимость. Доступно ролям: hr, admin.'
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Объект статистики'
 *       403:
 *         description: 'Доступ запрещён'
 */
router.get('/stats', authenticateToken, authorizeRoles('hr', 'admin', 'manager'), asyncHandler(async (req, res) => {
  const byStatus = await query(`
    SELECT status, COUNT(*)::int AS count FROM inventory_items GROUP BY status
  `)
  const byCategory = await query(`
    SELECT COALESCE(s.name, 'Без раздела') AS section, COUNT(*)::int AS count
    FROM inventory_items i LEFT JOIN inventory_sections s ON s.id = i.section_id
    GROUP BY s.name ORDER BY count DESC
  `)
  const totals = await query(`
    SELECT COUNT(*) AS total, COALESCE(SUM(cost), 0) AS total_cost FROM inventory_items WHERE status != 'written_off'
  `)
  res.json({
    by_status: byStatus.rows,
    by_section: byCategory.rows,
    total: Number(totals.rows[0].total),
    total_cost: Number(totals.rows[0].total_cost)
  })
}))

/**
 * @swagger
 * /inventory/items:
 *   post:
 *     tags: [Inventory]
 *     summary: Создать позицию
 *     description: 'Доступно ролям: hr, admin. field_values валидируются по схеме раздела.'
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, inventory_number]
 *             properties:
 *               name: { type: string, description: 'Наименование' }
 *               inventory_number: { type: string, description: 'Инвентарный номер (уникальный)' }
 *               section_id: { type: integer, description: 'ID раздела' }
 *               serial_number: { type: string, description: 'Серийный номер' }
 *               condition: { type: string, enum: [new, good, worn, broken], description: 'Состояние' }
 *               location: { type: string, description: 'Кабинет / помещение' }
 *               purchase_date: { type: string, format: date, description: 'Дата покупки' }
 *               cost: { type: number, description: 'Стоимость, руб.' }
 *               notes: { type: string, description: 'Примечание' }
 *               field_values: { type: object, description: 'Значения кастомных полей раздела {ключ: значение}' }
 *     responses:
 *       201:
 *         description: 'Позиция создана'
 *       400:
 *         description: 'Ошибка валидации'
 *       403:
 *         description: 'Доступ запрещён'
 *       409:
 *         description: 'Инвентарный номер уже существует'
 */
router.post('/items', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const {
    name, inventory_number, section_id, serial_number, condition,
    location, purchase_date, cost, notes, field_values
  } = req.body

  if (!name?.trim()) throw new ValidationError('Наименование обязательно')
  if (!inventory_number?.trim()) throw new ValidationError('Инвентарный номер обязателен')
  if (condition && !ITEM_CONDITIONS.includes(condition)) throw new ValidationError('Недопустимое состояние')
  if (cost != null && cost !== '' && (isNaN(Number(cost)) || Number(cost) < 0)) throw new ValidationError('Стоимость должна быть неотрицательным числом')

  let schema = []
  if (section_id) {
    const section = await query('SELECT field_schema FROM inventory_sections WHERE id = $1', [section_id])
    if (section.rows.length === 0) throw new ValidationError('Раздел не найден')
    schema = section.rows[0].field_schema ?? []
  }
  const cleanedValues = validateFieldValues(schema, field_values)

  const client = await getClient()
  try {
    await client.query('BEGIN')

    const orgRow = await client.query(
      'SELECT org_id AS organization_id FROM user_organizations WHERE user_id = $1 AND is_active = true LIMIT 1',
      [req.user.id]
    )

    const result = await client.query(
      `INSERT INTO inventory_items
        (name, inventory_number, section_id, serial_number, condition, location, purchase_date, cost, notes, field_values, created_by, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
       RETURNING *`,
      [
        name.trim(), inventory_number.trim(), section_id || null, serial_number?.trim() || null,
        condition || 'good', location?.trim() || null, purchase_date || null,
        cost != null && cost !== '' ? Number(cost) : null, notes?.trim() || null,
        JSON.stringify(cleanedValues), req.user.id, orgRow.rows[0]?.organization_id ?? null
      ]
    )

    await client.query(
      `INSERT INTO inventory_movements (item_id, action, to_status, comment, performed_by)
       VALUES ($1, 'create', 'in_stock', 'Позиция создана', $2)`,
      [result.rows[0].id, req.user.id]
    )

    await client.query('COMMIT')
    res.status(201).json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

/**
 * @swagger
 * /inventory/items/{id}:
 *   get:
 *     tags: [Inventory]
 *     summary: Позиция по ID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: 'Позиция с разделом, схемой полей и получателем'
 *       404:
 *         description: 'Позиция не найдена'
 */
router.get('/items/:id', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(`${ITEM_LIST_SQL} WHERE i.id = $1`, [req.params.id])
  if (result.rows.length === 0) throw new NotFoundError('Позиция не найдена')
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /inventory/items/{id}:
 *   put:
 *     tags: [Inventory]
 *     summary: Обновить позицию
 *     description: 'Доступно ролям: hr, admin. field_values валидируются по схеме раздела. Смена статуса через /items/{id}/status.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               inventory_number: { type: string }
 *               section_id: { type: integer }
 *               serial_number: { type: string }
 *               condition: { type: string, enum: [new, good, worn, broken] }
 *               location: { type: string }
 *               purchase_date: { type: string, format: date }
 *               cost: { type: number }
 *               notes: { type: string }
 *               field_values: { type: object, description: 'Значения кастомных полей (заменяются целиком)' }
 *     responses:
 *       200:
 *         description: 'Позиция обновлена'
 *       404:
 *         description: 'Позиция не найдена'
 *       409:
 *         description: 'Инвентарный номер уже существует'
 */
router.put('/items/:id', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const {
    name, inventory_number, section_id, serial_number, condition,
    location, purchase_date, cost, notes, field_values
  } = req.body

  if (condition && !ITEM_CONDITIONS.includes(condition)) throw new ValidationError('Недопустимое состояние')

  const existing = await query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id])
  if (existing.rows.length === 0) throw new NotFoundError('Позиция не найдена')
  const prev = existing.rows[0]

  const nextSectionId = section_id !== undefined ? section_id : prev.section_id
  let schema = []
  if (nextSectionId) {
    const section = await query('SELECT field_schema FROM inventory_sections WHERE id = $1', [nextSectionId])
    if (section.rows.length === 0) throw new ValidationError('Раздел не найден')
    schema = section.rows[0].field_schema ?? []
  }
  const nextValues = field_values !== undefined ? field_values : (prev.field_values ?? {})
  const cleanedValues = validateFieldValues(schema, nextValues)

  const result = await query(
    `UPDATE inventory_items SET
      name = $1, inventory_number = $2, section_id = $3, serial_number = $4,
      condition = $5, location = $6, purchase_date = $7, cost = $8, notes = $9,
      field_values = $10::jsonb, updated_at = CURRENT_TIMESTAMP
     WHERE id = $11 RETURNING *`,
    [
      name?.trim() || prev.name, inventory_number?.trim() || prev.inventory_number,
      nextSectionId || null,
      serial_number !== undefined ? serial_number?.trim() || null : prev.serial_number,
      condition || prev.condition,
      location !== undefined ? location?.trim() || null : prev.location,
      purchase_date !== undefined ? purchase_date || null : prev.purchase_date,
      cost !== undefined ? (cost !== null && cost !== '' ? Number(cost) : null) : prev.cost,
      notes !== undefined ? notes?.trim() || null : prev.notes,
      JSON.stringify(cleanedValues),
      req.params.id
    ]
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /inventory/items/{id}:
 *   delete:
 *     tags: [Inventory]
 *     summary: Удалить позицию
 *     description: 'Доступно роли: admin. История движений удаляется каскадно.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: 'Позиция удалена'
 *       404:
 *         description: 'Позиция не найдена'
 */
router.delete('/items/:id', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM inventory_items WHERE id = $1 RETURNING id', [req.params.id])
  if (result.rows.length === 0) throw new NotFoundError('Позиция не найдена')
  res.json({ success: true })
}))

/**
 * @swagger
 * /inventory/items/{id}/assign:
 *   post:
 *     tags: [Inventory]
 *     summary: Выдать позицию работнику
 *     description: 'Доступно ролям: hr, admin. Только для позиций на складе.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id: { type: integer, description: 'ID работника' }
 *               comment: { type: string, description: 'Комментарий к выдаче' }
 *     responses:
 *       200:
 *         description: 'Позиция выдана'
 *       400:
 *         description: 'Позиция не на складе или работник не указан'
 *       404:
 *         description: 'Позиция или работник не найдены'
 */
router.post('/items/:id/assign', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { user_id, comment } = req.body
  if (!user_id) throw new ValidationError('Укажите работника')

  const user = await query("SELECT id FROM users WHERE id = $1 AND status = 'active'", [user_id])
  if (user.rows.length === 0) throw new NotFoundError('Работник не найден')

  const client = await getClient()
  try {
    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE inventory_items SET assigned_to = $1, status = 'assigned', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = 'in_stock' RETURNING *`,
      [user_id, req.params.id]
    )
    if (result.rows.length === 0) {
      const cur = await client.query('SELECT status FROM inventory_items WHERE id = $1', [req.params.id])
      if (cur.rows.length === 0) throw new NotFoundError('Позиция не найдена')
      throw new ValidationError('Выдать можно только позицию на складе')
    }

    await client.query(
      `INSERT INTO inventory_movements (item_id, user_id, action, from_status, to_status, comment, performed_by)
       VALUES ($1, $2, 'assign', 'in_stock', 'assigned', $3, $4)`,
      [req.params.id, user_id, comment?.trim() || null, req.user.id]
    )

    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

/**
 * @swagger
 * /inventory/items/{id}/return:
 *   post:
 *     tags: [Inventory]
 *     summary: Принять позицию от работника
 *     description: 'Доступно ролям: hr, admin. Позиция возвращается на склад.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment: { type: string, description: 'Комментарий к возврату' }
 *     responses:
 *       200:
 *         description: 'Позиция возвращена на склад'
 *       400:
 *         description: 'Позиция никому не выдана'
 *       404:
 *         description: 'Позиция не найдена'
 */
router.post('/items/:id/return', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { comment } = req.body
  const client = await getClient()
  try {
    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE inventory_items SET assigned_to = NULL, status = 'in_stock', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'assigned' RETURNING *`,
      [req.params.id]
    )
    if (result.rows.length === 0) {
      const cur = await client.query('SELECT status, assigned_to FROM inventory_items WHERE id = $1', [req.params.id])
      if (cur.rows.length === 0) throw new NotFoundError('Позиция не найдена')
      throw new ValidationError('Позиция никому не выдана')
    }

    await client.query(
      `INSERT INTO inventory_movements (item_id, user_id, action, from_status, to_status, comment, performed_by)
       VALUES ($1, $2, 'return', 'assigned', 'in_stock', $3, $4)`,
      [req.params.id, result.rows[0].assigned_to, comment?.trim() || null, req.user.id]
    )

    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

/**
 * @swagger
 * /inventory/items/{id}/status:
 *   post:
 *     tags: [Inventory]
 *     summary: Изменить статус позиции
 *     description: 'Доступно ролям: hr, admin. Статусы: in_stock (на складе), repair (в ремонте), written_off (списано).'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [in_stock, repair, written_off] }
 *               comment: { type: string, description: 'Комментарий' }
 *     responses:
 *       200:
 *         description: 'Статус изменён'
 *       400:
 *         description: 'Недопустимый статус'
 *       404:
 *         description: 'Позиция не найдена'
 */
router.post('/items/:id/status', authenticateToken, authorizeRoles('hr', 'admin'), asyncHandler(async (req, res) => {
  const { status, comment } = req.body
  if (!['in_stock', 'repair', 'written_off'].includes(status)) throw new ValidationError('Недопустимый статус')

  const client = await getClient()
  try {
    await client.query('BEGIN')

    const prev = await client.query('SELECT status, assigned_to FROM inventory_items WHERE id = $1 FOR UPDATE', [req.params.id])
    if (prev.rows.length === 0) throw new NotFoundError('Позиция не найдена')

    const result = await client.query(
      `UPDATE inventory_items SET status = $1, assigned_to = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    )

    await client.query(
      `INSERT INTO inventory_movements (item_id, user_id, action, from_status, to_status, comment, performed_by)
       VALUES ($1, $2, 'status', $3, $4, $5, $6)`,
      [req.params.id, prev.rows[0].assigned_to, prev.rows[0].status, status, comment?.trim() || null, req.user.id]
    )

    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

/**
 * @swagger
 * /inventory/items/{id}/movements:
 *   get:
 *     tags: [Inventory]
 *     summary: История движений позиции
 *     description: 'Выдачи, возвраты, смены статуса. Доступно всем авторизованным.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: 'Список движений'
 *       404:
 *         description: 'Позиция не найдена'
 */
router.get('/items/:id/movements', authenticateToken, asyncHandler(async (req, res) => {
  const item = await query('SELECT id FROM inventory_items WHERE id = $1', [req.params.id])
  if (item.rows.length === 0) throw new NotFoundError('Позиция не найдена')

  const result = await query(`
    SELECT m.*,
      CONCAT_WS(' ', u.last_name, u.first_name, u.middle_name) AS user_name,
      CONCAT_WS(' ', p.last_name, p.first_name, p.middle_name) AS performer_name
    FROM inventory_movements m
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN users p ON p.id = m.performed_by
    WHERE m.item_id = $1
    ORDER BY m.created_at DESC, m.id DESC
  `, [req.params.id])
  res.json(result.rows)
}))

export default router
