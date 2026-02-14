import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigration() {
  console.log('Adding responsibility_area column to users table...')

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
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS responsibility_area TEXT
    `)
    console.log('  ✓ responsibility_area column added')
    console.log('✅ Migration completed successfully')
  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigration()
