import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigration() {
  console.log('Adding user_documents table...')

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const db = await pool.connect()

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT,
        mime_type VARCHAR(100),
        category VARCHAR(50) DEFAULT 'other',
        description TEXT,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ user_documents table created')

    await db.query('CREATE INDEX IF NOT EXISTS idx_ud_user ON user_documents(user_id)')
    console.log('  ✓ index created')

    console.log('✅ user_documents migration completed successfully')
  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigration()
