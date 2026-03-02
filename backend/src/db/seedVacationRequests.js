import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function seedVacationRequests() {
  try {
    console.log('Starting vacation requests seed...')

    // Проверяем, есть ли уже заявки
    const existingRequests = await query('SELECT COUNT(*) as count FROM vacation_requests')
    if (parseInt(existingRequests.rows[0].count) > 0) {
      console.log('✅ Vacation requests already exist, skipping seed')
      process.exit(0)
    }

    // Создание балансов для всех пользователей
    const usersResult = await query('SELECT id FROM users')
    const users = usersResult.rows

    for (const user of users) {
      await query(
        `INSERT INTO vacation_balances 
         (user_id, total_days, used_days, available_days, reserved_days, travel_available)
         VALUES ($1, 28, 0, 28, 0, true)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      )
    }
    console.log(`✅ Created balances for ${users.length} users`)

    // Заявка Иванова (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel, reviewed_by)
       VALUES ($1, '2026-01-15', '2026-01-29', 15, 'annual_paid', 'approved', false, 1)`,
      [2]
    )

    // Заявка Иванова (на согласовании)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-06-02', '2026-06-15', 14, 'annual_paid', 'on_approval', true)`,
      [2]
    )

    // Заявка Петрова (одобрена) - руководитель
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-02-01', '2026-02-14', 14, 'annual_paid', 'approved', false)`,
      [1]
    )

    // Заявка Сидорова (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-03-01', '2026-03-14', 14, 'annual_paid', 'approved', false)`,
      [3]
    )

    // Заявка Ивановой (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-04-01', '2026-04-14', 14, 'annual_paid', 'approved', true)`,
      [4]
    )

    // Заявка Петровой (одобрена)
    await query(
      `INSERT INTO vacation_requests 
       (user_id, start_date, end_date, duration, vacation_type, status, has_travel)
       VALUES ($1, '2026-05-01', '2026-05-14', 14, 'annual_paid', 'approved', false)`,
      [5]
    )

    console.log('✅ Vacation requests seeded successfully')
    console.log('Created 6 vacation requests')
    process.exit(0)
  } catch (error) {
    console.error('❌ Seed error:', error)
    process.exit(1)
  }
}

seedVacationRequests()
