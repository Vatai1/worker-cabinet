import express from 'express'
import { pool } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import AppError, { asyncHandler, ValidationError, ConflictError, NotFoundError } from '../middleware/errors.js'
import { ACTIVE_STATUSES, validateSettings, requireDeploymentAdmin } from '../deployment/validation.js'
import { DeploymentStore } from '../deployment/store.js'

export function createDeploymentRouter({ database = pool, authenticate = authenticateToken } = {}) {
  const router = express.Router()
  const store = new DeploymentStore(database)
  router.use(authenticate, requireDeploymentAdmin)

  /**
   * @swagger
   * /admin/deployment:
   *   get:
   *     tags: [Admin]
   *     summary: Настройки, версии серверов, опубликованные релизы и последние 30 обновлений
   *     description: Только суперадминистратор без имперсонации и предпросмотра роли. Секреты сервиса не возвращаются.
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200:
   *         description: Состояние обновления системы
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 settings: { $ref: '#/components/schemas/DeploymentSettings' }
   *                 heartbeat_at: { type: string, format: date-time, nullable: true }
   *                 online: { type: boolean }
   *                 observed: { type: object, additionalProperties: true }
   *                 catalog_error: { type: string, nullable: true }
   *                 catalog_checked_at: { type: string, format: date-time, nullable: true }
   *                 catalog_source: { type: string, nullable: true }
   *                 catalog_refresh_requested: { type: boolean }
   *                 host_error: { type: string, nullable: true }
   *                 releases: { type: array, items: { $ref: '#/components/schemas/DeploymentRelease' } }
   *                 jobs: { type: array, items: { $ref: '#/components/schemas/DeploymentJob' } }
   *       401: { description: Требуется авторизация }
   *       403: { description: Требуется суперадминистратор без имперсонации }
   */
  router.get('/', asyncHandler(async (req, res) => {
    const [state, releases, jobs] = await Promise.all([store.state(), store.releases(), store.jobs()])
    res.json({ settings: state.settings, heartbeat_at: state.heartbeat_at,
      online: !!state.heartbeat_at && Date.now() - new Date(state.heartbeat_at).getTime() < 30000,
      observed: state.observed, catalog_error: state.catalog_error, catalog_checked_at: state.catalog_checked_at, catalog_source: state.catalog_source, catalog_refresh_requested: state.catalog_refresh_requested, host_error: state.host_error, releases, jobs })
  }))

  /**
   * @swagger
   * /admin/deployment/refresh:
   *   post:
   *     tags: [Admin]
   *     summary: Запросить поиск новых версий в Docker Registry или Nexus
   *     description: Сервис выполняет поиск асинхронно, не чаще раза в 30 секунд. Во время обновления запрос ожидает завершения задания. Результат доступен в GET /admin/deployment.
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200:
   *         description: Поиск запрошен
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 catalog_refresh_requested: { type: boolean }
   *       401: { description: Требуется авторизация }
   *       403: { description: Требуется суперадминистратор без имперсонации }
   */
  router.post('/refresh', asyncHandler(async (req, res) => {
    await database.query('UPDATE deployment_state SET catalog_refresh_requested = true WHERE id = 1')
    res.json({ catalog_refresh_requested: true })
  }))

  /**
   * @swagger
   * /admin/deployment/settings:
   *   patch:
   *     tags: [Admin]
   *     summary: Сохранить полные настройки обновления в PostgreSQL
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/DeploymentSettings' }
   *     responses:
   *       200:
   *         description: Сохранённые настройки
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/DeploymentSettings' }
   *       400: { description: Некорректные настройки }
   *       401: { description: Требуется авторизация }
   *       403: { description: Требуется суперадминистратор без имперсонации }
   *       409: { description: Есть активное обновление или требуется восстановление }
   */
  router.patch('/settings', asyncHandler(async (req, res) => {
    let settings
    try { settings = validateSettings(req.body) } catch (error) { throw new ValidationError(error.message) }
    const client = await database.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT id FROM deployment_state WHERE id = 1 FOR UPDATE')
      const active = await client.query('SELECT id FROM deployment_jobs WHERE status = ANY($1::text[])', [ACTIVE_STATUSES])
      if (active.rows.length) throw new ConflictError('Настройки нельзя менять до завершения обновления или восстановления')
      await client.query('UPDATE deployment_state SET settings = $1 WHERE id = 1', [settings])
      await store.audit(client, req.user, 'deployment_settings', null, { settings }, req.ip)
      await client.query('COMMIT')
      res.json(settings)
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }))

  /**
   * @swagger
   * /admin/deployment/jobs:
   *   post:
   *     tags: [Admin]
   *     summary: Поставить обновление двух серверов в очередь
   *     description: Повторный запуск той же активной версии возвращает существующее задание. Восстановление блокирует новые запуски.
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [version]
   *             properties:
   *               version: { type: string }
   *     responses:
   *       201:
   *         description: Создано задание
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/DeploymentJob' }
   *       200:
   *         description: Уже существующее активное задание
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/DeploymentJob' }
   *       400: { description: Релиз не опубликован или обновление отключено }
   *       401: { description: Требуется авторизация }
   *       403: { description: Требуется суперадминистратор без имперсонации }
   *       409: { description: Другое обновление уже активно или требуется восстановление }
   *       503: { description: Сервис деплоя, серверы или каталог релизов недоступны }
   */
  router.post('/jobs', asyncHandler(async (req, res) => {
    if (typeof req.body.version !== 'string' || req.body.version.length > 100) throw new ValidationError('Выберите опубликованный релиз')
    const client = await database.connect()
    try {
      const result = await store.enqueue(client, req.user, req.body.version, req.ip)
      res.status(result.created ? 201 : 200).json(result.job)
    } catch (error) {
      if (error.code) throw error
      throw new AppError(error.message, error.statusCode || 400, error.statusCode === 503 ? 'DEPLOYMENT_UNAVAILABLE' : error.statusCode === 409 ? 'CONFLICT' : 'VALIDATION_ERROR')
    } finally { client.release() }
  }))

  /**
   * @swagger
   * /admin/deployment/jobs/{id}/recover:
   *   post:
   *     tags: [Admin]
   *     summary: Запросить проверку серверов после ручного восстановления
   *     description: Администратор подтверждает проверку схемы БД. Агент проверяет контейнеры, отсутствие активной миграции и доступность сайта, затем снимает блокировку. Образы и БД автоматически не откатываются.
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [database_checked]
   *             properties:
   *               database_checked: { type: boolean, enum: [true] }
   *     responses:
   *       200:
   *         description: Проверка восстановления запрошена
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/DeploymentJob' }
   *       400: { description: Некорректный номер задания или не подтверждена проверка БД }
   *       401: { description: Требуется авторизация }
   *       403: { description: Требуется суперадминистратор без имперсонации }
   *       404: { description: Задание не найдено }
   *       409: { description: Задание не требует восстановления }
   */
  router.post('/jobs/:id/recover', asyncHandler(async (req, res) => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(req.params.id) || req.body.database_checked !== true) throw new ValidationError('Подтвердите ручную проверку БД и укажите корректный номер задания')
    const client = await database.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT id FROM deployment_state WHERE id = 1 FOR UPDATE')
      const job = (await client.query('SELECT * FROM deployment_jobs WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0]
      if (!job) throw new NotFoundError('Задание не найдено')
      if (job.status !== 'recovery_required') throw new ConflictError('Задание не требует восстановления')
      const result = (await client.query('UPDATE deployment_jobs SET resolution_requested = true, updated_at = NOW() WHERE id = $1 RETURNING *', [job.id])).rows[0]
      await store.audit(client, req.user, 'deployment_recovery', job.id, { database_checked: true }, req.ip)
      await client.query('COMMIT')
      res.json(result)
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }))
  return router
}

export default createDeploymentRouter()
