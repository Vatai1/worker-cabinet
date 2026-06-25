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

async function startServices() {
  log.info('Запуск сервисов (PostgreSQL, MinIO, OnlyOffice, RabbitMQ, Hermes Agent, SearXNG, Keycloak)...')
  await runCommand('docker-compose', ['up', '-d', 'postgres', 'minio', 'onlyoffice', 'rabbitmq', 'hermes-agent', 'searxng', 'keycloak-db', 'keycloak'])
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
      const kcResult = await runCommandAsync('docker', ['exec', 'wc-keycloak', 'curl', '-sf', 'http://localhost:8080/health/ready'])
      if (kcResult.code === 0) break
    } catch {}
    await sleep(2000)
    kcRetries++
  }
  if (kcRetries === kcMaxRetries) {
    log.warning('Keycloak не запустился вовремя')
  } else {
    log.success('Keycloak готов')
    log.info('Отключение SSL requirement для master realm...')
    try {
      await runCommand('docker', ['exec', 'wc-keycloak', 'bash', '-c',
        '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin123 && ' +
        '/opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=none && ' +
        '/opt/keycloak/bin/kcadm.sh update realms/worker-cabinet -s sslRequired=none'])
      log.success('SSL requirement отключён для всех realms')
    } catch (err) {
      log.warning('Не удалось отключить SSL: ' + err.message)
    }
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

async function stopServices() {
  log.info('Остановка сервисов...')
  await runCommand('docker-compose', ['down'])
  log.success('Сервисы остановлены')
}

async function showStatus() {
  log.info('Статус сервисов:')
  await runCommand('docker-compose', ['ps'])
}

async function showLogs() {
  await runCommand('docker-compose', ['logs', '-f'])
}

// ==================== PROD COMMANDS ====================

async function checkEnvFile() {
  const envPath = join(DEPLOY_DIR, '.env')
  if (!existsSync(envPath)) {
    log.error('Файл .env не найден в директории deploy/')
    log.info('Создайте файл deploy/.env на основе deploy/.env.example')
    process.exit(1)
  }
}

async function buildImages() {
  log.info('Сборка Docker образов...')
  await runCommand('docker-compose', ['-f', 'docker-compose.prod.yml', 'build'], { cwd: DEPLOY_DIR })
  log.success('Образы собраны')
}

async function startProdServices() {
  log.info('Запуск сервисов...')
  await runCommand('docker-compose', ['-f', 'docker-compose.prod.yml', 'up', '-d'], { cwd: DEPLOY_DIR })
  log.success('Сервисы запущены')
  log.info('Приложение доступно на http://localhost')
}

async function stopProdServices() {
  log.info('Остановка сервисов...')
  await runCommand('docker-compose', ['-f', 'docker-compose.prod.yml', 'down'], { cwd: DEPLOY_DIR })
  log.success('Сервисы остановлены')
}

async function restartProdServices() {
  await stopProdServices()
  await startProdServices()
}

async function showProdLogs() {
  await runCommand('docker-compose', ['-f', 'docker-compose.prod.yml', 'logs', '-f'], { cwd: DEPLOY_DIR })
}

async function showProdStatus() {
  log.info('Статус сервисов:')
  await runCommand('docker-compose', ['-f', 'docker-compose.prod.yml', 'ps'], { cwd: DEPLOY_DIR })
}

async function runProdMigrations() {
  log.info('Запуск миграций...')
  await runCommand('docker-compose', ['-f', 'docker-compose.prod.yml', 'exec', 'backend', 'npm', 'run', 'migrate'], { cwd: DEPLOY_DIR })
  log.success('Миграции выполнены')
}

async function cleanup() {
  log.warning('Это удалит все данные (БД, файлы, логи)!')
  const answer = await askQuestion('Продолжить? (yes/no): ')
  if (answer.toLowerCase() === 'yes') {
    log.info('Очистка...')
    await runCommand('docker-compose', ['-f', 'docker-compose.prod.yml', 'down', '-v', '--remove-orphans'], { cwd: DEPLOY_DIR })
    await runCommand('docker', ['system', 'prune', '-f'])
    log.success('Очистка завершена')
  } else {
    log.info('Отменено')
  }
}

async function deployFull() {
  log.info('🚀 Полный деплой...')
  await checkRequirements()
  await checkEnvFile()
  await buildImages()
  await startProdServices()
  await sleep(10000)
  await runProdMigrations()
  log.success('✅ Деплой завершен! Приложение доступно на http://localhost')
}


// ==================== SINGLE SERVER COMMANDS ====================

async function checkSingleEnvFile() {
  const envPath = join(DEPLOY_DIR, '.env')
  if (!existsSync(envPath)) {
    log.error('deploy/.env not found. Copy deploy/.env.backend.example -> deploy/.env')
    process.exit(1)
  }
}

async function buildSingleImages() {
  log.info('Building Docker images...')
  await runCommand('docker-compose', ['-f', 'docker-compose.single.yml', 'build'], { cwd: DEPLOY_DIR })
  log.success('Images built')
}

async function startSingleServices() {
  log.info('Starting all services...')
  await runCommand('docker-compose', ['-f', 'docker-compose.single.yml', 'up', '-d'], { cwd: DEPLOY_DIR })
  log.success('Services started')
  log.info('App: http://localhost')
}

async function stopSingleServices() {
  log.info('Stopping services...')
  await runCommand('docker-compose', ['-f', 'docker-compose.single.yml', 'down'], { cwd: DEPLOY_DIR })
  log.success('Services stopped')
}

async function restartSingleServices() {
  await stopSingleServices()
  await startSingleServices()
}

async function showSingleLogs() {
  await runCommand('docker-compose', ['-f', 'docker-compose.single.yml', 'logs', '-f'], { cwd: DEPLOY_DIR })
}

async function showSingleStatus() {
  log.info('Services status:')
  await runCommand('docker-compose', ['-f', 'docker-compose.single.yml', 'ps'], { cwd: DEPLOY_DIR })
}

async function runSingleMigrations() {
  log.info('Running migrations...')
  await runCommand('docker-compose', ['-f', 'docker-compose.single.yml', 'exec', 'backend', 'npm', 'run', 'migrate'], { cwd: DEPLOY_DIR })
  log.success('Migrations done')
}

async function deploySingleFull() {
  log.info('Full single-server deploy...')
  await checkRequirements()
  await checkSingleEnvFile()
  await buildSingleImages()
  await startSingleServices()
  await sleep(15000)
  await runSingleMigrations()
  log.success('Deploy done! http://localhost')
}

function showSingleHelp() {
  const b = COLORS.blue
  const r = COLORS.reset
  console.log(`
${b}Single-server deployment (frontend + backend + all services in containers)${r}

Usage: node deploy/deploy.js single [COMMAND]

Commands:
  deploy      Full deploy (check, build, start, migrate)
  build       Build Docker images
  start       Start all services
  stop        Stop all services
  restart     Restart services
  logs        View logs
  status      Service status
  migrate     Run migrations
  help        Show this help

Examples:
  node deploy/deploy.js single deploy      Full deploy on one server
  node deploy/deploy.js single logs         View logs
  node deploy/deploy.js single restart      Restart
`)
}

// ==================== HELP ====================

function showDevHelp() {
  console.log(`
${COLORS.blue}Скрипт запуска dev окружения${COLORS.reset}

Использование: node deploy/deploy.js dev [COMMAND]

Команды:
  start       Запуск полного цикла (проверка, сервисы, миграции, dev сервер)
  services    Запуск только Docker сервисов
  deps        Установка зависимостей
  migrate     Запуск миграций
  dev         Запуск dev сервера (без сервисов)
  stop        Остановка Docker сервисов
  status      Статус сервисов
  logs        Логи сервисов
  help        Показать эту справку

Примеры:
  node deploy/deploy.js dev start           Полный запуск
  node deploy/deploy.js dev services        Запуск БД, MinIO, OnlyOffice
  node deploy/deploy.js dev dev             Запуск dev сервера
`)
}

function showProdHelp() {
  console.log(`
${COLORS.blue}Скрипт продакшн деплоя${COLORS.reset}

Использование: node deploy/deploy.js prod [COMMAND]

Команды:
  deploy      Полный деплой (проверка, сборка, запуск, миграции)
  build       Сборка Docker образов
  start       Запуск сервисов
  stop        Остановка сервисов
  restart     Перезапуск сервисов
  logs        Просмотр логов
  status      Статус сервисов
  migrate     Запуск миграций
  cleanup     Полная очистка (удаление volumes)
  help        Показать эту справку

Примеры:
  node deploy/deploy.js prod deploy          Полный деплой
  node deploy/deploy.js prod build           Только сборка образов
  node deploy/deploy.js prod logs            Просмотр логов
  node deploy/deploy.js prod restart         Перезапуск
`)
}

function showHelp() {
  console.log(`
${COLORS.blue}Worker Cabinet Deployment${COLORS.reset}

Использование: node deploy/deploy.js <env> [command]

Окружения:
  dev         Dev окружение (сервисы в Docker, backend/frontend локально)
  single      One-server deploy (всё в контейнерах)
  prod        Production окружение

Примеры:
  node deploy/deploy.js dev start            Запуск dev окружения
  node deploy/deploy.js single deploy        One-server деплой
  node deploy/deploy.js prod deploy          Продакшн деплой
  node deploy/deploy.js dev help             Справка по dev командам
  node deploy/deploy.js prod help            Справка по prod командам
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
        await startServices()
        await installDependencies()
        await runMigrations()
        await seedDatabase()
        await startDev()
        break
      case 'services':
        await checkRequirements()
        await startServices()
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
        await stopServices()
        break
      case 'status':
        await showStatus()
        break
      case 'logs':
        await showLogs()
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
  } else if (env === 'single') {
    switch (command) {
      case 'deploy':
        await deploySingleFull()
        break
      case 'build':
        await buildSingleImages()
        break
      case 'start':
        await startSingleServices()
        break
      case 'stop':
        await stopSingleServices()
        break
      case 'restart':
        await restartSingleServices()
        break
      case 'logs':
        await showSingleLogs()
        break
      case 'status':
        await showSingleStatus()
        break
      case 'migrate':
        await runSingleMigrations()
        break
      case 'help':
      case '--help':
      case '-h':
        showSingleHelp()
        break
      default:
        log.error(`Unknown command: ${command}`)
        showSingleHelp()
        process.exit(1)
    }
  
  } else if (env === 'prod') {
    switch (command) {
      case 'deploy':
        await deployFull()
        break
      case 'build':
        await checkRequirements()
        await checkEnvFile()
        await buildImages()
        break
      case 'start':
        await checkEnvFile()
        await startProdServices()
        break
      case 'stop':
        await stopProdServices()
        break
      case 'restart':
        await checkEnvFile()
        await restartProdServices()
        break
      case 'logs':
        await showProdLogs()
        break
      case 'status':
        await showProdStatus()
        break
      case 'migrate':
        await runProdMigrations()
        break
      case 'cleanup':
        await cleanup()
        break
      case 'help':
      case '--help':
      case '-h':
        showProdHelp()
        break
      default:
        log.error(`Неизвестная команда: ${command}`)
        showProdHelp()
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
