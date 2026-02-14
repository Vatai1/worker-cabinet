import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigration() {
  console.log('Adding project_documents table...')

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
      CREATE TABLE IF NOT EXISTS project_documents (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT,
        mime_type VARCHAR(100),
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ project_documents table created')

    await db.query('CREATE INDEX IF NOT EXISTS idx_pd_project ON project_documents(project_id)')
    console.log('  ✓ index created')

    console.log('✅ project_documents migration completed successfully')
  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigration()
