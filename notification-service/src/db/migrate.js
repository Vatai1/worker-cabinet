import { query } from '../config/database.js'

export async function migrate() {
  console.log('[MIGRATE] Running notification-service migrations...')

  await query(`
    CREATE TABLE IF NOT EXISTS notification_queue (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(100) NOT NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'email',
      data JSONB DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      send_at TIMESTAMP WITH TIME ZONE,
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `)

  await query(`
    CREATE INDEX IF NOT EXISTS idx_notification_queue_status
    ON notification_queue (status, send_at)
  `)

  await query(`
    CREATE INDEX IF NOT EXISTS idx_notification_queue_user
    ON notification_queue (user_id)
  `)

  console.log('[MIGRATE] Done.')
}
