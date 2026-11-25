import { matchesRelease } from './validation.js'

export async function runDeployment(job, { host, remote, store, probe }) {
  let destructive = false
  let currentStage = 'preflight'
  let currentMessage = 'Проверка серверов'
  const step = async (stage, message, fn) => {
    currentStage = stage
    currentMessage = message
    await store.event(job.id, stage, 'running', message)
    const result = await fn()
    await store.event(job.id, stage, 'completed', message)
    return result
  }
  try {
    const before = await step('preflight', 'Проверка серверов и текущих образов', async () => {
      const [backend, frontend] = await Promise.all([host.perform('inspect'), remote('inspect')])
      return { ...backend, ...frontend }
    })
    await store.db.query('UPDATE deployment_jobs SET before_state = $2 WHERE id = $1', [job.id, before])
    await step('pull', 'Скачивание образов на оба сервера', async () => {
      const results = await Promise.allSettled([host.perform('pull', { image: job.release.backend }), remote('pull', { image: job.release.frontend })])
      if (results.some(result => result.status === 'rejected')) throw new Error('Не удалось скачать образы')
    })
    destructive = true
    await step('maintenance', 'Включение режима обслуживания и остановка API и воркера', async () => {
      await remote('maintenance', { enabled: true })
      await host.perform('stop')
    })
    const backup = await step('backup', 'Резервная копия и проверка архива PostgreSQL', () => host.perform('backup', { jobId: job.id }))
    await store.db.query('UPDATE deployment_jobs SET backup = $2 WHERE id = $1', [job.id, backup.file])
    await step('migrate', 'Миграции из нового образа', () => host.perform('migrate', { image: job.release.backend, jobId: job.id }))
    await step('backend', 'Запуск нового API и воркера уведомлений', () => host.perform('deploy', { image: job.release.backend }))
    await step('backend_health', 'Ожидание готовности API и воркера', () => probe(job, false))
    await step('frontend', 'Запуск нового фронтенда', () => remote('deploy', { image: job.release.frontend }))
    await step('verify', 'Проверка версий, сайта и API через nginx', () => probe(job, true))
    await step('maintenance_off', 'Отключение режима обслуживания', () => remote('maintenance', { enabled: false }))
    await step('public_health', 'Проверка доступности сайта после обновления', () => probe(job, true, true))
    await store.db.query("UPDATE deployment_jobs SET status = 'completed', finished_at = NOW(), updated_at = NOW() WHERE id = $1", [job.id])
  } catch {
    const status = destructive ? 'recovery_required' : 'failed'
    if (destructive) {
      try { await remote('maintenance', { enabled: true }) } catch { }
    }
    await store.event(job.id, currentStage, 'failed', `${currentMessage}: ошибка. ${destructive
      ? 'Проверьте контейнеры и журнал Docker на обоих серверах; миграции автоматически не повторяются. Требуется восстановление.'
      : 'Контейнеры не изменены. Проверьте доступ к серверам и реестру образов.'}`)
    await store.db.query('UPDATE deployment_jobs SET status = $2, finished_at = CASE WHEN $2 = \'failed\' THEN NOW() ELSE NULL END, updated_at = NOW() WHERE id = $1', [job.id, status])
  } finally {
    try {
      const [backend, frontend] = await Promise.all([host.perform('inspect'), remote('inspect')])
      const observed = { ...backend, ...frontend }
      await store.db.query('UPDATE deployment_jobs SET after_state = $2 WHERE id = $1', [job.id, observed])
      await store.db.query('UPDATE deployment_state SET observed = $1 WHERE id = 1', [observed])
    } catch { }
  }
}

export async function recoverInterrupted(store, host, remote) {
  const jobs = (await store.db.query("UPDATE deployment_jobs SET status = 'recovery_required', resolution_requested = false WHERE status = 'running' RETURNING *")).rows
  for (const job of jobs) {
    await store.event(job.id, 'interrupted', 'failed', 'Сервис деплоя был перезапущен. Автоматическое повторение миграций запрещено; проверьте фактическое состояние серверов.')
    try {
      const [backend, frontend, migration] = await Promise.all([host.perform('inspect'), remote('inspect'), host.perform('migration_status', { jobId: job.id })])
      await store.db.query('UPDATE deployment_jobs SET after_state = $2 WHERE id = $1', [job.id, { ...backend, ...frontend, migration }])
    } catch { }
  }
}

export async function resolveDeployment(job, { host, remote, store, probe }) {
  try {
    const migration = await host.perform('migration_status', { jobId: job.id })
    if (migration.running) throw new Error('Миграции ещё выполняются')
    await probe(job, false, false, true)
    const [backend, frontend] = await Promise.all([host.perform('inspect'), remote('inspect')])
    if (!backend.backend?.running || !backend.worker?.running || !frontend.frontend?.running) throw new Error('Контейнеры не готовы')
    await remote('maintenance', { enabled: false })
    await probe(job, false, true, true)
    const status = matchesRelease({ ...backend, ...frontend }, job.release) ? 'completed' : 'failed'
    await store.event(job.id, 'resolved', 'completed', 'Администратор подтвердил проверку БД; доступность серверов проверена, режим обслуживания снят')
    await store.db.query('UPDATE deployment_jobs SET status = $2, after_state = $3, resolution_requested = false, finished_at = NOW(), updated_at = NOW() WHERE id = $1', [job.id, status, { ...backend, ...frontend }])
  } catch {
    await store.event(job.id, 'recovery', 'failed', 'Восстановление не подтверждено: проверьте миграционный контейнер, готовность API, воркера и сайта')
    await store.db.query('UPDATE deployment_jobs SET resolution_requested = false WHERE id = $1', [job.id])
  }
}
