import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigrations() {
  console.log('Starting migration: update tables to use dictionaries (continued)...')

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const db = await pool.connect()

  try {
    await db.query('BEGIN')

    console.log('Checking current state...')

    const tempStatusCheck = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vacation_requests' AND column_name = 'status_id_new'
    `)

    const tempTypeCheck = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vacation_requests' AND column_name = 'vacation_type_id_new'
    `)

    const tempHistoryStatusCheck = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vacation_request_status_history' AND column_name = 'status_id_new'
    `)

    const oldStatusCheck = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vacation_requests' AND column_name = 'status'
    `)

    const oldTypeCheck = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vacation_requests' AND column_name = 'vacation_type'
    `)

    const oldHistoryStatusCheck = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vacation_request_status_history' AND column_name = 'status'
    `)

    const needsStep1 = tempStatusCheck.rows.length === 0
    const needsStep2 = oldStatusCheck.rows.length > 0 || oldTypeCheck.rows.length > 0
    const needsStep3 = tempHistoryStatusCheck.rows.length === 0
    const needsStep4 = oldHistoryStatusCheck.rows.length > 0

    console.log(`Needs Step 1-2 (vacation_requests columns): ${needsStep1 || needsStep2}`)
    console.log(`Needs Step 3-4 (history column): ${needsStep3 || needsStep4}`)

    if (!needsStep2 && !needsStep4) {
      console.log('Tables appear to be already migrated!')
      console.log('Checking if status_id and vacation_type_id exist...')

      const newStatusCheck = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vacation_requests' AND column_name = 'status_id'
      `)

      const newTypeCheck = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vacation_requests' AND column_name = 'vacation_type_id'
      `)

      const newHistoryStatusCheck = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vacation_request_status_history' AND column_name = 'status_id'
      `)

      if (newStatusCheck.rows.length > 0 && newTypeCheck.rows.length > 0 && newHistoryStatusCheck.rows.length > 0) {
        console.log('✅ Tables are already using dictionary tables!')
        await db.query('ROLLBACK')
        process.exit(0)
      }
    }

    if (needsStep1) {
      console.log('Step 1: Add temporary columns to vacation_requests...')

      try {
        await db.query(`
          ALTER TABLE vacation_requests
          ADD COLUMN IF NOT EXISTS status_id_new INTEGER REFERENCES request_statuses(id)
        `)
        console.log('  ✓ added status_id_new')
      } catch (e) {
        console.log('  ⚠ status_id_new already exists')
      }

      try {
        await db.query(`
          ALTER TABLE vacation_requests
          ADD COLUMN IF NOT EXISTS vacation_type_id_new INTEGER REFERENCES vacation_types(id)
        `)
        console.log('  ✓ added vacation_type_id_new')
      } catch (e) {
        console.log('  ⚠ vacation_type_id_new already exists')
      }

      console.log('Step 2: Populate new columns from ENUM values...')

      const statusUpdateResult = await db.query(`
        UPDATE vacation_requests vr
        SET status_id_new = rs.id
        FROM request_statuses rs
        WHERE vr.status::text = rs.code
          AND vr.status_id_new IS NULL
      `)
      console.log(`  ✓ updated ${statusUpdateResult.rowCount} rows in vacation_requests (status)`)

      const typeUpdateResult = await db.query(`
        UPDATE vacation_requests vr
        SET vacation_type_id_new = vt.id
        FROM vacation_types vt
        WHERE vr.vacation_type::text = vt.code
          AND vr.vacation_type_id_new IS NULL
      `)
      console.log(`  ✓ updated ${typeUpdateResult.rowCount} rows in vacation_requests (vacation_type)`)
    }

    if (needsStep3) {
      console.log('Step 3: Add temporary column to vacation_request_status_history...')

      try {
        await db.query(`
          ALTER TABLE vacation_request_status_history
          ADD COLUMN IF NOT EXISTS status_id_new INTEGER REFERENCES request_statuses(id)
        `)
        console.log('  ✓ added status_id_new')
      } catch (e) {
        console.log('  ⚠ status_id_new already exists')
      }

      console.log('Step 4: Populate new column in vacation_request_status_history...')

      const historyUpdateResult = await db.query(`
        UPDATE vacation_request_status_history vrsh
        SET status_id_new = rs.id
        FROM request_statuses rs
        WHERE vrsh.status::text = rs.code
          AND vrsh.status_id_new IS NULL
      `)
      console.log(`  ✓ updated ${historyUpdateResult.rowCount} rows in vacation_request_status_history`)
    }

    if (needsStep2) {
      console.log('Step 5: Drop old ENUM columns and rename new ones in vacation_requests...')

      try {
        await db.query(`ALTER TABLE vacation_requests DROP CONSTRAINT IF EXISTS vacation_requests_status_check`)
        console.log('  ✓ dropped status check constraint')
      } catch (e) {
        console.log('  ⚠ status check constraint does not exist')
      }

      await db.query(`ALTER TABLE vacation_requests DROP COLUMN IF EXISTS status`)
      console.log('  ✓ dropped status column')

      await db.query(`ALTER TABLE vacation_requests RENAME COLUMN status_id_new TO status_id`)
      console.log('  ✓ renamed status_id_new to status_id')

      await db.query(`ALTER TABLE vacation_requests DROP COLUMN IF EXISTS vacation_type`)
      console.log('  ✓ dropped vacation_type column')

      await db.query(`ALTER TABLE vacation_requests RENAME COLUMN vacation_type_id_new TO vacation_type_id`)
      console.log('  ✓ renamed vacation_type_id_new to vacation_type_id')
    }

    if (needsStep4) {
      console.log('Step 6: Drop old ENUM column and rename new one in vacation_request_status_history...')

      try {
        await db.query(`ALTER TABLE vacation_request_status_history DROP CONSTRAINT IF EXISTS vacation_request_status_history_status_check`)
        console.log('  ✓ dropped status check constraint')
      } catch (e) {
        console.log('  ⚠ status check constraint does not exist')
      }

      await db.query(`ALTER TABLE vacation_request_status_history DROP COLUMN IF EXISTS status`)
      console.log('  ✓ dropped status column')

      await db.query(`ALTER TABLE vacation_request_status_history RENAME COLUMN status_id_new TO status_id`)
      console.log('  ✓ renamed status_id_new to status_id')
    }

    console.log('Step 7: Set default values...')

    const defaultStatusResult = await db.query(`SELECT id FROM request_statuses WHERE code = 'on_approval' LIMIT 1`)
    if (defaultStatusResult.rows.length > 0) {
      const defaultStatusId = defaultStatusResult.rows[0].id
      await db.query(`ALTER TABLE vacation_requests ALTER COLUMN status_id SET DEFAULT ${defaultStatusId}`)
      console.log('  ✓ set default status_id')
    }

    const defaultTypeResult = await db.query(`SELECT id FROM vacation_types WHERE code = 'annual_paid' LIMIT 1`)
    if (defaultTypeResult.rows.length > 0) {
      const defaultTypeId = defaultTypeResult.rows[0].id
      await db.query(`ALTER TABLE vacation_requests ALTER COLUMN vacation_type_id SET DEFAULT ${defaultTypeId}`)
      console.log('  ✓ set default vacation_type_id')
    }

    console.log('Step 8: Add NOT NULL constraints...')

    await db.query(`ALTER TABLE vacation_requests ALTER COLUMN status_id SET NOT NULL`)
    console.log('  ✓ status_id is now NOT NULL')

    await db.query(`ALTER TABLE vacation_requests ALTER COLUMN vacation_type_id SET NOT NULL`)
    console.log('  ✓ vacation_type_id is now NOT NULL')

    await db.query(`ALTER TABLE vacation_request_status_history ALTER COLUMN status_id SET NOT NULL`)
    console.log('  ✓ status_id is now NOT NULL in history table')

    console.log('Step 9: Update indexes...')

    await db.query(`DROP INDEX IF EXISTS idx_vacation_requests_status`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_vacation_requests_status_id ON vacation_requests(status_id)`)
    console.log('  ✓ recreated index for status_id')

    console.log('Step 10: Verify data integrity...')

    const checkNulls = await db.query(`
      SELECT COUNT(*) as null_count
      FROM vacation_requests
      WHERE status_id IS NULL OR vacation_type_id IS NULL
    `)
    if (parseInt(checkNulls.rows[0].null_count) > 0) {
      throw new Error(`Found ${checkNulls.rows[0].null_count} rows with NULL status_id or vacation_type_id`)
    }
    console.log('  ✓ all vacation_requests have valid status_id and vacation_type_id')

    const checkHistoryNulls = await db.query(`
      SELECT COUNT(*) as null_count
      FROM vacation_request_status_history
      WHERE status_id IS NULL
    `)
    if (parseInt(checkHistoryNulls.rows[0].null_count) > 0) {
      throw new Error(`Found ${checkHistoryNulls.rows[0].null_count} rows with NULL status_id in history`)
    }
    console.log('  ✓ all vacation_request_status_history rows have valid status_id')

    await db.query('COMMIT')

    console.log('✅ Migration completed successfully!')
    console.log('\nMigration summary:')
    console.log('  - Updated vacation_requests to use status_id and vacation_type_id')
    console.log('  - Updated vacation_request_status_history to use status_id')
    console.log('  - Removed old ENUM columns')
    console.log('\nNext steps:')
    console.log('  1. Update application code to use dictionary tables')
    console.log('  2. Run migrate-drop-enums.js to remove old ENUM types')

  } catch (error) {
    await db.query('ROLLBACK')
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigrations()
