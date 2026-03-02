import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigrations() {
  console.log('Adding skills and projects tables...')

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const db = await pool.connect()

  try {
    // Create ENUM for project status
    try {
      await db.query(`CREATE TYPE project_status_enum AS ENUM (
        'active',
        'completed',
        'paused'
      )`)
      console.log('  ✓ project_status_enum')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ project_status_enum (already exists)')
      } else {
        throw e
      }
    }

    // Create skills table
    await db.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `)
    console.log('  ✓ skills table created')

    // Create projects table
    await db.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        status project_status_enum DEFAULT 'active',
        start_date DATE,
        end_date DATE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ projects table created')

    // Create indexes
    await db.query('CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(user_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)').catch(e => {})
    console.log('  ✓ indexes created')

    // Create trigger for projects updated_at
    await db.query('DROP TRIGGER IF EXISTS update_projects_updated_at ON projects')
    await db.query(`CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    console.log('✅ Skills and projects tables added successfully')

  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigrations()
