import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: './backend/.env' })

const { Pool } = pg

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'worker_cabinet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
})

const MAX_RETRIES = 30
const RETRY_INTERVAL = 1000

async function waitForDb() {
  console.log(`Waiting for database at ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}...`)
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await pool.query('SELECT 1')
      console.log('\nDatabase is ready!')
      await pool.end()
      process.exit(0)
    } catch (error) {
      process.stdout.write(`\rAttempt ${i + 1}/${MAX_RETRIES}...`)
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL))
    }
  }
  
  console.error('\nFailed to connect to database after', MAX_RETRIES, 'attempts')
  await pool.end()
  process.exit(1)
}

waitForDb()
