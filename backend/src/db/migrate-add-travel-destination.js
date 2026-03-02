import { query } from '../config/database.js'

async function migrate() {
  console.log('Adding travel_destination column to vacation_requests table...')
  
  try {
    await query(`
      ALTER TABLE vacation_requests 
      ADD COLUMN IF NOT EXISTS travel_destination VARCHAR(255)
    `)
    console.log('✓ Migration completed successfully')
  } catch (error) {
    console.error('✗ Migration failed:', error.message)
    process.exit(1)
  }
  
  process.exit(0)
}

migrate()
