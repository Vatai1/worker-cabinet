import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigrations() {
  console.log('Starting migration: drop old ENUM types...')

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const db = await pool.connect()

  try {
    console.log('Checking if ENUM types are still in use...')

    const checkEnumUsage = await db.query(`
      SELECT
        n.nspname AS schema_name,
        t.typname AS type_name,
        c.relname AS table_name,
        a.attname AS column_name
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      JOIN pg_attribute a ON a.atttypid = t.oid
      JOIN pg_class c ON a.attrelid = c.oid
      WHERE t.typname IN ('request_status_enum', 'vacation_type_enum')
        AND a.attnum > 0
        AND NOT a.attisdropped
    `)

    if (checkEnumUsage.rows.length > 0) {
      console.log('⚠ ENUM types are still in use:')
      console.table(checkEnumUsage.rows)
      console.log('\nPlease ensure all tables have been migrated before dropping ENUM types.')
      console.log('Aborting...')
      process.exit(1)
    }

    console.log('  ✓ ENUM types are not in use')

    console.log('Dropping old ENUM types...')

    try {
      await db.query('DROP TYPE IF EXISTS request_status_enum')
      console.log('  ✓ dropped request_status_enum')
    } catch (e) {
      console.log(`  ⚠ error dropping request_status_enum: ${e.message}`)
    }

    try {
      await db.query('DROP TYPE IF EXISTS vacation_type_enum')
      console.log('  ✓ dropped vacation_type_enum')
    } catch (e) {
      console.log(`  ⚠ error dropping vacation_type_enum: ${e.message}`)
    }

    console.log('✅ Old ENUM types dropped successfully!')

  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigrations()
