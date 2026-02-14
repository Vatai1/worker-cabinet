import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigrations() {
  console.log('Refactoring skills structure to separate dictionary...')

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const db = await pool.connect()

  try {
    // Step 1: Create new skills_dictionary table
    console.log('Creating skills_dictionary table...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS skills_dictionary (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ skills_dictionary table created')

    // Step 2: Create user_skills table for linking users to skills
    console.log('Creating user_skills table...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_skills (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill_id INTEGER NOT NULL REFERENCES skills_dictionary(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, skill_id)
      )
    `)
    console.log('  ✓ user_skills table created')

    // Step 3: Migrate existing skills to dictionary
    console.log('Migrating existing skills...')
    const existingSkills = await db.query('SELECT DISTINCT name FROM skills')
    console.log(`  Found ${existingSkills.rows.length} unique skills`)

    for (const skill of existingSkills.rows) {
      try {
        await db.query(
          'INSERT INTO skills_dictionary (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [skill.name]
        )
      } catch (e) {
        console.log(`  - Skipped: ${skill.name}`)
      }
    }
    console.log('  ✓ Skills migrated to dictionary')

    // Step 4: Migrate user-skill relationships
    console.log('Migrating user-skill relationships...')
    await db.query(`
      INSERT INTO user_skills (user_id, skill_id, created_at)
      SELECT s.user_id, sd.id, s.created_at
      FROM skills s
      JOIN skills_dictionary sd ON s.name = sd.name
      ON CONFLICT (user_id, skill_id) DO NOTHING
    `)
    console.log('  ✓ User-skill relationships migrated')

    // Step 5: Drop old skills table
    console.log('Dropping old skills table...')
    await db.query('DROP TABLE IF EXISTS skills CASCADE')
    console.log('  ✓ Old skills table dropped')

    // Step 6: Create indexes
    console.log('Creating indexes...')
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON user_skills(skill_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_skills_dictionary_name ON skills_dictionary(name)').catch(e => {})
    console.log('  ✓ Indexes created')

    console.log('✅ Skills structure refactored successfully')

  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigrations()
