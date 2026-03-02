import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigration() {
  console.log('Adding company_projects tables...')

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const db = await pool.connect()

  try {
    // Ensure project_status_enum exists
    try {
      await db.query(`CREATE TYPE project_status_enum AS ENUM ('active', 'completed', 'paused')`)
      console.log('  ✓ project_status_enum created')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ project_status_enum (already exists)')
      } else {
        throw e
      }
    }

    // Company-wide projects table
    await db.query(`
      CREATE TABLE IF NOT EXISTS company_projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status project_status_enum DEFAULT 'active',
        start_date DATE,
        end_date DATE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ company_projects table created')

    // Members table: role = 'lead' | 'member'
    await db.query(`
      CREATE TABLE IF NOT EXISTS company_project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, user_id)
      )
    `)
    console.log('  ✓ company_project_members table created')

    // Indexes
    await db.query('CREATE INDEX IF NOT EXISTS idx_cp_status ON company_projects(status)')
    await db.query('CREATE INDEX IF NOT EXISTS idx_cpm_project ON company_project_members(project_id)')
    await db.query('CREATE INDEX IF NOT EXISTS idx_cpm_user ON company_project_members(user_id)')
    console.log('  ✓ indexes created')

    // updated_at trigger
    await db.query('DROP TRIGGER IF EXISTS update_company_projects_updated_at ON company_projects')
    await db.query(`
      CREATE TRIGGER update_company_projects_updated_at
      BEFORE UPDATE ON company_projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `)
    console.log('  ✓ updated_at trigger created')

    console.log('✅ company_projects migration completed successfully')
  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigration()
