#!/usr/bin/env node

import { spawn, execSync } from 'child_process'
import { existsSync, copyFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_DIR = join(__dirname, '..')
const DEPLOY_DIR = __dirname

const COLORS = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  reset: '\x1b[0m'
}

const log = {
  info: (msg) => console.log(`${COLORS.blue}ℹ ${COLORS.reset}${msg}`),
  success: (msg) => console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`),
  warning: (msg) => console.log(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`),
  error: (msg) => console.log(`${COLORS.red}✗${COLORS.reset} ${msg}`)
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? true : false

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell,
      cwd: options.cwd || PROJECT_DIR,
      env: { ...process.env, ...options.env }
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Command failed with code ${code}`))
      }
    })

    child.on('error', (err) => {
      reject(err)
    })
  })
}

function runCommandAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? true : false

    const child = spawn(command, args, {
      stdio: 'pipe',
      shell,
      cwd: options.cwd || PROJECT_DIR,
      env: { ...process.env, ...options.env }
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })

    child.on('error', (err) => {
      reject(err)
    })
  })
}

function commandExists(cmd) {
  try {
    const isWindows = process.platform === 'win32'
    const checkCmd = isWindows ? 'where' : 'which'
    execSync(`${checkCmd} ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question(query, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

async function killPortProcess(port) {
  const isWindows = process.platform === 'win32'

  try {
    if (isWindows) {
      const result = await runCommandAsync('netstat', ['-ano'])
      const lines = result.stdout.split('\n')
      const portLine = lines.find(line => line.includes(`:${port}`) && line.includes('LISTENING'))

      if (portLine) {
        const parts = portLine.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && !isNaN(pid)) {
          log.info(`Завершение процесса на порту ${port} (PID: ${pid})...`)
          await runCommandAsync('taskkill', ['/PID', pid, '/F'])
          log.success(`Процесс на порту ${port} завершен`)
        }
      }
    } else {
      const result = await runCommandAsync('lsof', ['-ti', `:${port}`])
      const pids = result.stdout.trim().split('\n').filter(p => p)

      if (pids.length > 0) {
        log.info(`Завершение процесса на порту ${port} (PID: ${pids.join(', ')})...`)
        await runCommandAsync('kill', ['-9', ...pids])
        log.success(`Процесс на порту ${port} завершен`)
      }
    }
  } catch {
    // Порт свободен или процесс не найден
  }
}

async function killDevPorts() {
  await killPortProcess(3000)
  await killPortProcess(5000)
}

const COMPOSE_DEV = ['-f', 'docker-compose.dev.yml']
const COMPOSE_BACKEND = ['-f', 'docker-compose.backend.yml']
const COMPOSE_FRONTEND = ['-f', 'docker-compose.frontend.yml']

// ==================== DEV COMMANDS ====================

async function checkRequirements() {
  log.info('Проверка зависимостей...')

  if (!commandExists('docker')) {
    log.error('Docker не установлен')
    process.exit(1)
  }

  if (!commandExists('node')) {
    log.error('Node.js не установлен')
    process.exit(1)
  }

  if (!commandExists('npm')) {
    log.error('npm не установлен')
    process.exit(1)
  }

  log.success('Все зависимости установлены')
}

async function setupEnv() {
  const envPath = join(PROJECT_DIR, 'backend', '.env')
  const envExamplePath = join(PROJECT_DIR, 'backend', '.env.example')

  if (!existsSync(envPath)) {
    log.warning('Файл .env не найден, копирую .env.example')
    copyFileSync(envExamplePath, envPath)
  }
}

async function startDevServices() {
  log.info('Запуск сервисов (PostgreSQL, MinIO, OnlyOffice, RabbitMQ, Keycloak, Hermes, SearXNG)...')
  await runCommand('docker-compose', [...COMPOSE_DEV, 'up', '-d'], { cwd: DEPLOY_DIR })
  log.success('Сервисы запущены')

  log.info('Ожидание готовности PostgreSQL...')
  await sleep(5000)

  let retries = 0
  const maxRetries = 30

  while (retries < maxRetries) {
    try {
      const result = await runCommandAsync('docker', ['exec', 'worker-cabinet-db', 'pg_isready', '-U', 'postgres'])
      if (result.code === 0) break
    } catch {}
    await sleep(1000)
    retries++
  }

  log.success('PostgreSQL готов к работе')

  log.info('Ожидание готовности Keycloak...')
  let kcRetries = 0
  const kcMaxRetries = 30
  while (kcRetries < kcMaxRetries) {
    try {
      const kcResult = await runCommandAsync('docker', ['exec', 'wc-keycloak', 'bash', '-c', 'timeout 2 bash -c \x27</dev/tcp/localhost/8080\x27'])
      if (kcResult.code === 0) break
    } catch {}
    await sleep(2000)
    kcRetries++
  }
  if (kcRetries === kcMaxRetries) {
    log.warning('Keycloak не запустился вовремя')
  } else {
    log.success('Keycloak готов')
  }
}

