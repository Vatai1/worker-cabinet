import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHost, command } from '../../../deploy/agent/host.mjs'

const enabled = process.env.DEPLOY_DOCKER_TEST === '1'
const repo = path.resolve(import.meta.dirname, '../../..')

it('резервная копия PostgreSQL восстанавливается в отдельную БД с исходными данными', { skip: !enabled, timeout: 120000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wc-backup-'))
  const project = `wc-backup-${Date.now()}`
  const composeFile = path.join(root, 'compose.json')
  const env = path.join(root, '.env')
  await writeFile(env, '')
  await writeFile(composeFile, JSON.stringify({ services: { postgres: { image: 'postgres:16-alpine', environment: { POSTGRES_USER: 'postgres', POSTGRES_DB: 'worker_cabinet', POSTGRES_HOST_AUTH_METHOD: 'trust' }, volumes: ['data:/var/lib/postgresql/data'] } }, volumes: { data: {} } }))
  const compose = args => command('docker', ['compose', '-p', project, '-f', composeFile, ...args])
  try {
    await compose(['up', '-d'])
    let ready = false
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await compose(['exec', '-T', 'postgres', 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break } catch { await delay(1000) }
    }
    assert.ok(ready)
    await compose(['exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'worker_cabinet', '-c', "CREATE TABLE backup_example (value TEXT); INSERT INTO backup_example VALUES ('Проверка сохранности')"])
    await compose(['exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'worker_cabinet', '-c', "CREATE TABLE backup_payload AS SELECT string_agg(md5(random()::text), '') AS value FROM generate_series(1, 200000)"])
    const host = createHost({ role: 'backend', root, compose: composeFile, env, project, repository: 'example/backend', backups: path.join(root, 'backups') })
    const backup = await host.perform('backup', { jobId: '12345678-1234-1234-1234-123456789abc' })
    await compose(['exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'worker_cabinet', '-c', 'DELETE FROM backup_example'])
    await compose(['exec', '-T', 'postgres', 'createdb', '-U', 'postgres', 'restored'])
    await command('docker', ['compose', '-p', project, '-f', composeFile, 'exec', '-T', 'postgres', 'pg_restore', '-U', 'postgres', '-d', 'restored'], { inputFile: path.join(root, 'backups', backup.file) })
    const restored = await compose(['exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'restored', '-Atc', 'SELECT value FROM backup_example'])
    assert.equal(restored, 'Проверка сохранности')
    assert.equal(await compose(['exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'worker_cabinet', '-Atc', 'SELECT count(*) FROM backup_example']), '0')
  } finally {
    await compose(['down', '-v']).catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

it('nginx блокирует сайт и обычный API при обслуживании, сохраняя проверки и доступ к состоянию деплоя', { skip: !enabled, timeout: 180000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wc-nginx-'))
  const name = `wc-nginx-${Date.now()}`
  const backend = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url.startsWith('/api/admin/deployment')) { res.writeHead(401); res.end('{"error":"Требуется авторизация"}'); return }
    res.end('{"status":"ok"}')
  })
  await new Promise(resolve => backend.listen(0, '0.0.0.0', resolve))
  try {
    await mkdir(path.join(root, 'maintenance'))
    await mkdir(path.join(root, 'html'))
    await writeFile(path.join(root, 'html/index.html'), '<html>Рабочий кабинет</html>')
    await writeFile(path.join(root, 'html/maintenance.html'), await readFile(path.join(repo, 'deploy/maintenance.html')))
    await writeFile(path.join(root, 'html/release.json'), '{"version":"1.2.3"}')
    let config = await readFile(path.join(repo, 'deploy/nginx-app.conf'), 'utf8')
    config = config.replace(/^server \{[\s\S]*?\n}\n\n/, '').replace('listen 443 ssl;', 'listen 80;').replace(/^\s*ssl_.*;$/gm, '')
    const values = { NGINX_SERVER_NAME: '_', BACKEND_HOST: 'host.docker.internal', BACKEND_PORT: String(backend.address().port), ONLYOFFICE_HOST: '127.0.0.1', ONLYOFFICE_PORT: '8080', MINIO_HOST: '127.0.0.1', MINIO_PORT: '9000' }
    config = config.replace(/\$\{([A-Z_]+)\}/g, (_, key) => values[key])
    await writeFile(path.join(root, 'nginx.conf'), config)
    await command('docker', ['run', '-d', '--rm', '--name', name, '--add-host', 'host.docker.internal:host-gateway', '-p', '127.0.0.1::80', '-v', `${root}/nginx.conf:/etc/nginx/conf.d/default.conf:ro`, '-v', `${root}/html:/usr/share/nginx/html:ro`, '-v', `${root}/maintenance:/etc/nginx/maintenance:ro`, 'nginx:alpine'])
    const address = await command('docker', ['port', name, '80/tcp'])
    const url = `http://${address}`
    let ready = false
    for (let attempt = 0; attempt < 30; attempt++) {
      try { if ((await fetch(url)).ok) { ready = true; break } } catch { }
      await delay(500)
    }
    assert.ok(ready)
    assert.equal((await fetch(`${url}/api/health`)).status, 200)
    await writeFile(path.join(root, 'maintenance/enabled'), 'Обновление')
    const maintenance = await fetch(url)
    assert.equal(maintenance.status, 503)
    assert.match(await maintenance.text(), /Обновляем систему/)
    assert.equal((await fetch(`${url}/api/users`)).status, 503)
    assert.equal((await fetch(`${url}/release.json`)).status, 200)
    assert.equal((await fetch(`${url}/api/health`)).status, 200)
    assert.equal((await fetch(`${url}/api/admin/deployment`)).status, 401)
    assert.equal((await fetch(`${url}/api/admin/deployment/jobs`, { method: 'POST' })).status, 401)
    await rm(path.join(root, 'maintenance/enabled'))
    assert.equal((await fetch(url)).status, 200)
  } finally {
    await command('docker', ['rm', '-f', name]).catch(() => {})
    await new Promise(resolve => backend.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
})

it('миграционный контейнер выполняется один раз и сохраняет код выхода без автоматического перезапуска', { skip: !enabled || !process.env.DEPLOY_TEST_AGENT_IMAGE, timeout: 120000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wc-migration-'))
  const image = JSON.parse(await command('docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', process.env.DEPLOY_TEST_AGENT_IMAGE]))[0]
  const project = `wc-migration-${Date.now()}`
  const composeFile = path.join(root, 'compose.json')
  const env = path.join(root, '.env')
  const ids = ['12345678-1234-1234-1234-123456789ab1', '12345678-1234-1234-1234-123456789ab2']
  try {
    await writeFile(env, `BACKEND_IMAGE=${image}\n`)
    await writeFile(composeFile, JSON.stringify({ services: { backend: { image: '${BACKEND_IMAGE}', restart: 'unless-stopped', working_dir: '/task', volumes: [`${root}:/task`] } } }))
    const host = createHost({ role: 'backend', root, compose: composeFile, env, project, repository: image.split('@')[0] })
    for (const [index, id] of ids.entries()) {
      await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { migrate: `node -e "console.log('migration-once');process.exit(${index})"` } }))
      if (index === 0) await host.perform('migrate', { image, jobId: id })
      else await assert.rejects(host.perform('migrate', { image, jobId: id }))
      const policy = await command('docker', ['inspect', '--format', '{{.HostConfig.RestartPolicy.Name}}', `wc-migration-${id}`])
      assert.equal(policy, 'no')
      const status = await host.perform('migration_status', { jobId: id })
      assert.equal(status.running, false)
      assert.equal(status.exit_code, index)
      assert.equal((await command('docker', ['logs', `wc-migration-${id}`])).match(/^migration-once$/gm)?.length, 1)
    }
  } finally {
    for (const id of ids) await command('docker', ['rm', '-f', `wc-migration-${id}`]).catch(() => {})
    await command('docker', ['compose', '-p', project, '-f', composeFile, 'down']).catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})
