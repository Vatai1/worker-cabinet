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
      await db.query(`ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'onboarding'`)
      console.log('  ✓ onboarding value added to user_role_enum')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.log('  - onboarding enum:', e.message)
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

    // Create request_statuses dictionary table
    await db.query(`
      CREATE TABLE IF NOT EXISTS request_statuses (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL
      )
    `).catch(e => console.log('  - request_statuses:', e.message))

    // Seed request_statuses
    const requestStatusesData = [
      { code: 'on_approval', name: 'На согласовании' },
      { code: 'approved', name: 'Согласовано' },
      { code: 'rejected', name: 'Отклонено' },
      { code: 'cancelled_by_employee', name: 'Отменено сотрудником' },
      { code: 'cancelled_by_manager', name: 'Отменено руководителем' }
    ]
    for (const status of requestStatusesData) {
      await db.query(
        `INSERT INTO request_statuses (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
        [status.code, status.name]
      )
    }
    console.log('  ✓ request_statuses seeded')

    // Create vacation_types dictionary table
    await db.query(`
      CREATE TABLE IF NOT EXISTS vacation_types (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL
      )
    `).catch(e => console.log('  - vacation_types:', e.message))

    // Seed vacation_types
    const vacationTypesData = [
      { code: 'annual_paid', name: 'Ежегодный оплачиваемый' },
      { code: 'unpaid', name: 'Без сохранения зарплаты' },
      { code: 'educational', name: 'Учебный' },
      { code: 'maternity', name: 'Декретный' },
      { code: 'child_care', name: 'По уходу за ребёнком' },
      { code: 'additional', name: 'Дополнительный' },
      { code: 'veteran', name: 'Ветеранский' }
    ]
    for (const type of vacationTypesData) {
      await db.query(
        `INSERT INTO vacation_types (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
        [type.code, type.name]
      )
    }
    console.log('  ✓ vacation_types seeded')

    await db.query(`
      CREATE TABLE IF NOT EXISTS vacation_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        duration INTEGER NOT NULL,
        vacation_type_id INTEGER REFERENCES vacation_types(id),
        status_id INTEGER REFERENCES request_statuses(id),
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
        status_id INTEGER NOT NULL REFERENCES request_statuses(id),
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

    await db.query(`
      CREATE TABLE IF NOT EXISTS assistant_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - assistant_messages:', e.message))

    await db.query(`
      CREATE TABLE IF NOT EXISTS assistant_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'Новый чат',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - assistant_sessions:', e.message))

    await db.query(`
      ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES assistant_sessions(id) ON DELETE CASCADE
    `).catch(() => {})

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

    // Add status_id and vacation_type_id FK columns to vacation_requests
    try {
      await db.query(`ALTER TABLE vacation_requests ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES request_statuses(id)`)
      console.log('  ✓ status_id column added to vacation_requests')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ status_id (already exists)')
      } else {
        console.log('  - status_id:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE vacation_requests ADD COLUMN IF NOT EXISTS vacation_type_id INTEGER REFERENCES vacation_types(id)`)
      console.log('  ✓ vacation_type_id column added to vacation_requests')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ vacation_type_id (already exists)')
      } else {
        console.log('  - vacation_type_id:', e.message)
      }
    }

    // Add status_id FK column to vacation_request_status_history
    try {
      await db.query(`ALTER TABLE vacation_request_status_history ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES request_statuses(id)`)
      console.log('  ✓ status_id column added to vacation_request_status_history')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ status_id (already exists in history)')
      } else {
        console.log('  - status_id in history:', e.message)
      }
    }

    // Migrate existing ENUM data to FK columns
    console.log('Migrating ENUM data to FK columns...')
    
    // Check if old ENUM columns exist
    const vrColumns = await db.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'vacation_requests' AND column_name IN ('status', 'vacation_type')
    `)
    const vrHasStatus = vrColumns.rows.some(r => r.column_name === 'status')
    const vrHasVacationType = vrColumns.rows.some(r => r.column_name === 'vacation_type')

    const histColumns = await db.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'vacation_request_status_history' AND column_name = 'status'
    `)
    const histHasStatus = histColumns.rows.length > 0

    // Migrate vacation_requests.status_id
    if (vrHasStatus) {
      try {
        const migrateStatus = await db.query(`
          UPDATE vacation_requests vr
          SET status_id = rs.id
          FROM request_statuses rs
          WHERE vr.status_id IS NULL 
            AND vr.status::text = rs.code
        `)
        if (migrateStatus.rowCount > 0) {
          console.log(`  ✓ Migrated ${migrateStatus.rowCount} vacation_requests.status_id`)
        }
      } catch (e) {
        console.log('  - migrate status:', e.message)
      }
    }

    // Migrate vacation_requests.vacation_type_id
    if (vrHasVacationType) {
      try {
        const migrateType = await db.query(`
          UPDATE vacation_requests vr
          SET vacation_type_id = vt.id
          FROM vacation_types vt
          WHERE vr.vacation_type_id IS NULL 
            AND vr.vacation_type::text = vt.code
        `)
        if (migrateType.rowCount > 0) {
          console.log(`  ✓ Migrated ${migrateType.rowCount} vacation_requests.vacation_type_id`)
        }
      } catch (e) {
        console.log('  - migrate vacation_type:', e.message)
      }
    }

    // Migrate vacation_request_status_history.status_id
    if (histHasStatus) {
      try {
        const migrateHistory = await db.query(`
          UPDATE vacation_request_status_history vrsh
          SET status_id = rs.id
          FROM request_statuses rs
          WHERE vrsh.status_id IS NULL 
            AND vrsh.status::text = rs.code
        `)
        if (migrateHistory.rowCount > 0) {
          console.log(`  ✓ Migrated ${migrateHistory.rowCount} vacation_request_status_history.status_id`)
        }
      } catch (e) {
        console.log('  - migrate history status:', e.message)
      }
    }

    console.log('✅ ENUM data migration completed')

    // Step 3: Create indexes
    console.log('Creating indexes...')
    await db.query('CREATE INDEX IF NOT EXISTS idx_vacation_requests_user_id ON vacation_requests(user_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_vacation_requests_status_id ON vacation_requests(status_id)').catch(e => {})
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
        NEW.available_days := NEW.total_days - NEW.used_days - NEW.reserved_days;
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

    // Step 6: Create roadmap v2 tables (rows + tasks) - for projectService
    console.log('Creating roadmap v2 tables...')

    await db.query(`
      CREATE TABLE IF NOT EXISTS project_roadmap_rows (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        title       VARCHAR(255) NOT NULL,
        color       VARCHAR(20) DEFAULT '#6366f1',
        order_index INTEGER DEFAULT 0,
        created_by  INTEGER REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - project_roadmap_rows:', e.message))

    await db.query('CREATE INDEX IF NOT EXISTS idx_project_roadmap_rows_project ON project_roadmap_rows(project_id)').catch(e => {})

    await db.query(`
      CREATE TABLE IF NOT EXISTS project_roadmap_tasks (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        row_id      INTEGER NOT NULL REFERENCES project_roadmap_rows(id) ON DELETE CASCADE,
        title       VARCHAR(500) NOT NULL,
        description TEXT,
        start_date  DATE,
        end_date    DATE,
        status      VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed')),
        priority    VARCHAR(20) DEFAULT 'medium',
        assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        order_index INTEGER DEFAULT 0,
        color       VARCHAR(20),
        created_by  INTEGER REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - project_roadmap_tasks:', e.message))

    await db.query('CREATE INDEX IF NOT EXISTS idx_project_roadmap_tasks_project ON project_roadmap_tasks(project_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_project_roadmap_tasks_row ON project_roadmap_tasks(row_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_project_roadmap_tasks_assignee ON project_roadmap_tasks(assignee_id)').catch(e => {})

    await db.query('DROP TRIGGER IF EXISTS trg_project_roadmap_tasks_updated_at ON project_roadmap_tasks')
    await db.query(`CREATE TRIGGER trg_project_roadmap_tasks_updated_at BEFORE UPDATE ON project_roadmap_tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    // Also create roadmap_rows and roadmap_tasks for routes/projects.js compatibility
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
    `).catch(e => {})

    await db.query(`
      CREATE TABLE IF NOT EXISTS roadmap_tasks (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        row_id      INTEGER NOT NULL REFERENCES roadmap_rows(id) ON DELETE CASCADE,
        title       VARCHAR(500) NOT NULL,
        description TEXT,
        start_month VARCHAR(7),
        end_month   VARCHAR(7),
        status      VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed')),
        priority    VARCHAR(20) DEFAULT 'medium',
        is_milestone BOOLEAN DEFAULT false,
        color       VARCHAR(20),
        created_by  INTEGER REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => {})

    await db.query('CREATE INDEX IF NOT EXISTS idx_roadmap_rows_project ON roadmap_rows(project_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_project ON roadmap_tasks(project_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_row ON roadmap_tasks(row_id)').catch(e => {})

    await db.query('DROP TRIGGER IF EXISTS trg_roadmap_tasks_updated_at ON roadmap_tasks')
    await db.query(`CREATE TRIGGER trg_roadmap_tasks_updated_at BEFORE UPDATE ON roadmap_tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    console.log('✅ Roadmap v2 tables created')

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

    // Create skills_dictionary table (global skills catalog)
    await db.query(`
      CREATE TABLE IF NOT EXISTS skills_dictionary (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - skills_dictionary:', e.message))

    // Create user_skills junction table
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_skills (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill_id INTEGER NOT NULL REFERENCES skills_dictionary(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, skill_id)
      )
    `).catch(e => console.log('  - user_skills:', e.message))

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
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_id)').catch(e => {})

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

    // Add missing columns to project_roadmap_tasks (for existing tables)
    try {
      await db.query(`ALTER TABLE project_roadmap_tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium'`)
      await db.query(`ALTER TABLE project_roadmap_tasks ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL`)
      await db.query(`ALTER TABLE project_roadmap_tasks ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0`)
      console.log('  ✓ project_roadmap_tasks columns added')
    } catch (e) {}

    await db.query(`
      CREATE TABLE IF NOT EXISTS document_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL CHECK (category IN ('hr', 'legal', 'finance', 'general')),
        file_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INT NOT NULL,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        download_count INT DEFAULT 0
      )
    `).catch(e => console.log('  - document_templates:', e.message))
    console.log('  ✓ document_templates')

    await db.query(`
      CREATE TABLE IF NOT EXISTS surveys (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        created_by INT REFERENCES users(id),
        target_type TEXT NOT NULL CHECK (target_type IN ('all', 'department', 'employees')),
        target_ids JSONB DEFAULT '[]',
        deadline DATE,
        anonymous BOOLEAN DEFAULT false,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(e => console.log('  - surveys:', e.message))
    console.log('  ✓ surveys')

    await db.query(`
      CREATE TABLE IF NOT EXISTS survey_questions (
        id SERIAL PRIMARY KEY,
        survey_id INT REFERENCES surveys(id) ON DELETE CASCADE,
        order_index INT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('radio', 'checkbox', 'text', 'scale')),
        text TEXT NOT NULL,
        options JSONB DEFAULT '[]',
        scale_min INT DEFAULT 1,
        scale_max INT DEFAULT 5 CHECK (scale_max > scale_min),
        required BOOLEAN DEFAULT false
      )
    `).catch(e => console.log('  - survey_questions:', e.message))
    console.log('  ✓ survey_questions')

    await db.query(`
      CREATE TABLE IF NOT EXISTS survey_responses (
        id SERIAL PRIMARY KEY,
        survey_id INT REFERENCES surveys(id) ON DELETE CASCADE,
        user_id INT REFERENCES users(id),
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(e => console.log('  - survey_responses:', e.message))
    console.log('  ✓ survey_responses')
    // Partial unique index — prevents duplicate non-anonymous responses
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_unique_non_anon
        ON survey_responses (survey_id, user_id) WHERE user_id IS NOT NULL
    `).catch(e => console.log('  - survey_responses index:', e.message))

    await db.query(`
      CREATE TABLE IF NOT EXISTS survey_answers (
        id SERIAL PRIMARY KEY,
        response_id INT REFERENCES survey_responses(id) ON DELETE CASCADE,
        question_id INT REFERENCES survey_questions(id) ON DELETE CASCADE,
        value TEXT,
        values JSONB
      )
    `).catch(e => console.log('  - survey_answers:', e.message))
    console.log('  ✓ survey_answers')

    await db.query(`
      CREATE TABLE IF NOT EXISTS onboarding_templates (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content_text TEXT,
        file_key VARCHAR(500),
        CONSTRAINT content_or_file CHECK (content_text IS NOT NULL OR file_key IS NOT NULL),
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        position VARCHAR(255),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('  - onboarding_templates:', e.message))
    console.log('  ✓ onboarding_templates')

    await db.query(`
      CREATE TABLE IF NOT EXISTS employee_onboarding (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        started_by INTEGER REFERENCES users(id),
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `).catch(e => console.log('  - employee_onboarding:', e.message))
    console.log('  ✓ employee_onboarding')

    await db.query(`
      CREATE TABLE IF NOT EXISTS employee_onboarding_documents (
        id SERIAL PRIMARY KEY,
        onboarding_id INTEGER REFERENCES employee_onboarding(id) ON DELETE CASCADE,
        template_id INTEGER REFERENCES onboarding_templates(id) ON DELETE RESTRICT,
        acknowledged_at TIMESTAMP,
        UNIQUE (onboarding_id, template_id)
      )
    `).catch(e => console.log('  - employee_onboarding_documents:', e.message))
    console.log('  ✓ employee_onboarding_documents')

    await db.query(`
      CREATE TABLE IF NOT EXISTS document_access_tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(255) UNIQUE NOT NULL,
        document_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('  - document_access_tokens:', e.message))
    await db.query('CREATE INDEX IF NOT EXISTS idx_dat_token ON document_access_tokens(token)').catch(e => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_dat_expires ON document_access_tokens(expires_at)').catch(e => {})
    console.log('  ✓ document_access_tokens')

    await db.query(`
      CREATE TABLE IF NOT EXISTS hr_hierarchy (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
        updated_at TIMESTAMP DEFAULT NOW(),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT single_row CHECK (id = 1)
      )
    `).catch(e => console.log('  - hr_hierarchy:', e.message))
    console.log('  ✓ hr_hierarchy')

    await db.query(`
      CREATE TABLE IF NOT EXISTS department_hierarchy (
        department_id INTEGER PRIMARY KEY REFERENCES departments(id) ON DELETE CASCADE,
        data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
        updated_at TIMESTAMP DEFAULT NOW(),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `).catch(e => console.log('  - department_hierarchy:', e.message))
    console.log('  ✓ department_hierarchy')

    await db.query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS purpose TEXT`)
      .catch(e => console.log('  - document_templates.purpose:', e.message))
    console.log('  ✓ document_templates.purpose')

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dt_purpose
      ON document_templates (purpose)
      WHERE purpose IS NOT NULL
    `).catch(e => console.log('  - idx_dt_purpose:', e.message))
    console.log('  ✓ idx_dt_purpose')

    try {
      await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT`)
      console.log('  ✓ description column added to departments')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ description (already exists)')
      } else {
        console.log('  - description:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS vacation_requests_blocked BOOLEAN DEFAULT false`)
      console.log('  ✓ vacation_requests_blocked column added to departments')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ vacation_requests_blocked (already exists)')
      } else {
        console.log('  - vacation_requests_blocked:', e.message)
      }
    }

    
    try {
      await db.query(`ALTER TABLE departments ADD CONSTRAINT IF NOT EXISTS departments_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL`)
      console.log('  ✓ departments.manager_id FK to users added')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ departments.manager_id FK (already exists)')
      } else {
        console.log('  - departments.manager_id FK:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE vacation_requests ADD COLUMN IF NOT EXISTS transfer_requested_at TIMESTAMP`)
      console.log('  ✓ transfer_requested_at column added to vacation_requests')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ transfer_requested_at (already exists)')
      } else {
        console.log('  - transfer_requested_at:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE vacation_requests ADD COLUMN IF NOT EXISTS transfer_reason TEXT`)
      console.log('  ✓ transfer_reason column added to vacation_requests')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ transfer_reason (already exists)')
      } else {
        console.log('  - transfer_reason:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE vacation_requests ADD COLUMN IF NOT EXISTS transferred_from_id INTEGER REFERENCES vacation_requests(id)`)
      console.log('  ✓ transferred_from_id column added to vacation_requests')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ transferred_from_id (already exists)')
      } else {
        console.log('  - transferred_from_id:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE vacation_requests ADD COLUMN IF NOT EXISTS transfer_note TEXT`)
      console.log('  ✓ transfer_note column added to vacation_requests')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ transfer_note (already exists)')
      } else {
        console.log('  - transfer_note:', e.message)
      }
    }

    try {
      await db.query(`ALTER TABLE vacation_balances ADD COLUMN IF NOT EXISTS year INTEGER`)
      console.log('  ✓ year column added to vacation_balances')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ✓ year column (already exists)')
      } else {
        console.log('  - year column:', e.message)
      }
    }

    await db.query(`UPDATE vacation_balances SET year = EXTRACT(YEAR FROM CURRENT_DATE) WHERE year IS NULL`)
    console.log('  ✓ vacation_balances year populated')

    try {
      await db.query(`ALTER TABLE vacation_balances ALTER COLUMN year SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)`)
      await db.query(`ALTER TABLE vacation_balances ALTER COLUMN year SET NOT NULL`)
      console.log('  ✓ vacation_balances year NOT NULL + DEFAULT')
    } catch (e) {
      console.log('  - year constraints:', e.message)
    }

    await db.query(`ALTER TABLE vacation_balances DROP CONSTRAINT IF EXISTS vacation_balances_user_id_key`)
    await db.query(`ALTER TABLE vacation_balances DROP CONSTRAINT IF EXISTS vacation_balances_user_id_year_key`)
    await db.query(`ALTER TABLE vacation_balances ADD CONSTRAINT vacation_balances_user_id_year_key UNIQUE (user_id, year)`)
    console.log('  ✓ vacation_balances UNIQUE(user_id, year)')

    await db.query(`
  CREATE TABLE IF NOT EXISTS timesheets (
    id            SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status        VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_by    INTEGER REFERENCES users(id),
    updated_by    INTEGER REFERENCES users(id),
    updated_at    TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(department_id, year, month)
  )
`)

    await db.query(`
  CREATE TABLE IF NOT EXISTS timesheet_entries (
    id           SERIAL PRIMARY KEY,
    timesheet_id INTEGER NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
    employee_id  INTEGER NOT NULL REFERENCES users(id),
    date         DATE NOT NULL,
    code         VARCHAR(10),
    UNIQUE(timesheet_id, employee_id, date)
  )
`)

    await db.query(`
  ALTER TABLE timesheet_entries DROP COLUMN IF EXISTS hours
 `)

    await db.query(`
  ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS is_submitted BOOLEAN NOT NULL DEFAULT false
 `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS outlook_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('  - outlook_tokens:', e.message))
    console.log('  ✓ outlook_tokens')

    await db.query(`
      CREATE TABLE IF NOT EXISTS exchange_credentials (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        ews_url TEXT NOT NULL,
        username TEXT NOT NULL,
        password_encrypted TEXT NOT NULL,
        domain TEXT DEFAULT '',
        connected_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(e => console.log('  - exchange_credentials:', e.message))
    console.log('  ✓ exchange_credentials')

    // Step: Admin panel — dynamic roles, permissions, audit_log, system_settings
    console.log('Creating admin panel tables...')

    try {
      await db.query(`ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50)`)
      console.log('  ✓ users.role converted from ENUM to VARCHAR(50)')
    } catch (e) {
      if (e.message.includes('cannot alter type of a column used by a view')) {
        console.log('  - users.role ENUM→VARCHAR: blocked by view dependency')
      } else if (!e.message.includes('already') && !e.message.includes('cannot alter')) {
        console.log('  - users.role ENUM→VARCHAR:', e.message)
      }
    }
    try {
      await db.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'employee'`)
    } catch (e) {}

    await db.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        is_system BOOLEAN NOT NULL DEFAULT false,
        color VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ roles')

    const systemRoles = [
      { name: 'employee', description: 'Сотрудник', color: '#6366f1' },
      { name: 'manager', description: 'Руководитель', color: '#f59e0b' },
      { name: 'hr', description: 'HR-менеджер', color: '#10b981' },
      { name: 'admin', description: 'Администратор', color: '#ef4444' },
      { name: 'director', description: 'Директор', color: '#8b5cf6' },
      { name: 'onboarding', description: 'Онбординг', color: '#06b6d4' },
    ]
    for (const r of systemRoles) {
      await db.query(
        `INSERT INTO roles (name, description, is_system, color) VALUES ($1, $2, true, $3) ON CONFLICT (name) DO NOTHING`,
        [r.name, r.description, r.color]
      )
    }
    console.log('  ✓ system roles seeded')

    await db.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        module VARCHAR(50) NOT NULL,
        description TEXT
      )
    `)
    console.log('  ✓ permissions')

    const perms = [
      { code: 'users:view', name: 'Просмотр пользователей', module: 'users' },
      { code: 'users:create', name: 'Создание пользователей', module: 'users' },
      { code: 'users:edit', name: 'Редактирование пользователей', module: 'users' },
      { code: 'users:delete', name: 'Удаление пользователей', module: 'users' },
      { code: 'users:manage_roles', name: 'Управление ролями', module: 'users' },
      { code: 'users:reset_password', name: 'Сброс пароля', module: 'users' },
      { code: 'vacation:view', name: 'Просмотр отпусков', module: 'vacation' },
      { code: 'vacation:create', name: 'Создание заявлений на отпуск', module: 'vacation' },
      { code: 'vacation:approve', name: 'Согласование отпусков', module: 'vacation' },
      { code: 'vacation:manage', name: 'Управление отпусками', module: 'vacation' },
      { code: 'projects:view', name: 'Просмотр проектов', module: 'projects' },
      { code: 'projects:create', name: 'Создание проектов', module: 'projects' },
      { code: 'projects:edit', name: 'Редактирование проектов', module: 'projects' },
      { code: 'projects:delete', name: 'Удаление проектов', module: 'projects' },
      { code: 'projects:manage', name: 'Полное управление проектами', module: 'projects' },
      { code: 'surveys:view', name: 'Просмотр опросов', module: 'surveys' },
      { code: 'surveys:create', name: 'Создание опросов', module: 'surveys' },
      { code: 'surveys:manage', name: 'Управление опросами', module: 'surveys' },
      { code: 'departments:view', name: 'Просмотр отделов', module: 'departments' },
      { code: 'departments:create', name: 'Создание отделов', module: 'departments' },
      { code: 'departments:edit', name: 'Редактирование отделов', module: 'departments' },
      { code: 'departments:delete', name: 'Удаление отделов', module: 'departments' },
      { code: 'departments:manage', name: 'Полное управление отделами', module: 'departments' },
      { code: 'documents:view', name: 'Просмотр документов', module: 'documents' },
      { code: 'documents:create', name: 'Создание документов', module: 'documents' },
      { code: 'documents:manage', name: 'Управление документами', module: 'documents' },
      { code: 'dictionaries:view', name: 'Просмотр справочников', module: 'dictionaries' },
      { code: 'dictionaries:manage', name: 'Управление справочниками', module: 'dictionaries' },
      { code: 'hierarchy:view', name: 'Просмотр иерархии', module: 'hierarchy' },
      { code: 'hierarchy:manage', name: 'Управление иерархией', module: 'hierarchy' },
      { code: 'timesheet:view', name: 'Просмотр табелей', module: 'timesheet' },
      { code: 'timesheet:manage', name: 'Управление табелями', module: 'timesheet' },
      { code: 'onboarding:view', name: 'Просмотр онбординга', module: 'onboarding' },
      { code: 'onboarding:manage', name: 'Управление онбордингом', module: 'onboarding' },
      { code: 'calendar:view', name: 'Просмотр календаря', module: 'calendar' },
      { code: 'admin:access', name: 'Доступ к админ-панели', module: 'admin' },
      { code: 'admin:roles', name: 'Управление ролями и доступами', module: 'admin' },
      { code: 'admin:settings', name: 'Системные настройки', module: 'admin' },
      { code: 'admin:audit', name: 'Просмотр логов аудита', module: 'admin' },
    ]
    for (const p of perms) {
      await db.query(
        `INSERT INTO permissions (code, name, module) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
        [p.code, p.name, p.module]
      )
    }
    console.log('  ✓ permissions seeded')

    await db.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      )
    `)
    console.log('  ✓ role_permissions')

    const rolePermMap = {
      admin: perms.map(p => p.code),
      hr: perms.map(p => p.code).filter(c => !c.startsWith('admin:') && !c.startsWith('users:delete')),
      director: ['users:view', 'vacation:view', 'vacation:create', 'vacation:approve', 'projects:view', 'surveys:view', 'departments:view', 'timesheet:view', 'timesheet:manage', 'calendar:view', 'documents:view'],
      manager: ['users:view', 'vacation:view', 'vacation:create', 'vacation:approve', 'projects:view', 'surveys:view', 'departments:view', 'timesheet:view', 'timesheet:manage', 'calendar:view', 'documents:view'],
      employee: ['users:view', 'vacation:view', 'vacation:create', 'projects:view', 'surveys:view', 'departments:view', 'timesheet:view', 'calendar:view', 'documents:view'],
      onboarding: ['onboarding:view', 'users:view', 'departments:view'],
    }

    for (const [roleName, permCodes] of Object.entries(rolePermMap)) {
      const roleRes = await db.query('SELECT id FROM roles WHERE name = $1', [roleName])
      if (roleRes.rows.length === 0) continue
      const roleId = roleRes.rows[0].id
      for (const code of permCodes) {
        const permRes = await db.query('SELECT id FROM permissions WHERE code = $1', [code])
        if (permRes.rows.length === 0) continue
        await db.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roleId, permRes.rows[0].id]
        )
      }
    }
    console.log('  ✓ role_permissions seeded')

    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(50),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await db.query('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)').catch(() => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)').catch(() => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)').catch(() => {})
    console.log('  ✓ audit_log')

    await db.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ system_settings')

    const settings = [
      { key: 'company_name', value: 'Worker Cabinet', desc: 'Название компании' },
      { key: 'vacation_default_days', value: '28', desc: 'Количество дней отпуска по умолчанию' },
      { key: 'session_duration_days', value: '7', desc: 'Длительность сессии (дни)' },
      { key: 'password_min_length', value: '8', desc: 'Минимальная длина пароля' },
      { key: 'login_title', value: 'Личный кабинет сотрудника', desc: 'Заголовок на странице входа' },
      { key: 'login_subtitle', value: 'Единая платформа для управления персоналом, отпусками и документами', desc: 'Описание на странице входа' },
      { key: 'login_stat_1_value', value: '24', desc: 'Статистика 1 — значение' },
      { key: 'login_stat_1_label', value: 'дня отпуска', desc: 'Статистика 1 — подпись' },
      { key: 'login_stat_2_value', value: '156', desc: 'Статистика 2 — значение' },
      { key: 'login_stat_2_label', value: 'сотрудников', desc: 'Статистика 2 — подпись' },
      { key: 'login_stat_3_value', value: '12', desc: 'Статистика 3 — значение' },
      { key: 'login_stat_3_label', value: 'отделов', desc: 'Статистика 3 — подпись' },
      { key: 'login_demo_buttons', value: 'true', desc: 'Показывать демо-кнопки быстрого входа' },
      { key: 'login_show_stats', value: 'true', desc: 'Показывать блок статистики на странице входа' },
      { key: 'assistant_api_url', value: '', desc: 'API URL ассистента (OpenAI-совместимый)' },
      { key: 'assistant_api_key', value: '', desc: 'API ключ ассистента' },
      { key: 'assistant_model', value: 'gpt-4o-mini', desc: 'Модель AI ассистента' },
      { key: 'assistant_system_prompt', value: 'Ты — кадровый ассистент. Помогай сотрудникам с вопросами о кадрах, отпусках, документах. Отвечай на русском языке.', desc: 'Системный промпт ассистента' },
    ]
    for (const s of settings) {
      await db.query(
        `INSERT INTO system_settings (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
        [s.key, s.value, s.desc]
      )
    }
    console.log('  ✓ system_settings seeded')

    console.log('✅ Admin panel tables created')

    // Step: Error log + failed logins + account lockout
    console.log('Creating security tables...')

    await db.query(`
      CREATE TABLE IF NOT EXISTS error_log (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        stack TEXT,
        path VARCHAR(500),
        method VARCHAR(10),
        status_code INTEGER,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_email VARCHAR(255),
        ip VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await db.query('CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at)').catch(() => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_error_log_status ON error_log(status_code)').catch(() => {})
    console.log('  ✓ error_log')

    await db.query(`
      CREATE TABLE IF NOT EXISTS failed_login_attempts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await db.query('CREATE INDEX IF NOT EXISTS idx_failed_login_created ON failed_login_attempts(created_at)').catch(() => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_failed_login_email ON failed_login_attempts(email)').catch(() => {})
    console.log('  ✓ failed_login_attempts')

    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`)
      console.log('  ✓ locked_until column')
    } catch (e) {}
    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0`)
      console.log('  ✓ failed_login_count column')
    } catch (e) {}
    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS office VARCHAR(100)`)
      console.log('  ✓ office column')
    } catch (e) {}
    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cabinet VARCHAR(50)`)
      console.log('  ✓ cabinet column')
    } catch (e) {}

    console.log('✅ Security tables created')

    // Step: Modules toggle
    console.log('Creating modules table...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS modules (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        route VARCHAR(255),
        category VARCHAR(100) DEFAULT 'general',
        sort_order INTEGER DEFAULT 0,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ modules')

    try {
      await db.query(`ALTER TABLE modules ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general'`)
      console.log('  ✓ modules category column')
    } catch (e) {}

    try {
      await db.query(`ALTER TABLE modules ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`)
      console.log('  ✓ modules settings column')
    } catch (e) {}

    const categoryMap = {
      vacation: 'hr', surveys: 'work', projects: 'work', documents: 'docs',
      timesheet: 'work', onboarding: 'hr', hierarchy: 'hr',
      dictionaries: 'admin', skills: 'hr', calendar: 'admin',
      analytics: 'admin', notifications: 'docs',
    }
    for (const [code, category] of Object.entries(categoryMap)) {
      await db.query(`UPDATE modules SET category = $1 WHERE code = $2 AND (category IS NULL OR category = 'general')`, [category, code])
    }

    const defaultModules = [
      { code: 'vacation', name: 'Отпуска', description: 'Управление отпусками, балансы, заявления', icon: 'Plane', route: '/vacation', sort: 10, category: 'hr' },
      { code: 'surveys', name: 'Опросы', description: 'Создание и прохождение опросов', icon: 'ClipboardList', route: '/surveys', sort: 20, category: 'work' },
      { code: 'projects', name: 'Проекты', description: 'Управление проектами и задачами', icon: 'FolderKanban', route: '/projects', sort: 30, category: 'work' },
      { code: 'documents', name: 'Документы', description: 'Загрузка и хранение документов', icon: 'FolderOpen', route: '/documents', sort: 40, category: 'docs' },
      { code: 'timesheet', name: 'Табель', description: 'Учёт рабочего времени по Т-13', icon: 'Calendar', route: '/timesheet', sort: 50, category: 'work' },
      { code: 'onboarding', name: 'Онбординг', description: 'Адаптация новых сотрудников', icon: 'UserPlus', route: '/onboarding', sort: 60, category: 'hr' },
      { code: 'hierarchy', name: 'Иерархия', description: 'Организационная структура компании', icon: 'Network', route: '/hr/hierarchy', sort: 70, category: 'hr' },
      { code: 'dictionaries', name: 'Справочники', description: 'Справочники должностей, навыков, типов', icon: 'BookOpen', route: '/hr/dictionaries', sort: 80, category: 'admin' },
      { code: 'skills', name: 'Навыки', description: 'Управление навыками и компетенциями сотрудников', icon: 'Wrench', route: null, sort: 85, category: 'hr' },
      { code: 'calendar', name: 'Календарь', description: 'Интеграция с Outlook/EWS календарём', icon: 'CalendarDays', route: '/calendar', sort: 90, category: 'admin' },
      { code: 'notifications', name: 'Уведомления', description: 'Email-уведомления о событиях в системе', icon: 'Bell', route: '/notifications', sort: 100, category: 'docs' },
      { code: 'analytics', name: 'Аналитика', description: 'Графики, статистика и аналитика системы', icon: 'BarChart3', route: '/admin/analytics', sort: 120, category: 'admin' },
      { code: 'auth', name: 'Авторизация', description: 'Настройки аутентификации, авторизации и безопасности', icon: 'Lock', route: null, sort: 5, category: 'core' },
    ]
    for (const m of defaultModules) {
      await db.query(
        `INSERT INTO modules (code, name, description, icon, route, sort_order, category) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (code) DO NOTHING`,
        [m.code, m.name, m.description, m.icon, m.route, m.sort, m.category]
      )
    }
    console.log('  ✓ modules seeded')
    console.log('✅ Modules table created')

    console.log('Creating notification tables...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS notification_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(100) NOT NULL,
        channel VARCHAR(20) NOT NULL DEFAULT 'email',
        data JSONB DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        send_at TIMESTAMP WITH TIME ZONE,
        sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    await db.query('CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue (status, send_at)').catch(() => {})
    await db.query('CREATE INDEX IF NOT EXISTS idx_notification_queue_user ON notification_queue (user_id, read_at)').catch(() => {})
    try {
      await db.query(`ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`)
    } catch (e) {}
    console.log('  ✓ notification_queue')
    console.log('✅ Notification tables created')

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
