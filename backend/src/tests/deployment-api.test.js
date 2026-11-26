import { before, after, beforeEach, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import express from 'express'
import { createDeploymentRouter } from '../routes/deployment.js'
import { migrateDeployment } from '../db/migrate.js'
import { DeploymentStore, DEPLOY_LOCK } from '../deployment/store.js'
import { syncCatalog } from '../deployment/agent.js'

const connectionString = process.env.DEPLOY_TEST_DATABASE_URL
const enabled = !!connectionString
const schema = `deployment_test_${process.pid}_${Date.now()}`
const release = { version: '1.2.3', commit: 'abcdef0', frontend: `example/frontend@sha256:${'a'.repeat(64)}`, backend: `example/backend@sha256:${'b'.repeat(64)}` }
const settings = { enabled: true, frontend_url: 'https://example.ru', backend_health_url: 'http://localhost:5000/api/health', health_timeout_seconds: 30 }
let database, admin, server, base

function serve() {
  const app = express()
  app.use(express.json())
  app.use('/deployment', createDeploymentRouter({ database, authenticate: (req, res, next) => {
    if (!req.headers['x-role']) return res.status(401).json({ error: 'Требуется авторизация' })
    req.user = { id: 1, role: req.headers['x-role'], first_name: 'Тест' }
    if (req.headers['x-impersonate']) req.realUser = { id: 1, role: 'superadmin' }
    next()
  } }))
  app.use((error, req, res, next) => { res.status(error.statusCode || 500).json({ error: error.message, code: error.code }) })
  return new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}/deployment`; resolve() })
  })
}
const request = async (method, route = '', body, role = 'superadmin', extra = {}) => {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-role': role } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, data: await response.json() }
}

before(async () => {
  if (!enabled) return
  admin = new pg.Pool({ connectionString })
  await admin.query(`CREATE SCHEMA ${schema}`)
  database = new pg.Pool({ connectionString, options: `-c search_path=${schema}` })
  await database.query('CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1)')
  await database.query('CREATE TABLE audit_log (user_id INTEGER, user_name TEXT, action TEXT, entity_type TEXT, entity_id TEXT, details JSONB, ip_address TEXT)')
  await migrateDeployment(database)
  await migrateDeployment(database)
  await serve()
})
beforeEach(async () => {
  if (!enabled) return
  await database.query('TRUNCATE deployment_jobs, deployment_releases, audit_log')
  await database.query('UPDATE deployment_state SET settings = $1, heartbeat_at = NOW(), catalog_error = NULL, host_error = NULL, observed = $2', [settings, { backend: { version: '1.0.0' } }])
  await database.query('INSERT INTO deployment_releases (version, manifest) VALUES ($1, $2)', [release.version, release])
})
after(async () => {
  if (!enabled) return
  await new Promise(resolve => server?.close(resolve))
  await database?.end()
  await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await admin?.end()
})

it('запрещает запуск без авторизации, всем обычным ролям и при имперсонации', { skip: !enabled }, async () => {
  for (const role of [null, 'employee', 'manager', 'hr', 'admin', 'onboarding']) assert.equal((await request('POST', '/jobs', { version: release.version }, role)).status, role ? 403 : 401)
  assert.equal((await request('POST', '/jobs', { version: release.version }, 'superadmin', { 'x-impersonate': 'true' })).status, 403)
})

it('одновременные нажатия создают одно задание, очередь и аудит сохраняются после перезапуска API', { skip: !enabled }, async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => request('POST', '/jobs', { version: release.version })))
  assert.equal(results.filter(result => result.status === 201).length, 1)
  assert.ok(results.every(result => [200, 201].includes(result.status)))
  assert.equal(new Set(results.map(result => result.data.id)).size, 1)
  assert.equal((await database.query('SELECT * FROM audit_log')).rows.length, 1)
  await new Promise(resolve => server.close(resolve))
  await serve()
  const state = await request('GET')
  assert.equal(state.data.jobs.length, 1)
  assert.equal(state.data.jobs[0].status, 'queued')
  assert.equal((await request('PATCH', '/settings', settings)).status, 409)
})

it('блокирует другую версию, устаревший агент, неизвестный релиз и запуск во время восстановления', { skip: !enabled }, async () => {
  assert.equal((await request('POST', '/jobs', { version: 'unknown' })).status, 400)
  await database.query("UPDATE deployment_state SET heartbeat_at = NOW() - INTERVAL '1 minute'")
  assert.equal((await request('POST', '/jobs', { version: release.version })).status, 503)
  await database.query('UPDATE deployment_state SET heartbeat_at = NOW()')
  const created = await request('POST', '/jobs', { version: release.version })
  assert.equal(created.status, 201)
  assert.equal((await request('POST', '/jobs', { version: '1.2.4' })).status, 409)
  await database.query("UPDATE deployment_jobs SET status = 'recovery_required'")
  assert.equal((await request('POST', '/jobs', { version: release.version })).status, 409)
  assert.equal((await request('POST', `/jobs/${created.data.id}/recover`, { database_checked: false })).status, 400)
  assert.equal((await request('POST', `/jobs/${created.data.id}/recover`, { database_checked: true })).status, 200)
})

it('сохраняет настройки в БД и не принимает секреты или shell-команды', { skip: !enabled }, async () => {
  const changed = { ...settings, health_timeout_seconds: 90 }
  assert.equal((await request('PATCH', '/settings', changed)).status, 200)
  assert.deepEqual((await request('GET')).data.settings, changed)
  assert.equal((await request('PATCH', '/settings', { ...settings, ssh_key: 'SECRET' })).status, 400)
  const response = await request('GET')
  assert.ok(!JSON.stringify(response.data).includes('SECRET'))
  assert.equal(response.data.online, true)
})

it('блокировка PostgreSQL исключает одновременную работу двух агентов', { skip: !enabled }, async () => {
  const first = await database.connect()
  const second = await database.connect()
  try {
    assert.equal((await first.query('SELECT pg_try_advisory_lock($1) AS locked', [DEPLOY_LOCK])).rows[0].locked, true)
    assert.equal((await second.query('SELECT pg_try_advisory_lock($1) AS locked', [DEPLOY_LOCK])).rows[0].locked, false)
  } finally {
    await first.query('SELECT pg_advisory_unlock($1)', [DEPLOY_LOCK])
    first.release(); second.release()
  }
})

it('каталог принимает только неизменяемые разрешённые digest и атомарно обновляет доступность', { skip: !enabled }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wc-catalog-'))
  const client = await database.connect()
  try {
    const file = path.join(root, 'index.json')
    await writeFile(file, JSON.stringify([release]))
    await syncCatalog(new DeploymentStore(client), file, { frontend: 'example/frontend', backend: 'example/backend' })
    await writeFile(file, JSON.stringify([{ ...release, backend: `example/backend@sha256:${'c'.repeat(64)}` }]))
    await assert.rejects(syncCatalog(new DeploymentStore(client), file, { frontend: 'example/frontend', backend: 'example/backend' }))
    const current = (await database.query('SELECT * FROM deployment_releases')).rows[0]
    assert.equal(current.manifest.backend, release.backend)
    assert.equal(current.available, true)
  } finally { client.release(); await rm(root, { recursive: true, force: true }) }
})

it('запрашивает поиск версий в Registry и возвращает время проверки без секретов', { skip: !enabled }, async () => {
  assert.equal((await request('POST', '/refresh', {}, 'admin')).status, 403)
  assert.equal((await request('POST', '/refresh', {}, 'superadmin', { 'x-impersonate': 'true' })).status, 403)
  const refreshed = await request('POST', '/refresh', {})
  assert.equal(refreshed.status, 200)
  assert.equal(refreshed.data.catalog_refresh_requested, true)
  await database.query("UPDATE deployment_state SET catalog_checked_at = NOW(), catalog_source = 'https://nexus.example'")
  const state = (await request('GET')).data
  assert.equal(state.catalog_refresh_requested, true)
  assert.equal(state.catalog_source, 'https://nexus.example')
  assert.ok(state.catalog_checked_at)
})

it('сортирует версии численно и допускает перенос тех же digest в Nexus без подмены релиза', { skip: !enabled }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wc-nexus-'))
  const client = await database.connect()
  try {
    const file = path.join(root, 'index.json')
    const values = [release, { ...release, version: '1.2.10' }, { ...release, version: '1.2.9' }]
    await writeFile(file, JSON.stringify(values))
    await syncCatalog(new DeploymentStore(client), file, { frontend: 'example/frontend', backend: 'example/backend' })
    assert.deepEqual((await request('GET')).data.releases.map(item => item.version), ['1.2.10', '1.2.9', '1.2.3'])
    const moved = { ...release, frontend: release.frontend.replace('example/', 'nexus.example/example/'), backend: release.backend.replace('example/', 'nexus.example/example/') }
    await writeFile(file, JSON.stringify([moved]))
    await syncCatalog(new DeploymentStore(client), file, { frontend: 'nexus.example/example/frontend', backend: 'nexus.example/example/backend' })
    assert.equal((await request('GET')).data.releases[0].frontend, moved.frontend)
  } finally { client.release(); await rm(root, { recursive: true, force: true }) }
})
