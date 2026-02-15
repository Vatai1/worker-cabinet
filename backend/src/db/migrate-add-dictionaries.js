import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

async function runMigrations() {
  console.log('Starting migration: create dictionaries for statuses and types...')

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

    console.log('Creating request_statuses table...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS request_statuses (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ request_statuses table created')

    console.log('Creating vacation_types table...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS vacation_types (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('  ✓ vacation_types table created')

    console.log('Creating indexes...')
    await db.query('CREATE INDEX IF NOT EXISTS idx_request_statuses_code ON request_statuses(code)')
    await db.query('CREATE INDEX IF NOT EXISTS idx_vacation_types_code ON vacation_types(code)')
    await db.query('CREATE INDEX IF NOT EXISTS idx_request_statuses_active ON request_statuses(is_active) WHERE is_active = true')
    await db.query('CREATE INDEX IF NOT EXISTS idx_vacation_types_active ON vacation_types(is_active) WHERE is_active = true')
    console.log('  ✓ indexes created')

    console.log('Inserting data into request_statuses...')
    const statusesResult = await db.query(`
      INSERT INTO request_statuses (code, name, description, sort_order) VALUES
        ('on_approval', 'На согласовании', 'Заявка ожидает согласования менеджером', 1),
        ('approved', 'Одобрено', 'Заявка одобрена менеджером', 2),
        ('rejected', 'Отклонено', 'Заявка отклонена менеджером', 3),
        ('cancelled_by_employee', 'Отменено сотрудником', 'Заявка отменена сотрудником', 4),
        ('cancelled_by_manager', 'Отменено менеджером', 'Заявка отменена менеджером', 5)
      ON CONFLICT (code) DO NOTHING
      RETURNING code, id
    `)
    console.log(`  ✓ inserted ${statusesResult.rowCount} statuses`)

    console.log('Inserting data into vacation_types...')
    const typesResult = await db.query(`
      INSERT INTO vacation_types (code, name, description, sort_order) VALUES
        ('annual_paid', 'Ежегодный оплачиваемый', 'Основной оплачиваемый отпуск', 1),
        ('unpaid', 'Неоплачиваемый', 'Отпуск без сохранения заработной платы', 2),
        ('educational', 'Учебный', 'Отпуск для обучения с сохранением заработной платы', 3),
        ('maternity', 'Отпуск по беременности и родам', 'Отпуск по беременности и родам', 4),
        ('child_care', 'Отпуск по уходу за ребенком', 'Отпуск по уходу за ребенком до достижения им возраста трех лет', 5),
        ('additional', 'Дополнительный', 'Дополнительный оплачиваемый отпуск', 6),
        ('veteran', 'Отпуск ветерана боевых действий', 'Отпуск для участников боевых действий', 7)
      ON CONFLICT (code) DO NOTHING
      RETURNING code, id
    `)
    console.log(`  ✓ inserted ${typesResult.rowCount} vacation types`)

    console.log('Creating trigger for updated_at on request_statuses...')
    await db.query(`DROP TRIGGER IF EXISTS update_request_statuses_updated_at ON request_statuses`)
    await db.query(`CREATE TRIGGER update_request_statuses_updated_at BEFORE UPDATE ON request_statuses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    console.log('Creating trigger for updated_at on vacation_types...')
    await db.query(`DROP TRIGGER IF EXISTS update_vacation_types_updated_at ON vacation_types`)
    await db.query(`CREATE TRIGGER update_vacation_types_updated_at BEFORE UPDATE ON vacation_types
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`)

    await db.query('COMMIT')

    console.log('✅ Dictionaries created successfully!')

    console.log('\nNext steps:')
    console.log('1. Run migrate-to-dictionaries.js to update tables')
    console.log('2. Update application code to use dictionary tables')
    console.log('3. Optionally drop old ENUM types')

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
