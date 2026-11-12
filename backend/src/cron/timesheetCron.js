import cron from 'node-cron'
import { query } from '../config/database.js'

export async function runDailyTimesheetJob(date = new Date()) {
  if (date.getDate() !== 1) return
  const { rowCount } = await query(
    `INSERT INTO timesheets (department_id, year, month, organization_id)
     SELECT id, $1, $2, organization_id FROM departments
     WHERE EXISTS (SELECT 1 FROM system_settings WHERE key = 'timesheet_auto_create' AND value = 'true')
     ON CONFLICT (department_id, year, month) DO NOTHING`,
    [date.getFullYear(), date.getMonth() + 1]
  )
  console.log(`[cron] Создано табелей за месяц: ${rowCount}`)
}

export function scheduleTimesheetCron() {
  cron.schedule('5 0 1 * *', () => {
    runDailyTimesheetJob().catch(err => console.error('[cron] Ошибка:', err))
  })
  console.log('[cron] Автосоздание табелей запланировано на первое число месяца в 00:05')
}
