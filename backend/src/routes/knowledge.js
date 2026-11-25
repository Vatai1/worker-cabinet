import { Router } from 'express'
import { query } from '../config/database.js'
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errors.js'
import { authenticateToken } from '../middleware/auth.js'
import { currentOrgId } from '../lib/orgQuery.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'

const router = Router()

const STATUSES = ['draft', 'published']

/**
 * @swagger
 * /knowledge/categories:
 *   get:
 *     tags: [Knowledge]
 *     summary: Список категорий базы знаний
 *     description: 'Категории учреждения + общие. article_count — число опубликованных статей'
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Список категорий
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   sort_order: { type: integer }
 *                   article_count: { type: integer }
 *       401: { description: Не авторизован }
 */
router.get('/categories', authenticateToken, asyncHandler(async (req, res) => {
  const orgId = currentOrgId(req)
  const result = await query(`
    SELECT c.id, c.name, c.sort_order,
      (SELECT COUNT(*) FROM knowledge_articles a
        WHERE a.category_id = c.id AND a.status = 'published'
          AND ($1::int IS NULL OR a.organization_id IS NULL OR a.organization_id = $1)) AS article_count
    FROM knowledge_categories c
    WHERE $1::int IS NULL OR c.organization_id IS NULL OR c.organization_id = $1
    ORDER BY c.sort_order NULLS LAST, c.name
  `, [orgId])
  res.json(result.rows.map((r) => ({ ...r, article_count: parseInt(r.article_count) })))
}))

/**
 * @swagger
 * /knowledge/categories:
 *   post:
 *     tags: [Knowledge]
 *     summary: Создать категорию
 *     description: 'Доступно для ролей: hr, admin'
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               sort_order: { type: integer }
 *     responses:
 *       201: { description: Категория создана }
 *       400: { description: Ошибка валидации }
 *       401: { description: Не авторизован }
 *       403: { description: Недостаточно прав }
 *       409: { description: Категория с таким названием уже существует }
 */
router.post('/categories', authenticateToken, requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const { name, sort_order } = req.body
  if (!name?.trim()) throw new ValidationError('Название категории обязательно')

  const dup = await query(
    'SELECT 1 FROM knowledge_categories WHERE name = $1 AND organization_id IS NOT DISTINCT FROM $2',
    [name.trim(), currentOrgId(req)]
  )
  if (dup.rows.length > 0) throw new ConflictError('Категория с таким названием уже существует')

  const result = await query(
    'INSERT INTO knowledge_categories (organization_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, name, sort_order',
    [currentOrgId(req), name.trim(), Number.isInteger(sort_order) ? sort_order : 0]
  )
  res.status(201).json({ ...result.rows[0], article_count: 0 })
}))

/**
 * @swagger
 * /knowledge/categories/{id}:
 *   put:
 *     tags: [Knowledge]
 *     summary: Переименовать категорию
 *     description: 'Доступно для ролей: hr, admin'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               sort_order: { type: integer }
 *     responses:
 *       200: { description: Категория обновлена }
 *       400: { description: Ошибка валидации }
 *       401: { description: Не авторизован }
 *       403: { description: Недостаточно прав }
 *       404: { description: Категория не найдена }
 *       409: { description: Категория с таким названием уже существует }
 */
router.put('/categories/:id', authenticateToken, requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const { name, sort_order } = req.body
  if (!name?.trim()) throw new ValidationError('Название категории обязательно')

  const dup = await query(
    'SELECT 1 FROM knowledge_categories WHERE name = $1 AND organization_id IS NOT DISTINCT FROM $2 AND id <> $3',
    [name.trim(), currentOrgId(req), req.params.id]
  )
  if (dup.rows.length > 0) throw new ConflictError('Категория с таким названием уже существует')

  const result = await query(
    `UPDATE knowledge_categories SET name = $1, sort_order = $2
     WHERE id = $3 AND (organization_id IS NULL OR organization_id IS NOT DISTINCT FROM $4)
     RETURNING id, name, sort_order`,
    [name.trim(), Number.isInteger(sort_order) ? sort_order : 0, req.params.id, currentOrgId(req)]
  )
  if (result.rows.length === 0) throw new NotFoundError('Категория не найдена')
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /knowledge/categories/{id}:
 *   delete:
 *     tags: [Knowledge]
 *     summary: Удалить категорию
 *     description: 'Статьи категории останутся без категории. Доступно для ролей: hr, admin'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Категория удалена }
 *       401: { description: Не авторизован }
 *       403: { description: Недостаточно прав }
 *       404: { description: Категория не найдена }
 */
router.delete('/categories/:id', authenticateToken, requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const result = await query(
    `DELETE FROM knowledge_categories
     WHERE id = $1 AND (organization_id IS NULL OR organization_id IS NOT DISTINCT FROM $2)
     RETURNING id`,
    [req.params.id, currentOrgId(req)]
  )
  if (result.rows.length === 0) throw new NotFoundError('Категория не найдена')
  res.json({ success: true })
}))

