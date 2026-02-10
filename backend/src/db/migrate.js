import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigrations() {
  console.log('Starting migrations...')
  
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'worker_cabinet',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })
  
  const db = await pool.connect()
  
  try {
    // Step 1: Create ENUM types first
    console.log('Creating enum types...')
    
    try {
      await db.query(`CREATE TYPE vacation_type_enum AS ENUM (
        'annual_paid',
        'unpaid',
        'educational',
        'maternity',
        'child_care',
        'additional',
        'veteran'
      )`)
      console.log('  ✓ vacation_type_enum')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ vacation_type_enum (already exists)')
      } else {
        throw e
      }
    }

    try {
      await db.query(`CREATE TYPE request_status_enum AS ENUM (
        'on_approval',
        'approved',
        'rejected',
        'cancelled_by_employee',
        'cancelled_by_manager'
      )`)
      console.log('  ✓ request_status_enum')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ request_status_enum (already exists)')
      } else {
        throw e
      }
    }

    try {
      await db.query(`CREATE TYPE user_role_enum AS ENUM (
        'employee',
        'manager',
        'hr',
        'admin'
      )`)
      console.log('  ✓ user_role_enum')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ user_role_enum (already exists)')
      } else {
        throw e
      }
    }

    try {
      await db.query(`CREATE TYPE user_status_enum AS ENUM (
        'active',
        'inactive',
        'on_leave'
      )`)
      console.log('  ✓ user_status_enum')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ user_status_enum (already exists)')
      } else {
        throw e
      }
    }

    console.log('✅ Enum types created')

    // Step 2: Create tables
    console.log('Creating tables...')
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        manager_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - departments:', e.message))

    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        middle_name VARCHAR(100),
        position VARCHAR(255) NOT NULL,
        department_id INTEGER REFERENCES departments(id),
        phone VARCHAR(20),
        birth_date DATE,
        hire_date DATE NOT NULL,
        status user_status_enum DEFAULT 'active',
        role user_role_enum DEFAULT 'employee',
        manager_id INTEGER REFERENCES users(id),
        avatar VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - users:', e.message))

    await db.query(`
      CREATE TABLE IF NOT EXISTS vacation_balances (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        total_days INTEGER DEFAULT 28 NOT NULL,
        used_days INTEGER DEFAULT 0 NOT NULL,
        available_days INTEGER DEFAULT 28 NOT NULL,
        reserved_days INTEGER DEFAULT 0 NOT NULL,
        last_accrual_date DATE,
        travel_available BOOLEAN DEFAULT false,
        travel_last_used_date DATE,
        travel_next_available_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - vacation_balances:', e.message))

    await db.query(`
      CREATE TABLE IF NOT EXISTS vacation_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        duration INTEGER NOT NULL,
        vacation_type vacation_type_enum DEFAULT 'annual_paid',
        status request_status_enum DEFAULT 'on_approval',
        comment TEXT,
        rejection_reason TEXT,
        cancellation_reason TEXT,
        has_travel BOOLEAN DEFAULT false,
        reference_document VARCHAR(500),
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - vacation_requests:', e.message))

    await db.query(`
      CREATE TABLE IF NOT EXISTS vacation_request_status_history (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES vacation_requests(id) ON DELETE CASCADE,
        status request_status_enum NOT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        changed_by INTEGER NOT NULL REFERENCES users(id),
        comment TEXT
      )
    `).catch(e => console.log('  - vacation_request_status_history:', e.message))

    await db.query(`
      CREATE TABLE IF NOT EXISTS vacation_restrictions (
        id SERIAL PRIMARY KEY,
        department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        restriction_type VARCHAR(20) NOT NULL CHECK (restriction_type IN ('pair', 'group')),
        employee_ids INTEGER[] NOT NULL,
        max_concurrent INTEGER,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER NOT NULL REFERENCES users(id)
      )
    `).catch(e => console.log('  - vacation_restrictions:', e.message))

    console.log('✅ Tables created')

    // Step 2.5: Add new columns to existing tables
    console.log('Adding new columns...')
    
    try {
      await db.query(`
        ALTER TABLE vacation_requests 
        ADD COLUMN IF NOT EXISTS reference_document VARCHAR(500)
      `)
      console.log('  ✓ reference_document column added to vacation_requests')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ reference_document (already exists)')
      } else {
        console.log('  - reference_document:', e.message)
      }
    }

    console.log('✅ New columns added')

    // Step 3: Create indexes
    console.log('Creating indexes...')
    await db.query('CREATE INDEX IF NOT EXISTS idx_vacation_requests_user_id ON vacation_requests(user_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_vacation_requests_status ON vacation_requests(status)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_vacation_requests_dates ON vacation_requests(start_date, end_date)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id)').catch(e => {})
    console.log('✅ Indexes created')

    // Step 4: Create triggers
    console.log('Creating triggers...')
    
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `)

    await db.query('DROP TRIGGER IF EXISTS update_users_updated_at ON users')
    await db.query(`CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    await db.query('DROP TRIGGER IF EXISTS update_vacation_balances_updated_at ON vacation_balances')
    await db.query(`CREATE TRIGGER update_vacation_balances_updated_at BEFORE UPDATE ON vacation_balances
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    await db.query('DROP TRIGGER IF EXISTS update_vacation_requests_updated_at ON vacation_requests')
    await db.query(`CREATE TRIGGER update_vacation_requests_updated_at BEFORE UPDATE ON vacation_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    await db.query('DROP TRIGGER IF EXISTS update_departments_updated_at ON departments')
    await db.query(`CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    await db.query(`
      CREATE OR REPLACE FUNCTION update_available_days()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.available_days := NEW.total_days - NEW.used_days;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `)

    await db.query('DROP TRIGGER IF EXISTS update_balance_available_days ON vacation_balances')
    await db.query(`CREATE TRIGGER update_balance_available_days 
      BEFORE INSERT OR UPDATE ON vacation_balances
      FOR EACH ROW EXECUTE FUNCTION update_available_days()`)

    console.log('✅ Triggers created')
    console.log('✅ Migrations completed successfully')
    console.log('Database "worker_cabinet" ready')
    
  } catch (error) {
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}

runMigrations()
