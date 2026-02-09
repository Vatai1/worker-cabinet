import pg from 'pg'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: 'postgres', // Connect to default database first
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

async function runMigrations() {
  const client = await pool.connect()
  
  try {
    console.log('Starting migrations...')
    
    // Read schema file
    const schemaPath = path.join(process.cwd(), 'src/db/schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    // Execute schema
    await client.query(schema)
    
    console.log('✅ Migrations completed successfully')
    console.log('Database "worker_cabinet" created with all tables')
  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

runMigrations()
