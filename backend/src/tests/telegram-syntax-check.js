import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const telegramRoutesPath = join(__dirname, '..', 'routes', 'telegram.js')

try {
  const content = readFileSync(telegramRoutesPath, 'utf-8')

  const requiredExports = ['default']
  const missingExports = requiredExports.filter(exportName => !content.includes(`export default router`))

  if (missingExports.length > 0) {
    console.error('❌ Missing required exports:', missingExports)
    process.exit(1)
  }

  if (!content.includes('express')) {
    console.error('❌ Missing express import')
    process.exit(1)
  }

  if (!content.includes('TelegramService')) {
    console.error('❌ Missing TelegramService import')
    process.exit(1)
  }

  console.log('✅ Telegram routes syntax check passed')
} catch (error) {
  console.error('❌ Syntax check failed:', error.message)
  process.exit(1)
}