async function installDependencies() {
  log.info('Установка зависимостей...')
  await runCommand('npm', ['install'])
  await runCommand('npm', ['install'], { cwd: join(PROJECT_DIR, 'backend') })
  await runCommand('npm', ['install'], { cwd: join(PROJECT_DIR, 'notification-service') })
  log.success('Зависимости установлены')
}

async function runMigrations() {
  log.info('Запуск миграций базы данных...')
  await runCommand('npm', ['run', 'migrate'], { cwd: join(PROJECT_DIR, 'backend') })
  log.success('Миграции выполнены')
}

async function seedDatabase() {
  const answer = await askQuestion('Заполнить базу тестовыми данными? (y/N): ')
  if (answer.toLowerCase() === 'y') {
    log.info('Заполнение базы тестовыми данными...')
    await runCommand('npm', ['run', 'seed'], { cwd: join(PROJECT_DIR, 'backend') })
    log.success('База данных заполнена')
  }
}

async function startDev() {
  await killDevPorts()
  log.info('Запуск dev сервера...')
  await runCommand('npm', ['run', 'dev'])
}

async function stopDevServices() {
  log.info('Остановка сервисов...')
  await runCommand('docker-compose', [...COMPOSE_DEV, 'down'], { cwd: DEPLOY_DIR })
  log.success('Сервисы остановлены')
}

async function showDevStatus() {
  log.info('Статус сервисов:')
  await runCommand('docker-compose', [...COMPOSE_DEV, 'ps'], { cwd: DEPLOY_DIR })
}

async function showDevLogs() {
  await runCommand('docker-compose', [...COMPOSE_DEV, 'logs', '-f'], { cwd: DEPLOY_DIR })
}

// ==================== BACKEND (PROD) COMMANDS ====================

async function checkEnvFile() {
  const envPath = join(DEPLOY_DIR, '.env')
  if (!existsSync(envPath)) {
    log.error('Файл .env не найден в директории deploy/')
    log.info('Создайте файл deploy/.env на основе deploy/.env.example')
    process.exit(1)
  }
}

async function startBackendServices() {
  log.info('Запуск backend-сервисов...')
  await runCommand('docker-compose', [...COMPOSE_BACKEND, 'up', '-d'], { cwd: DEPLOY_DIR })
  log.success('Сервисы запущены')
}

async function stopBackendServices() {
  log.info('Остановка backend-сервисов...')
  await runCommand('docker-compose', [...COMPOSE_BACKEND, 'down'], { cwd: DEPLOY_DIR })
  log.success('Сервисы остановлены')
}

async function restartBackendServices() {
  await stopBackendServices()
  await startBackendServices()
}

async function showBackendLogs() {
  await runCommand('docker-compose', [...COMPOSE_BACKEND, 'logs', '-f'], { cwd: DEPLOY_DIR })
}

async function showBackendStatus() {
  log.info('Статус сервисов:')
  await runCommand('docker-compose', [...COMPOSE_BACKEND, 'ps'], { cwd: DEPLOY_DIR })
}

async function runBackendMigrations() {
  log.info('Запуск миграций...')
  await runCommand('docker-compose', [...COMPOSE_BACKEND, 'exec', 'backend', 'npm', 'run', 'migrate'], { cwd: DEPLOY_DIR })
  log.success('Миграции выполнены')
}

async function deployBackend() {
  log.info('🚀 Деплой backend-сервера...')
  await checkRequirements()
  await checkEnvFile()
  await startBackendServices()
  await sleep(10000)
  await runBackendMigrations()
  log.success('✅ Деплой завершён!')
}

// ==================== FRONTEND (PROD) COMMANDS ====================

async function startFrontendServices() {
  log.info('Запуск frontend...')
  await runCommand('docker-compose', [...COMPOSE_FRONTEND, 'up', '-d'], { cwd: DEPLOY_DIR })
  log.success('Frontend запущен')
}

async function stopFrontendServices() {
  log.info('Остановка frontend...')
  await runCommand('docker-compose', [...COMPOSE_FRONTEND, 'down'], { cwd: DEPLOY_DIR })
  log.success('Frontend остановлен')
}

async function restartFrontendServices() {
  await stopFrontendServices()
  await startFrontendServices()
}

async function showFrontendLogs() {
  await runCommand('docker-compose', [...COMPOSE_FRONTEND, 'logs', '-f'], { cwd: DEPLOY_DIR })
}

async function showFrontendStatus() {
  log.info('Статус:')
  await runCommand('docker-compose', [...COMPOSE_FRONTEND, 'ps'], { cwd: DEPLOY_DIR })
}

async function deployFrontend() {
  log.info('🚀 Деплой frontend-сервера...')
  await checkRequirements()
  await checkEnvFile()
  await startFrontendServices()
  log.success('✅ Деплой завершён!')
}

// ==================== HELP ====================

