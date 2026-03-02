import { query } from '../config/database.js'

async function up() {
  try {
    console.log('Adding notifications table...')

    // Создание таблицы уведомлений
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
        read BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Индексы
    await query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)
    `)

    await query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)
    `)

    await query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC)
    `)

    console.log('Notifications table created successfully')
  } catch (error) {
    console.error('Error creating notifications table:', error)
    throw error
  }
}

async function down() {
  try {
    console.log('Removing notifications table...')
    await query('DROP TABLE IF EXISTS notifications CASCADE')
    console.log('Notifications table removed successfully')
  } catch (error) {
    console.error('Error removing notifications table:', error)
    throw error
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2]

  if (command === 'up') {
    up()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error)
        process.exit(1)
      })
  } else if (command === 'down') {
    down()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error)
        process.exit(1)
      })
  } else {
    console.log('Usage: node migrate-add-notifications.js {up|down}')
    process.exit(1)
  }
}

export { up, down }
