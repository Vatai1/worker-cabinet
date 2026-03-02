import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function checkSchema() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const db = await pool.connect()

  try {
    console.log('Checking vacation_requests table...')
    const columnsResult = await db.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vacation_requests'
      ORDER BY ordinal_position
    `)
    console.log('\nColumns in vacation_requests:')
    console.table(columnsResult.rows)

    console.log('\nChecking vacation_request_status_history table...')
    const historyColumnsResult = await db.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vacation_request_status_history'
      ORDER BY ordinal_position
    `)
    console.log('\nColumns in vacation_request_status_history:')
    console.table(historyColumnsResult.rows)

    console.log('\nChecking for NULL values...')
    const nullCheck = await db.query(`
      SELECT COUNT(*) as null_count
      FROM vacation_requests
      WHERE status_id IS NULL OR vacation_type_id IS NULL
    `)
    console.log(`NULL status_id or vacation_type_id: ${nullCheck.rows[0].null_count}`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    db.release()
    await pool.end()
  }
}

checkSchema()
