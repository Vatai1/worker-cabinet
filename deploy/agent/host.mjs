import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, writeFile, rename, mkdir, rm, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

export async function command(file, args, { cwd, input, inputFile, outputFile, allowEarlyInputClose = false, signal, timeout = 900000, env = process.env } = {}) {
  const cleanEnv = { ...env }
  for (const key of ['BACKEND_IMAGE', 'FRONTEND_IMAGE', 'COMPOSE_FILE', 'COMPOSE_PROFILES']) delete cleanEnv[key]
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env: cleanEnv, stdio: ['pipe', 'pipe', 'pipe'], signal })
    let output = ''
    let streamError
    child.stderr.resume()
    child.stdin.on('error', () => {})
    const outputPromise = outputFile
      ? pipeline(child.stdout, createWriteStream(outputFile, { flags: 'wx', mode: 0o600 })).catch(error => { streamError = error; child.kill('SIGKILL') })
      : Promise.resolve()
    if (!outputFile) child.stdout.on('data', data => {
      output += data
      if (output.length > 1048576) { streamError = new Error('Слишком большой ответ команды'); child.kill('SIGKILL') }
    })
    const inputPromise = inputFile
      ? pipeline(createReadStream(inputFile), child.stdin).catch(error => {
        if (allowEarlyInputClose && ['EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code)) return
        streamError = error; child.kill('SIGKILL')
      })
      : Promise.resolve(child.stdin.end(input || ''))
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', async code => {
      clearTimeout(timer)
      await Promise.all([inputPromise, outputPromise])
      if (code !== 0 || streamError) reject(new Error('Команда сервера завершилась с ошибкой; проверьте журнал Docker на сервере'))
      else resolve(output.trim())
    })
  })
}

export async function readHostConfig(file, env = process.env) {
  const role = env.DEPLOY_ROLE || 'backend'
  const root = env.DEPLOY_ROOT
  const config = file ? JSON.parse(await readFile(file, 'utf8')) : {
    role, root,
    project: env.DEPLOY_PROJECT,
    compose: env.DEPLOY_COMPOSE_FILE,
    env: env.DEPLOY_APP_ENV_FILE,
    repository: role === 'frontend' ? env.DEPLOY_FRONTEND_REPOSITORY : env.DEPLOY_BACKEND_REPOSITORY,
    backups: env.DEPLOY_BACKUP_DIR || (root && path.join(root, 'backups')),
    maintenance: env.DEPLOY_MAINTENANCE_DIR || (root && path.join(root, 'maintenance')),
  }
  if (!['backend', 'frontend'].includes(config.role) || !/^[a-z0-9][a-z0-9_-]*$/.test(config.project || '') || !/^[a-z0-9][a-z0-9./:_-]+$/.test(config.repository || '')) throw new Error('Некорректная конфигурация сервера')
  for (const key of ['root', 'compose', 'env']) if (!path.isAbsolute(config[key] || '')) throw new Error('Пути конфигурации должны быть абсолютными')
  if (config.role === 'backend' && !path.isAbsolute(config.backups || '')) throw new Error('Укажите абсолютный путь резервных копий')
  if (config.role === 'frontend' && !path.isAbsolute(config.maintenance || '')) throw new Error('Укажите каталог режима обслуживания')
  return config
}

