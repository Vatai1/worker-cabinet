import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { pool } from '../config/database.js'
import { createHost, command, readHostConfig } from '../../../deploy/agent/host.mjs'
import { DeploymentStore, DEPLOY_LOCK } from './store.js'
import { validateRelease, validateSettings, matchesRelease } from './validation.js'
import { recoverInterrupted, runDeployment, resolveDeployment } from './orchestrator.js'
import { RegistryClient, registryOrigin, dockerCredentials } from './registry.js'

export async function syncCatalog(store, file, repositories) {
  const text = await readFile(file, 'utf8')
  if (text.length > 1048576) throw new Error('Слишком большой каталог релизов')
  const values = JSON.parse(text)
  if (!Array.isArray(values) || values.length > 500) throw new Error('Некорректный каталог релизов')
  return syncReleases(store, values, repositories)
}

export async function syncReleases(store, values, repositories) {
  const releases = values.map(value => validateRelease(value, repositories))
  if (new Set(releases.map(release => release.version)).size !== releases.length) throw new Error('Повтор версии в каталоге')
  await store.db.query('BEGIN')
  try {
    await store.db.query('UPDATE deployment_releases SET available = false')
    for (const release of releases) {
      const existing = (await store.db.query('SELECT manifest FROM deployment_releases WHERE version = $1', [release.version])).rows[0]
      if (existing && (existing.manifest.commit !== release.commit || ['frontend', 'backend'].some(key => existing.manifest[key].split('@')[1] !== release[key].split('@')[1]))) throw new Error('Опубликованный релиз нельзя перезаписывать')
      await store.db.query(`INSERT INTO deployment_releases (version, manifest) VALUES ($1, $2)
        ON CONFLICT (version) DO UPDATE SET available = true, manifest = EXCLUDED.manifest`, [release.version, release])
    }
    await store.db.query('COMMIT')
    await store.db.query('UPDATE deployment_state SET catalog_error = NULL, catalog_checked_at = NOW() WHERE id = 1')
  } catch (error) { await store.db.query('ROLLBACK'); throw error }
}

export function createProbe(host, remote, store, signal) {
  const request = async url => {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), redirect: 'error', headers: { 'Cache-Control': 'no-cache' } })
    if (!response.ok) throw new Error('Проверка доступности не пройдена')
    return response
  }
  return async (job, includeFrontend, publicSite = false, acceptCurrent = false) => {
    const deadline = Date.now() + job.settings.health_timeout_seconds * 1000
    let stableWorker
    while (Date.now() < deadline) {
      signal.throwIfAborted()
      try {
        const backend = await host.perform('inspect')
        const health = await (await request(job.settings.backend_health_url)).json()
        if (health.status !== 'ok' || !backend.backend?.healthy || !backend.worker?.running) throw new Error('API или воркер не готовы')
        if (!acceptCurrent && (backend.backend.reference !== job.release.backend || backend.worker.reference !== job.release.backend)) throw new Error('Неверный образ API')
        const worker = `${backend.worker.image_id}:${backend.worker.restart_count}`
        if (worker !== stableWorker) { stableWorker = worker; throw new Error('Ожидание стабильного запуска воркера') }
        let observed = backend
        if (includeFrontend || publicSite) {
          const frontend = await remote('inspect')
          observed = { ...backend, ...frontend }
          const url = new URL(job.settings.frontend_url)
          if (!frontend.frontend?.running) throw new Error('Фронтенд не готов')
          if (includeFrontend) {
            const release = await (await request(new URL('/release.json', url))).json()
            if (release.version !== job.release.version || !matchesRelease(observed, job.release)) throw new Error('Версии серверов различаются')
          }
          const api = await (await request(new URL('/api/health', url))).json()
          if (api.status !== 'ok') throw new Error('API через nginx недоступен')
          if (publicSite) await request(url)
        }
        await store.db.query('UPDATE deployment_state SET observed = $1, host_error = NULL WHERE id = 1', [observed])
        return
      } catch {
        await delay(3000, undefined, { signal })
      }
    }
    throw new Error('Истекло время ожидания готовности серверов')
  }
}

