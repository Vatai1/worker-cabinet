import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigration() {
  console.log('Adding project folders support...')

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const db = await pool.connect()

  try {
    // Ensure project_documents table exists (created by company_projects migration or s3 setup)
    await db.query(`
      CREATE TABLE IF NOT EXISTS project_documents (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        file_path VARCHAR(1024) NOT NULL,
        file_size BIGINT,
        mime_type VARCHAR(255),
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        folder_path VARCHAR(1024) NOT NULL DEFAULT '/',
        tags JSONB DEFAULT '[]',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ project_documents table ensured')

    // Add folder_path column if it doesn't exist yet
    await db.query(`
      ALTER TABLE project_documents
      ADD COLUMN IF NOT EXISTS folder_path VARCHAR(1024) NOT NULL DEFAULT '/'
    `)
    console.log('  ✓ folder_path column ensured')

    // Create project_folders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS project_folders (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        path VARCHAR(1024) NOT NULL,
        parent_path VARCHAR(1024) NOT NULL DEFAULT '/',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, path)
      )
    `)
    console.log('  ✓ project_folders table created')

    // Indexes
    await db.query('CREATE INDEX IF NOT EXISTS idx_pdoc_project_folder ON project_documents(project_id, folder_path)')
    await db.query('CREATE INDEX IF NOT EXISTS idx_pfold_project_parent ON project_folders(project_id, parent_path)')
    console.log('  ✓ indexes created')

    console.log('✅ Project folders migration completed successfully')
  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigration()