export function createHost(config, run = command, signal) {
  const services = config.role === 'backend' ? ['backend', 'notification-worker'] : ['frontend']
  const composeArgs = ['compose', '--project-name', config.project, '--project-directory', config.root, '--env-file', config.env, '-f', config.compose]
  const docker = (args, options = {}) => run('docker', args, { cwd: config.root, signal, ...(['inspect', 'ps'].includes(args[0]) ? { timeout: 10000 } : {}), ...options })
  const compose = (args, options) => docker([...composeArgs, ...args], options)
  const validateImage = image => {
    if (typeof image !== 'string' || !image.startsWith(`${config.repository}@sha256:`) || !/^[a-f0-9]{64}$/.test(image.split('@sha256:')[1] || '')) throw new Error('Недопустимый образ')
  }
  const migrationName = jobId => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(jobId || '')) throw new Error('Некорректный номер задания')
    return `wc-migration-${jobId}`
  }
  const inspectContainer = async id => {
    const format = '{"reference":{{json .Config.Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"version":{{json (index .Config.Labels "org.opencontainers.image.version")}},"restart_count":{{json .RestartCount}},"image_id":{{json .Image}}}'
    const data = JSON.parse(await docker(['inspect', '--format', format, id]))
    return { ...data, healthy: data.health === 'healthy' }
  }
  const serviceIds = async service => (await docker(['ps', '-a', '-q', '--filter', `label=com.docker.compose.project=${config.project}`, '--filter', `label=com.docker.compose.service=${service}`, '--filter', 'label=com.docker.compose.oneoff=False'])).split(/\s+/).filter(Boolean)
  const inspect = async () => {
    await compose(['version'], { timeout: 10000 })
    const result = {}
    const containers = {}
    for (const service of services) {
      const ids = await serviceIds(service)
      if (ids.length !== 1) throw new Error('Ожидается один контейнер каждого сервиса')
      containers[service] = ids[0]
      result[service === 'notification-worker' ? 'worker' : service] = await inspectContainer(ids[0])
    }
    if (config.role === 'frontend') {
      await mkdir(config.maintenance, { recursive: true })
      const id = containers.frontend
      const mounts = JSON.parse(await docker(['inspect', '--format', '{{json .Mounts}}', id]))
      if (!mounts.some(mount => mount.Destination === '/etc/nginx/maintenance' && path.resolve(mount.Source) === path.resolve(config.maintenance))) throw new Error('Каталог обслуживания не подключён к frontend')
      await docker(['exec', id, 'sh', '-c', 'grep -q /etc/nginx/maintenance/enabled /etc/nginx/conf.d/default.conf'], { timeout: 10000 })
      result.maintenance = await stat(path.join(config.maintenance, 'enabled')).then(() => true, () => false)
    }
    return result
  }
  const persistImage = async image => {
    validateImage(image)
    const key = config.role === 'backend' ? 'BACKEND_IMAGE' : 'FRONTEND_IMAGE'
    const content = await readFile(config.env, 'utf8')
    const lines = content.split('\n').filter(line => !new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line))
    const tmp = `${config.env}.deployment.tmp`
    await writeFile(tmp, `${lines.join('\n').replace(/\n*$/, '')}\n${key}=${image}\n`, { mode: 0o600 })
    await rename(tmp, config.env)
  }
  return {
    async perform(action, payload = {}) {
      if (action === 'inspect') return inspect()
      if (action === 'pull') { validateImage(payload.image); await docker(['pull', payload.image]); return {} }
      if (action === 'deploy') {
        await persistImage(payload.image)
        await compose(['up', '-d', '--no-deps', '--pull', 'never', '--force-recreate', ...services])
        return {}
      }
      if (action === 'maintenance' && config.role === 'frontend' && typeof payload.enabled === 'boolean') {
        await mkdir(config.maintenance, { recursive: true })
        const file = path.join(config.maintenance, 'enabled')
        if (payload.enabled) await writeFile(file, 'Обновление системы\n')
        else await rm(file, { force: true })
        return {}
      }
      if (config.role !== 'backend') throw new Error('Недопустимая операция фронтенда')
      if (action === 'stop') { await compose(['stop', ...services]); return {} }
      if (action === 'backup') {
        migrationName(payload.jobId)
        await mkdir(config.backups, { recursive: true, mode: 0o700 })
        const file = path.join(config.backups, `${payload.jobId}.dump`)
        await compose(['exec', '-T', 'postgres', 'sh', '-c', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], { outputFile: `${file}.partial` })
        if ((await stat(`${file}.partial`)).size < 100) throw new Error('Резервная копия пуста')
        await compose(['exec', '-T', 'postgres', 'pg_restore', '--list'], { inputFile: `${file}.partial`, allowEarlyInputClose: true })
        await rename(`${file}.partial`, file)
        return { file: `${payload.jobId}.dump` }
      }
      if (action === 'migrate') {
        const name = migrationName(payload.jobId)
        await persistImage(payload.image)
        await docker([...composeArgs, '-f', '-', 'run', '-d', '--no-deps', '--pull', 'never', '--name', name, '--entrypoint', 'npm', 'backend', 'run', 'migrate'], { input: JSON.stringify({ services: { backend: { restart: 'no' } } }) })
        const code = await docker(['wait', name])
        if (code !== '0') throw new Error('Миграции завершились с ошибкой')
        return {}
      }
      if (action === 'migration_status') {
        const name = migrationName(payload.jobId)
        const id = await docker(['ps', '-a', '-q', '--filter', `name=^/${name}$`])
        if (!id) return { running: false, exists: false }
        const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', id]))
        return { exists: true, running: state.Running, exit_code: state.ExitCode }
      }
      throw new Error('Недопустимая операция сервера')
    },
  }
}