export async function startAgent() {
  const config = await readHostConfig(process.env.DEPLOY_HOST_CONFIG)
  if (config.role !== 'backend') throw new Error('Сервис запускается на backend-сервере')
  const target = process.env.DEPLOY_SSH_TARGET || ''
  if (!/^[a-z_][a-z0-9_-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(target)) throw new Error('Укажите SSH-пользователя и адрес фронтенда')
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  const signal = controller.signal
  const repositories = { backend: config.repository, frontend: process.env.DEPLOY_FRONTEND_REPOSITORY }
  const credentials = await dockerCredentials(process.env, config.repository)
  const registry = new RegistryClient({ url: process.env.DEPLOY_REGISTRY_URL || registryOrigin(config.repository), ...credentials, allowHttp: process.env.DEPLOY_REGISTRY_ALLOW_HTTP === 'true', authOrigins: (process.env.DEPLOY_REGISTRY_AUTH_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean), platform: process.env.DEPLOY_PLATFORM || 'linux/amd64', signal })
  const interval = Number(process.env.DEPLOY_REGISTRY_POLL_SECONDS || 30)
  const sshPort = Number(process.env.DEPLOY_SSH_PORT || 22)
  if (!Number.isInteger(interval) || interval < 30 || interval > 86400 || !Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) throw new Error('Некорректный интервал проверки или SSH-порт')
  const client = await pool.connect()
  client.on('error', stop)
  let nextScan = 0
  let lastScan = 0
  let heartbeat
  try {
    const locked = (await client.query('SELECT pg_try_advisory_lock($1) AS locked', [DEPLOY_LOCK])).rows[0].locked
    if (!locked) throw new Error('Другой сервис деплоя уже работает')
    const store = new DeploymentStore(client)
    const host = createHost(config, command, signal)
    const remote = async (action, payload = {}) => JSON.parse(await command('ssh', [
      '-F', '/dev/null', '-T', '-p', String(sshPort), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'IdentitiesOnly=yes',
      '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
      '-o', `UserKnownHostsFile=${process.env.DEPLOY_SSH_KNOWN_HOSTS}`, '-i', process.env.DEPLOY_SSH_KEY, target,
    ], { input: JSON.stringify({ action, payload }), signal }))
    const probe = createProbe(host, remote, store, signal)
    heartbeat = setInterval(() => {
      client.query('UPDATE deployment_state SET heartbeat_at = NOW() WHERE id = 1').catch(stop)
    }, 5000)
    await recoverInterrupted(store, host, remote)
    await client.query("UPDATE deployment_jobs SET resolution_requested = false WHERE status = 'recovery_required'")
    while (!signal.aborted) {
      const state = await store.state()
      if (Date.now() >= nextScan || (state.catalog_refresh_requested && Date.now() - lastScan >= 30000)) {
        lastScan = Date.now()
        await client.query('UPDATE deployment_state SET catalog_refresh_requested = false, catalog_source = $1 WHERE id = 1', [registry.base.href])
        try {
          await syncReleases(store, await registry.discover(repositories), repositories)
        } catch {
          await client.query("UPDATE deployment_state SET catalog_error = 'Не удалось проверить версии в Docker Registry. Проверьте адрес Nexus, доступ, сертификаты и неизменяемость опубликованных версий' WHERE id = 1")
        }
        nextScan = lastScan + interval * 1000
      }
      let ready = false
      try {
        const [backend, frontend] = await Promise.all([host.perform('inspect'), remote('inspect')])
        await client.query('UPDATE deployment_state SET observed = $1, host_error = NULL, heartbeat_at = NOW() WHERE id = 1', [{ ...backend, ...frontend }])
        ready = true
      } catch {
        await client.query("UPDATE deployment_state SET host_error = 'Не удалось проверить оба сервера', heartbeat_at = NOW() WHERE id = 1")
      }
      const recovery = (await client.query("SELECT * FROM deployment_jobs WHERE status = 'recovery_required' AND resolution_requested LIMIT 1")).rows[0]
      if (recovery) await resolveDeployment(recovery, { host, remote, store, probe })
      const queued = ready && (await client.query("UPDATE deployment_jobs SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = (SELECT id FROM deployment_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1) RETURNING *")).rows[0]
      if (queued) {
        validateSettings(queued.settings)
        validateRelease(queued.release, { backend: config.repository, frontend: process.env.DEPLOY_FRONTEND_REPOSITORY })
        await runDeployment(queued, { host, remote, store, probe })
      }
      await delay(5000, undefined, { signal })
    }
  } finally {
    clearInterval(heartbeat)
    await client.query('SELECT pg_advisory_unlock($1)', [DEPLOY_LOCK]).catch(() => {})
    client.release(true)
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startAgent().catch(() => {
    console.error('Сервис деплоя остановлен. Проверьте конфигурацию, доступ к БД, Docker и SSH; незавершённое обновление потребует проверки.')
    process.exitCode = 1
  })
}