function showDevHelp() {
  console.log(`
${COLORS.blue}Dev окружение (сервисы + Keycloak в Docker, backend/frontend локально)${COLORS.reset}

Использование: node deploy/deploy.js dev [COMMAND]

Команды:
  start       Запуск полного цикла (сервисы, миграции, dev сервер)
  services    Запуск Docker сервисов (БД, MinIO, KC, OnlyOffice и т.д.)
  deps        Установка зависимостей
  migrate     Запуск миграций
  dev         Запуск dev сервера (без сервисов)
  stop        Остановка Docker сервисов
  status      Статус сервисов
  logs        Логи сервисов
  help        Показать эту справку
`)
}

function showBackendHelp() {
  console.log(`
${COLORS.blue}Backend-сервер (production, без Keycloak)${COLORS.reset}

Использование: node deploy/deploy.js backend [COMMAND]

Команды:
  deploy      Полный деплой (проверка, запуск, миграции)
  start       Запуск сервисов
  stop        Остановка сервисов
  restart     Перезапуск сервисов
  logs        Просмотр логов
  status      Статус сервисов
  migrate     Запуск миграций
  help        Показать эту справку
`)
}

function showFrontendHelp() {
  console.log(`
${COLORS.blue}Frontend-сервер (production)${COLORS.reset}

Использование: node deploy/deploy.js frontend [COMMAND]

Команды:
  deploy      Полный деплой
  start       Запуск frontend
  stop        Остановка frontend
  restart     Перезапуск frontend
  logs        Просмотр логов
  status      Статус
  help        Показать эту справку
`)
}

function showHelp() {
  console.log(`
${COLORS.blue}Worker Cabinet Deployment${COLORS.reset}

Использование: node deploy/deploy.js <env> [command]

Окружения:
  dev         Dev окружение (сервисы + Keycloak в Docker, backend/frontend локально)
  backend     Backend-сервер (production, без Keycloak — внешний KC)
  frontend    Frontend-сервер (production)

Примеры:
  node deploy/deploy.js dev start            Запуск dev окружения
  node deploy/deploy.js backend deploy       Деплой backend-сервера
  node deploy/deploy.js frontend deploy      Деплой frontend-сервера
`)
}

// ==================== MAIN ====================

async function main() {
  const args = process.argv.slice(2)
  const env = args[0] || 'help'
  const command = args[1] || 'help'

  if (env === 'help' || env === '--help' || env === '-h') {
    showHelp()
    process.exit(0)
  }

  if (env === 'dev') {
    switch (command) {
      case 'start':
        await checkRequirements()
        await setupEnv()
        await startDevServices()
        await installDependencies()
        await runMigrations()
        await seedDatabase()
        await startDev()
        break
      case 'services':
        await checkRequirements()
        await startDevServices()
        break
      case 'deps':
        await installDependencies()
        break
      case 'migrate':
        await runMigrations()
        break
      case 'dev':
        if (!existsSync(join(PROJECT_DIR, 'node_modules')) || !existsSync(join(PROJECT_DIR, 'backend', 'node_modules'))) {
          await installDependencies()
        }
        await startDev()
        break
      case 'stop':
        await stopDevServices()
        break
      case 'status':
        await showDevStatus()
        break
      case 'logs':
        await showDevLogs()
        break
      case 'help':
      case '--help':
      case '-h':
        showDevHelp()
        break
      default:
        log.error(`Неизвестная команда: ${command}`)
        showDevHelp()
        process.exit(1)
    }
  } else if (env === 'backend') {
    switch (command) {
      case 'deploy':
        await deployBackend()
        break
      case 'start':
        await checkEnvFile()
        await startBackendServices()
        break
      case 'stop':
        await stopBackendServices()
        break
      case 'restart':
        await checkEnvFile()
        await restartBackendServices()
        break
      case 'logs':
        await showBackendLogs()
        break
      case 'status':
        await showBackendStatus()
        break
      case 'migrate':
        await runBackendMigrations()
        break
      case 'help':
      case '--help':
      case '-h':
        showBackendHelp()
        break
      default:
        log.error(`Неизвестная команда: ${command}`)
        showBackendHelp()
        process.exit(1)
    }
  } else if (env === 'frontend') {
    switch (command) {
      case 'deploy':
        await deployFrontend()
        break
      case 'start':
        await checkEnvFile()
        await startFrontendServices()
        break
      case 'stop':
        await stopFrontendServices()
        break
      case 'restart':
        await checkEnvFile()
        await restartFrontendServices()
        break
      case 'logs':
        await showFrontendLogs()
        break
      case 'status':
        await showFrontendStatus()
        break
      case 'help':
      case '--help':
      case '-h':
        showFrontendHelp()
        break
      default:
        log.error(`Неизвестная команда: ${command}`)
        showFrontendHelp()
        process.exit(1)
    }
  } else {
    log.error(`Неизвестное окружение: ${env}`)
    showHelp()
    process.exit(1)
  }
}

main().catch((err) => {
  log.error(err.message)
  process.exit(1)
})