/**
 * @swagger
 * /knowledge/articles:
 *   get:
 *     tags: [Knowledge]
 *     summary: Список статей
 *     description: 'Работники видят только опубликованные. Обладатели права knowledge:manage — и черновики (параметр status)'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: q, in: query, schema: { type: string }, description: 'Поиск по названию и содержимому' }
 *       - { name: category, in: query, schema: { type: string }, description: 'ID категории или "none" для статей без категории' }
 *       - { name: status, in: query, schema: { type: string, enum: [draft, published] } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 50 } }
 *     responses:
 *       200:
 *         description: Список статей
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   title: { type: string }
 *                   preview: { type: string }
 *                   status: { type: string, enum: [draft, published] }
 *                   category_id: { type: integer, nullable: true }
 *                   category_name: { type: string, nullable: true }
 *                   author_name: { type: string, nullable: true }
 *                   views: { type: integer }
 *                   created_at: { type: string, format: date-time }
 *                   updated_at: { type: string, format: date-time }
 *       401: { description: Не авторизован }
 */
router.get('/articles', authenticateToken, asyncHandler(async (req, res) => {
  const canManage = await hasPermission(req, 'knowledge:manage')
  const params = []
  const conditions = []

  params.push(currentOrgId(req))
  conditions.push(`($${params.length}::int IS NULL OR a.organization_id IS NULL OR a.organization_id = $${params.length})`)

  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null
  params.push(q)
  conditions.push(`($${params.length}::text IS NULL OR a.title ILIKE '%' || $${params.length} || '%' OR a.content ILIKE '%' || $${params.length} || '%')`)

  if (req.query.category === 'none') {
    conditions.push('a.category_id IS NULL')
  } else if (req.query.category) {
    const categoryId = parseInt(req.query.category)
    if (Number.isInteger(categoryId)) {
      params.push(categoryId)
      conditions.push(`a.category_id = $${params.length}`)
    }
  }

  if (canManage && STATUSES.includes(req.query.status)) {
    params.push(req.query.status)
    conditions.push(`a.status = $${params.length}`)
  } else if (!canManage) {
    conditions.push(`a.status = 'published'`)
  }

  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
  const page = Math.max(1, parseInt(req.query.page) || 1)
  params.push(limit)
  const limitIdx = params.length
  params.push((page - 1) * limit)

  const result = await query(`
    SELECT a.id, a.category_id, a.title, a.status, a.views, a.created_at, a.updated_at,
      LEFT(a.content, 280) AS preview,
      c.name AS category_name,
      NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS author_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_categories c ON c.id = a.category_id
    LEFT JOIN users u ON u.id = a.author_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.updated_at DESC
    LIMIT $${limitIdx} OFFSET $${params.length}
  `, params)
  res.json(result.rows)
}))

/**
 * @swagger
 * /knowledge/articles:
 *   post:
 *     tags: [Knowledge]
 *     summary: Создать статью
 *     description: 'Доступно для ролей: hr, admin'
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title: { type: string, maxLength: 300 }
 *               content: { type: string }
 *               category_id: { type: integer, nullable: true }
 *               status: { type: string, enum: [draft, published], default: draft }
 *     responses:
 *       201: { description: Статья создана }
 *       400: { description: Ошибка валидации }
 *       401: { description: Не авторизован }
 *       403: { description: Недостаточно прав }
 */
