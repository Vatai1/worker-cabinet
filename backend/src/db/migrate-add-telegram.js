import { query } from '../config/database.js'

export async function up() {
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255),
    ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT false
  `)
}

export async function down() {
  await query(`
    ALTER TABLE users
    DROP COLUMN IF EXISTS telegram_chat_id,
    DROP COLUMN IF EXISTS telegram_username,
    DROP COLUMN IF EXISTS telegram_notifications_enabled
  `)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => {
    console.log('✅ Telegram migration completed successfully')
    process.exit(0)
  }).catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })
}
