import { createHost, readHostConfig } from './host.mjs'

try {
  const config = await readHostConfig(process.env.DEPLOY_HOST_CONFIG)
  if (config.role !== 'frontend') throw new Error('Некорректная роль сервера')
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (input.length > 4096) throw new Error('Слишком большой запрос')
  }
  const { action, payload } = JSON.parse(input)
  if (!['inspect', 'pull', 'deploy', 'maintenance'].includes(action)) throw new Error('Недопустимая операция фронтенда')
  const result = await createHost(config).perform(action, payload)
  process.stdout.write(JSON.stringify(result))
} catch {
  process.stderr.write('Операция обновления фронтенда завершилась с ошибкой\n')
  process.exitCode = 1
}
