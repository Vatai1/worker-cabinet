import { readHostConfig, command } from '../../../deploy/agent/host.mjs'
import { startAgent } from './agent.js'
import { registryServer } from './registry.js'

try {
  const config = await readHostConfig(process.env.DEPLOY_HOST_CONFIG)
  if (process.env.DEPLOY_REGISTRY_USERNAME) {
    const server = registryServer(config.repository)
    await command('docker', ['login', server, '--username', process.env.DEPLOY_REGISTRY_USERNAME, '--password-stdin'], { input: process.env.DEPLOY_REGISTRY_PASSWORD || '', timeout: 30000 })
  }
  if (config.role === 'frontend') {
    setInterval(() => {}, 3600000)
    process.once('SIGTERM', () => process.exit(0))
    process.once('SIGINT', () => process.exit(0))
  } else {
    await startAgent()
  }
} catch {
  console.error('Не удалось запустить сервис деплоя. Проверьте настройки, Docker и доступ к реестру.')
  process.exitCode = 1
}
