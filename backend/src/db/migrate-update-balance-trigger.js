import { query } from '../config/database.js'

async function migrate() {
  console.log('Updating vacation_balances trigger to consider reserved_days...')
  
  try {
    // Сначала удалим старый триггер
    await query(`
      DROP TRIGGER IF EXISTS update_balance_available_days ON vacation_balances
    `)
    
    // Удалим старую функцию
    await query(`
      DROP FUNCTION IF EXISTS update_available_days()
    `)
    
    // Создадим новую функцию с правильной логикой
    await query(`
      CREATE OR REPLACE FUNCTION update_available_days()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.available_days := NEW.total_days - NEW.used_days - NEW.reserved_days;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `)
    
    // Создадим новый триггер
    await query(`
      CREATE TRIGGER update_balance_available_days 
        BEFORE INSERT OR UPDATE ON vacation_balances
        FOR EACH ROW EXECUTE FUNCTION update_available_days()
    `)
    
    console.log('✓ Migration completed successfully')
  } catch (error) {
    console.error('✗ Migration failed:', error.message)
    process.exit(1)
  }
  
  process.exit(0)
}

migrate()