router.post('/articles', authenticateToken, requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const { title, content, category_id, status } = req.body
  if (!title?.trim()) throw new ValidationError('Заголовок обязателен')
  if (title.trim().length > 300) throw new ValidationError('Заголовок не должен превышать 300 символов')
  if (!content?.trim()) throw new ValidationError('Текст статьи обязателен')
  const nextStatus = status ?? 'draft'
  if (!STATUSES.includes(nextStatus)) throw new ValidationError('Статус может быть draft или published')

  let categoryId = null
  if (category_id != null) {
    categoryId = parseInt(category_id)
    if (!Number.isInteger(categoryId)) throw new ValidationError('Некорректная категория')
    const cat = await query(
      'SELECT 1 FROM knowledge_categories WHERE id = $1 AND (organization_id IS NULL OR organization_id IS NOT DISTINCT FROM $2)',
      [categoryId, currentOrgId(req)]
    )
    if (cat.rows.length === 0) throw new ValidationError('Категория не найдена')
  }

  const result = await query(
    `INSERT INTO knowledge_articles (organization_id, category_id, title, content, status, author_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [currentOrgId(req), categoryId, title.trim(), content, nextStatus, req.user.id]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /knowledge/articles/{id}:
 *   get:
 *     tags: [Knowledge]
 *     summary: Получить статью
 *     description: 'Черновик доступен только обладателям права knowledge:manage. Каждый просмотр увеличивает счётчик views'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Статья
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 title: { type: string }
 *                 content: { type: string }
 *                 status: { type: string, enum: [draft, published] }
 *                 category_name: { type: string, nullable: true }
 *                 author_name: { type: string, nullable: true }
 *                 views: { type: integer }
 *                 created_at: { type: string, format: date-time }
 *                 updated_at: { type: string, format: date-time }
 *       401: { description: Не авторизован }
 *       404: { description: Статья не найдена }
 */
router.get('/articles/:id', authenticateToken, asyncHandler(async (req, res) => {
  const canManage = await hasPermission(req, 'knowledge:manage')
  const result = await query(`
    SELECT a.*, c.name AS category_name,
      NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS author_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_categories c ON c.id = a.category_id
    LEFT JOIN users u ON u.id = a.author_id
    WHERE a.id = $1 AND ($2::int IS NULL OR a.organization_id IS NULL OR a.organization_id = $2)
  `, [req.params.id, currentOrgId(req)])
  if (result.rows.length === 0) throw new NotFoundError('Статья не найдена')
  const article = result.rows[0]
  if (article.status !== 'published' && !canManage) throw new NotFoundError('Статья не найдена')

  await query('UPDATE knowledge_articles SET views = views + 1 WHERE id = $1', [req.params.id])
  res.json({ ...article, views: article.views + 1 })
}))

/**
 * @swagger
 * /knowledge/articles/{id}:
 *   put:
 *     tags: [Knowledge]
 *     summary: Обновить статью
 *     description: 'Доступно для ролей: hr, admin'
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
 *               title: { type: string }
 *               content: { type: string }
 *               category_id: { type: integer, nullable: true }
 *               status: { type: string, enum: [draft, published] }
 *     responses:
 *       200: { description: Статья обновлена }
 *       400: { description: Ошибка валидации }
 *       401: { description: Не авторизован }
 *       403: { description: Недостаточно прав }
 *       404: { description: Статья не найдена }
 */
router.put('/articles/:id', authenticateToken, requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const { title, content, category_id, status } = req.body

  const existing = await query(
    `SELECT id FROM knowledge_articles
     WHERE id = $1 AND ($2::int IS NULL OR organization_id IS NULL OR organization_id = $2)`,
    [req.params.id, currentOrgId(req)]
  )
  if (existing.rows.length === 0) throw new NotFoundError('Статья не найдена')

  if (title != null) {
    if (!title.trim()) throw new ValidationError('Заголовок не может быть пустым')
    if (title.trim().length > 300) throw new ValidationError('Заголовок не должен превышать 300 символов')
  }
  if (content != null && !content.trim()) throw new ValidationError('Текст статьи не может быть пустым')
  if (status != null && !STATUSES.includes(status)) throw new ValidationError('Статус может быть draft или published')

  let categoryId
  if (category_id === null) {
    categoryId = null
  } else if (category_id !== undefined) {
    categoryId = parseInt(category_id)
    if (!Number.isInteger(categoryId)) throw new ValidationError('Некорректная категория')
    const cat = await query(
      'SELECT 1 FROM knowledge_categories WHERE id = $1 AND (organization_id IS NULL OR organization_id IS NOT DISTINCT FROM $2)',
      [categoryId, currentOrgId(req)]
    )
    if (cat.rows.length === 0) throw new ValidationError('Категория не найдена')
  }

  const sets = ['updated_by = $1', 'updated_at = NOW()']
  const values = [req.user.id]
  if (title !== undefined) { values.push(title.trim()); sets.push(`title = $${values.length}`) }
  if (content !== undefined) { values.push(content); sets.push(`content = $${values.length}`) }
  if (categoryId !== undefined) { values.push(categoryId); sets.push(`category_id = $${values.length}`) }
  if (status !== undefined) { values.push(status); sets.push(`status = $${values.length}`) }
  values.push(req.params.id)

  const result = await query(
    `UPDATE knowledge_articles SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  )
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /knowledge/articles/{id}:
 *   delete:
 *     tags: [Knowledge]
 *     summary: Удалить статью
 *     description: 'Доступно для ролей: hr, admin'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Статья удалена }
 *       401: { description: Не авторизован }
 *       403: { description: Недостаточно прав }
 *       404: { description: Статья не найдена }
 */
router.delete('/articles/:id', authenticateToken, requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const result = await query(
    `DELETE FROM knowledge_articles
     WHERE id = $1 AND ($2::int IS NULL OR organization_id IS NULL OR organization_id = $2)
     RETURNING id`,
    [req.params.id, currentOrgId(req)]
  )
  if (result.rows.length === 0) throw new NotFoundError('Статья не найдена')
  res.json({ success: true })
}))

export default router
