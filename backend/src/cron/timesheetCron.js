import cron from 'node-cron'
import { query, inTransaction } from '../config/database.js'
import { toLocalDateStr } from '../lib/dateUtils.js'
import { getWorkingCalendar } from '../lib/workingCalendar.js'
import { getTimesheetMarks } from '../lib/timesheetData.js'
import { timesheetDepartments } from '../lib/timesheetAccess.js'
import { isModuleEnabledForOrg } from '../lib/permissions.js'
import { notify } from '../config/notifications.js'

export async function runDailyTimesheetJob(date = new Date()) {
  if (date.getDate() !== 1) return
  const { rowCount } = await query(
    `INSERT INTO timesheets (department_id, year, month, organization_id, document_date)
     SELECT id, $1, $2, organization_id, $3 FROM departments
     WHERE EXISTS (SELECT 1 FROM system_settings WHERE key = 'timesheet_auto_create' AND value = 'true')
     ON CONFLICT (department_id, year, month, version) DO NOTHING`,
    [date.getFullYear(), date.getMonth() + 1, toLocalDateStr(date)]
  )
  console.log(`[cron] Создано табелей за месяц: ${rowCount}`)
}

export function scheduleTimesheetCron() {
  cron.schedule('* * * * *', () => {
    runTimesheetReminderJob().catch(err => console.error('[cron] Ошибка напоминания о табеле:', err))
  })
  cron.schedule('5 0 1 * *', () => {
    runDailyTimesheetJob().catch(err => console.error('[cron] Ошибка:', err))
  })
  console.log('[cron] Автосоздание табелей запланировано на первое число месяца в 00:05')
}

export async function runTimesheetReminderJob(now = new Date()) {
  const date = toLocalDateStr(now)
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const { rows: settings } = await query("SELECT key, value FROM system_settings WHERE key IN ('timesheet_reminder_enabled', 'timesheet_reminder_time')")
  const values = Object.fromEntries(settings.map(s => [s.key, s.value]))
  if (values.timesheet_reminder_enabled !== 'true' || values.timesheet_reminder_time !== time) return 0
  const calendar = await getWorkingCalendar(date, date)
  if (calendar.isNonWorking(date)) return 0
  const { rows: candidates } = await query(
    `SELECT DISTINCT u.id, uo.org_id FROM users u JOIN user_organizations uo ON uo.user_id = u.id AND uo.is_active
     WHERE u.status <> 'inactive' AND NOT u.is_test AND u.email IS NOT NULL
       AND (EXISTS (SELECT 1 FROM departments d WHERE d.manager_id = u.id AND d.organization_id = uo.org_id)
         OR EXISTS (SELECT 1 FROM timesheet_managers tm JOIN departments d ON d.id = tm.department_id WHERE tm.user_id = u.id AND d.organization_id = uo.org_id)
         OR EXISTS (SELECT 1 FROM vacation_substitutions vs WHERE vs.substitute_user_id = u.id AND vs.organization_id = uo.org_id))`
  )
  let sent = 0
  for (const user of candidates) {
    if (!(await isModuleEnabledForOrg('timesheet', user.org_id)) || !(await isModuleEnabledForOrg('notifications', user.org_id))) continue
    const departments = await timesheetDepartments(user.id, user.org_id)
    for (const dept of departments) {
      sent += await inTransaction(async db => {
        const { rows } = await db.query(
          `SELECT t.status AS month_status, td.status FROM timesheets t
           LEFT JOIN timesheet_days td ON td.timesheet_id = t.id AND td.date = $2
           WHERE t.department_id = $1 AND t.year = $3 AND t.month = $4 AND (t.period = 'month' OR EXTRACT(DAY FROM $2::date) <= 15)
           ORDER BY t.version DESC LIMIT 1`, [dept.id, date, now.getFullYear(), now.getMonth() + 1])
        if (rows[0] && (rows[0].month_status !== 'draft' || ['submitted', 'approved'].includes(rows[0].status))) return 0
        const marks = await getTimesheetMarks(db, { organization_id: user.org_id }, [date], [user.id])
        if (marks.vacations.size) return 0
        const { rowCount } = await db.query(
          'INSERT INTO timesheet_reminder_deliveries (department_id, user_id, date) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [dept.id, user.id, date])
        if (!rowCount) return 0
        const notification = await notify({ userId: user.id, type: 'timesheet_reminder', channel: 'email', db, data: {
          subject: 'Отправьте табель посещаемости', message: `Табель отдела «${dept.name}» за ${date} ещё не отправлен HR.`,
          departmentId: dept.id, organizationId: user.org_id, date,
        } })
        return notification ? 1 : 0
      })
    }
  }
  return sent
}
