import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runDeployment, recoverInterrupted, resolveDeployment } from '../deployment/orchestrator.js'
import { validateRelease, validateSettings } from '../deployment/validation.js'
import { createHost, command } from '../../../deploy/agent/host.mjs'

const release = { version: '1.2.3', commit: 'abcdef0', backend: `example/backend@sha256:${'a'.repeat(64)}`, frontend: `example/frontend@sha256:${'b'.repeat(64)}` }
const job = { id: '12345678-1234-1234-1234-123456789abc', release, settings: { enabled: true, frontend_url: 'https://example.ru', backend_health_url: 'http://localhost:5000/api/health', health_timeout_seconds: 30 } }

function scenario(fail) {
  const calls = []
  const events = []
  const updates = []
  const backend = { reference: release.backend, running: true, healthy: true }
  const frontend = { reference: release.frontend, running: true }
  const operation = side => async (action, payload) => {
    calls.push(`${side}:${action}${action === 'maintenance' ? `:${payload.enabled}` : ''}`)
    if (`${side}:${action}` === fail) throw new Error('password=DO_NOT_EXPOSE')
    if (action === 'inspect') return side === 'host' ? { backend, worker: backend } : { frontend }
    if (action === 'backup') return { file: `${job.id}.dump` }
    if (action === 'migration_status') return { running: fail === 'migration_running' }
    return {}
  }
  const host = { perform: operation('host') }
  const remote = operation('remote')
  const store = { event: async (...args) => events.push(args), db: { query: async (sql, params) => {
    updates.push([sql, params])
    return { rows: sql.startsWith('UPDATE deployment_jobs SET status = \'recovery_required\'') ? [job] : [] }
  } } }
  const probe = async (_job, frontend, publicSite) => {
    calls.push(`probe:${frontend}:${!!publicSite}`)
    if ((fail === 'backend_health' && !frontend) || (fail === 'verify' && frontend)) throw new Error('Health timeout')
  }
  return { host, remote, store, probe, calls, events, updates }
}

it('обновляет два сервера одной версией, резервирует БД и снимает обслуживание после проверки', async () => {
  const s = scenario()
  await runDeployment(job, s)
  for (const action of ['host:pull', 'remote:pull', 'host:backup', 'host:migrate', 'host:deploy', 'remote:deploy', 'remote:maintenance:false']) assert.ok(s.calls.includes(action), action)
  assert.ok(s.calls.indexOf('host:backup') < s.calls.indexOf('host:migrate'))
  assert.ok(s.calls.indexOf('probe:false:false') < s.calls.indexOf('remote:deploy'))
  assert.ok(s.calls.indexOf('probe:true:false') < s.calls.indexOf('remote:maintenance:false'))
  assert.ok(s.updates.some(([sql]) => sql.includes("status = 'completed'")))
})

for (const failure of ['host:pull', 'remote:pull', 'host:inspect', 'remote:inspect']) {
  it(`останавливает ${failure} до изменения контейнеров`, async () => {
    const s = scenario(failure)
    await runDeployment(job, s)
    assert.ok(!s.calls.includes('host:stop'))
    assert.ok(!s.calls.includes('host:migrate'))
    assert.ok(s.updates.some(([, params]) => params?.[1] === 'failed'))
    assert.ok(!JSON.stringify(s.events).includes('DO_NOT_EXPOSE'))
  })
}

for (const failure of ['host:backup', 'host:migrate', 'host:deploy', 'backend_health', 'remote:deploy', 'verify']) {
  it(`при сбое ${failure} сохраняет блокировку восстановления и не продолжает опасные этапы`, async () => {
    const s = scenario(failure)
    await runDeployment(job, s)
    assert.ok(s.updates.some(([, params]) => params?.[1] === 'recovery_required'))
    assert.ok(!s.calls.includes('remote:maintenance:false'))
    if (['host:backup', 'host:migrate', 'host:deploy', 'backend_health'].includes(failure)) assert.ok(!s.calls.includes('remote:deploy'))
    assert.ok(!JSON.stringify(s.events).includes('DO_NOT_EXPOSE'))
  })
}

it('после перезапуска сверяет серверы и миграционный контейнер без повторного запуска миграций', async () => {
  const s = scenario()
  await recoverInterrupted(s.store, s.host, s.remote)
  assert.ok(s.calls.includes('host:migration_status'))
  assert.ok(!s.calls.includes('host:migrate'))
  assert.ok(!s.calls.includes('host:deploy'))
  assert.ok(s.events.some(([, stage]) => stage === 'interrupted'))
})

it('не снимает обслуживание во время ещё работающей миграции', async () => {
  const s = scenario('migration_running')
  await resolveDeployment(job, s)
  assert.ok(!s.calls.includes('remote:maintenance:false'))
  assert.ok(s.events.some(([, stage, status]) => stage === 'recovery' && status === 'failed'))
})

it('подтверждает восстановление после проверки БД и фактической готовности', async () => {
  const s = scenario()
  await resolveDeployment(job, s)
  assert.ok(s.calls.includes('remote:maintenance:false'))
  assert.ok(s.updates.some(([, params]) => params?.[1] === 'completed'))
})

it('отклоняет latest, чужие репозитории, команды и секреты в URL', () => {
  assert.deepEqual(validateRelease(release, { backend: 'example/backend', frontend: 'example/frontend' }), release)
  for (const image of ['example/backend:latest', `other/backend@sha256:${'a'.repeat(64)}`, `${release.backend};id`]) assert.throws(() => validateRelease({ ...release, backend: image }, { backend: 'example/backend', frontend: 'example/frontend' }))
  assert.throws(() => validateSettings({ ...job.settings, frontend_url: 'https://user:secret@example.ru' }))
  assert.throws(() => validateSettings({ ...job.settings, frontend_url: 'file:///etc/passwd' }))
  assert.throws(() => validateSettings({ ...job.settings, token: 'secret' }))
})

it('обновляет только сервисы приложения, закрепляет digest в .env и сохраняет остальные настройки', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wc-deploy-'))
  try {
    const file = path.join(root, '.env')
    await writeFile(file, 'DB_PASSWORD=server-only\nBACKEND_IMAGE=old:latest\n')
    const calls = []
    const host = createHost({ role: 'backend', root, compose: path.join(root, 'compose.yml'), env: file, project: 'wc', repository: 'example/backend' }, async (file, args) => { calls.push([file, args]); return '' })
    await host.perform('deploy', { image: release.backend })
    assert.equal(await readFile(file, 'utf8'), `DB_PASSWORD=server-only\nBACKEND_IMAGE=${release.backend}\n`)
    assert.ok(calls[0][1].includes('--no-deps'))
    assert.deepEqual(calls[0][1].slice(-2), ['backend', 'notification-worker'])
    assert.ok(!calls[0][1].includes('down'))
    await assert.rejects(host.perform('deploy', { image: 'example/backend:latest' }))
    await assert.rejects(host.perform('migrate', { image: release.backend, jobId: '../../etc' }))
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('команды не исполняют переданные значения как shell и ошибки не раскрывают stderr', async () => {
  const literal = '$(echo LEAK); `echo LEAK`'
  assert.equal(await command(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal]), literal)
  await assert.rejects(command(process.execPath, ['-e', 'process.stderr.write("password=DO_NOT_EXPOSE");process.exit(1)']), error => !error.message.includes('DO_NOT_EXPOSE'))
})
