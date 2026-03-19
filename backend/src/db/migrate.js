import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function ensureDatabaseExists() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  const client = await pool.connect()
  try {
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'worker_cabinet'"
    )
    if (result.rows.length === 0) {
      console.log('Creating database worker_cabinet...')
      await client.query('CREATE DATABASE worker_cabinet')
      console.log('✅ Database worker_cabinet created')
    }
  } finally {
    client.release()
    await pool.end()
  }
}

async function runMigrations() {
  console.log('Starting migrations...')

  await ensureDatabaseExists()

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
        'admin',
        'director'
      )`)
      console.log('  ✓ user_role_enum')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ user_role_enum (already exists)')
        try {
          await db.query(`ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'director'`)
          console.log('    ✓ director value added to enum')
        } catch (addErr) {
          if (!addErr.message.includes('already exists')) {
            console.log('    - director value:', addErr.message)
          }
        }
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

    // Step 4.5: Create company_projects tables (required for roadmap)
    console.log('Creating company_projects tables...')

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

    await db.query(`
      CREATE TABLE IF NOT EXISTS company_project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        UNIQUE(project_id, user_id)
      )
    `)
    console.log('  ✓ company_project_members table created')

    await db.query('CREATE INDEX IF NOT EXISTS idx_cp_status ON company_projects(status)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_cpm_project ON company_project_members(project_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_cpm_user ON company_project_members(user_id)').catch(e => {})

    await db.query('DROP TRIGGER IF EXISTS update_company_projects_updated_at ON company_projects')
    await db.query(`
      CREATE TRIGGER update_company_projects_updated_at
      BEFORE UPDATE ON company_projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `)

    try {
      await db.query(`ALTER TABLE company_projects ADD COLUMN IF NOT EXISTS full_name VARCHAR(500)`)
      console.log('  ✓ full_name column added to company_projects')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ full_name column (already exists)')
      }
    }

    console.log('✅ company_projects tables created')

    // Step 5: Create project roadmap table
    console.log('Creating project roadmap table...')
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS project_roadmap (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
        due_date DATE,
        order_index INTEGER DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - project_roadmap:', e.message))

    await db.query('CREATE INDEX IF NOT EXISTS idx_project_roadmap_project ON project_roadmap(project_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_project_roadmap_order ON project_roadmap(project_id, order_index)').catch(e => {})

    await db.query('DROP TRIGGER IF EXISTS update_project_roadmap_updated_at ON project_roadmap')
    await db.query(`CREATE TRIGGER update_project_roadmap_updated_at BEFORE UPDATE ON project_roadmap
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    console.log('✅ Project roadmap table created')

    // Step 6: Create roadmap v2 tables (rows + tasks)
    console.log('Creating roadmap v2 tables...')

    await db.query(`
      CREATE TABLE IF NOT EXISTS roadmap_rows (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        title       VARCHAR(255) NOT NULL,
        color       VARCHAR(20) DEFAULT '#6366f1',
        order_index INTEGER DEFAULT 0,
        created_by  INTEGER REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - roadmap_rows:', e.message))

    await db.query('CREATE INDEX IF NOT EXISTS idx_roadmap_rows_project ON roadmap_rows(project_id)').catch(e => {})

    await db.query(`
      CREATE TABLE IF NOT EXISTS roadmap_tasks (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        row_id      INTEGER NOT NULL REFERENCES roadmap_rows(id) ON DELETE CASCADE,
        title       VARCHAR(500) NOT NULL,
        description TEXT,
        start_month VARCHAR(7) NOT NULL,
        end_month   VARCHAR(7) NOT NULL,
        status      VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed')),
        color       VARCHAR(20),
        created_by  INTEGER REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - roadmap_tasks:', e.message))

    await db.query('CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_project ON roadmap_tasks(project_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_row ON roadmap_tasks(row_id)').catch(e => {})

    await db.query(`
      CREATE OR REPLACE FUNCTION update_roadmap_tasks_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    await db.query('DROP TRIGGER IF EXISTS trg_roadmap_tasks_updated_at ON roadmap_tasks')
    await db.query(`CREATE TRIGGER trg_roadmap_tasks_updated_at BEFORE UPDATE ON roadmap_tasks
      FOR EACH ROW EXECUTE FUNCTION update_roadmap_tasks_updated_at()`)

    console.log('✅ Roadmap v2 tables created')

    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100)`)
      console.log('  ✓ telegram_chat_id column added')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ telegram_chat_id (already exists)')
      } else {
        console.log('  - telegram_chat_id:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT false`)
      console.log('  ✓ telegram_notifications_enabled column added')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ telegram_notifications_enabled (already exists)')
      } else {
        console.log('  - telegram_notifications_enabled:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS responsibility_area TEXT`)
      console.log('  ✓ responsibility_area column added')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ responsibility_area (already exists)')
      } else {
        console.log('  - responsibility_area:', e.message)
      }
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       VARCHAR(255) NOT NULL,
        message     TEXT NOT NULL,
        type        VARCHAR(20) DEFAULT 'info',
        read        BOOLEAN DEFAULT false,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - notifications:', e.message))

    await db.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)').catch(e => {})

    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_director BOOLEAN DEFAULT false`)
      console.log('  ✓ active_director column added')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ active_director (already exists)')
      } else {
        console.log('  - active_director:', e.message)
      }
    }

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_active_director 
      ON users ((1)) WHERE active_director = true
    `).catch(e => {
      if (!e.message.includes('already exists')) {
        console.log('  - idx_users_active_director:', e.message)
      }
    })
    console.log('  ✓ idx_users_active_director unique index created')

    try {
      await db.query(`ALTER TABLE company_project_members ADD COLUMN IF NOT EXISTS description TEXT`)
      console.log('  ✓ description column added to company_project_members')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ description column (already exists)')
      } else {
        console.log('  - description:', e.message)
      }
    }

    // Add travel_destination to vacation_requests
    try {
      await db.query(`ALTER TABLE vacation_requests ADD COLUMN IF NOT EXISTS travel_destination VARCHAR(255)`)
      console.log('  ✓ travel_destination column added')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ travel_destination (already exists)')
      } else {
        console.log('  - travel_destination:', e.message)
      }
    }

    // Add telegram_username to users
    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255)`)
      console.log('  ✓ telegram_username column added')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ telegram_username (already exists)')
      } else {
        console.log('  - telegram_username:', e.message)
      }
    }

    // Create skills table
    console.log('Creating skills and user projects tables...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `).catch(e => console.log('  - skills:', e.message))

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
    `).catch(e => console.log('  - projects:', e.message))

    await db.query('CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(user_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)').catch(e => {})

    await db.query('DROP TRIGGER IF EXISTS update_projects_updated_at ON projects')
    await db.query(`CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)
    console.log('  ✓ skills and projects tables created')

    // Create user_documents table
    console.log('Creating user_documents table...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT,
        mime_type VARCHAR(100),
        category VARCHAR(50) DEFAULT 'other',
        description TEXT,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - user_documents:', e.message))
    await db.query('CREATE INDEX IF NOT EXISTS idx_ud_user ON user_documents(user_id)').catch(e => {})
    console.log('  ✓ user_documents table created')

    // Create project_documents and project_folders tables
    console.log('Creating project documents tables...')
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
    `).catch(e => console.log('  - project_documents:', e.message))

    try {
      await db.query(`ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS folder_path VARCHAR(1024) NOT NULL DEFAULT '/'`)
      await db.query(`ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'`)
      await db.query(`ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS description TEXT`)
    } catch (e) {}

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
    `).catch(e => console.log('  - project_folders:', e.message))

    await db.query('CREATE INDEX IF NOT EXISTS idx_pd_project ON project_documents(project_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_pdoc_project_folder ON project_documents(project_id, folder_path)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_pfold_project_parent ON project_folders(project_id, parent_path)').catch(e => {})
    console.log('  ✓ project documents tables created')

    // Add priority and is_milestone to roadmap_tasks
    try {
      await db.query(`ALTER TABLE roadmap_tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium'`)
      await db.query(`ALTER TABLE roadmap_tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false`)
      console.log('  ✓ roadmap_tasks priority/is_milestone columns added')
    } catch (e) {}

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
