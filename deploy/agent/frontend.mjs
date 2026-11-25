import { createHost, readHostConfig } from './host.mjs'

try {
  const config = await readHostConfig(process.env.DEPLOY_HOST_CONFIG || '/etc/worker-cabinet/frontend-deploy.json')
  if (config.role !== 'frontend') throw new Error('Некорректная роль сервера')
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (input.length > 4096) throw new Error('Слишком большой запрос')
  }
  const { action, payload } = JSON.parse(input)
  const result = await createHost(config).perform(action, payload)
  process.stdout.write(JSON.stringify(result))
} catch {
  process.stderr.write('Операция обновления фронтенда завершилась с ошибкой\n')
  process.exitCode = 1
}
