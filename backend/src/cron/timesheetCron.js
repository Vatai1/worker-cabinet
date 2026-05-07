import cron from 'node-cron'
import { query, getClient } from '../config/database.js'

function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function createTimesheetRecords(year, month) {
  const depts = await query(`SELECT id FROM departments`)
  let created = 0
  for (const dept of depts.rows) {
    const result = await query(
      `INSERT INTO timesheets (department_id, year, month)
       VALUES ($1, $2, $3)
       ON CONFLICT (department_id, year, month) DO NOTHING`,
      [dept.id, year, month]
    )
    if (result.rowCount > 0) created++
  }
  console.log(`[cron] Табели за ${year}-${month}: создано записей ${created}`)
}

async function addDayEntries(year, month, day) {
  const dateStr = toLocalDateStr(new Date(year, month - 1, day))
  const dow = new Date(year, month - 1, day).getDay()

  const timesheets = await query(
    `SELECT id, department_id FROM timesheets
     WHERE year = $1 AND month = $2`,
    [year, month]
  )

  let added = 0
  for (const ts of timesheets.rows) {
    const client = await getClient()
    try {
      await client.query('BEGIN')

      const empResult = await client.query(
        `SELECT id FROM users WHERE department_id = $1 AND role IN ('employee', 'manager')`,
        [ts.department_id]
      )
      const employees = empResult.rows
      if (employees.length === 0) {
        await client.query('ROLLBACK')
        continue
      }

      let vacationDays = new Set()
      if (dow !== 0 && dow !== 6) {
        const vacResult = await client.query(
          `SELECT vr.user_id
           FROM vacation_requests vr
           JOIN request_statuses rs ON vr.status_id = rs.id
           WHERE vr.user_id = ANY($1)
             AND rs.code = 'approved'
             AND vr.start_date <= $2
             AND vr.end_date >= $2`,
          [employees.map(e => e.id), dateStr]
        )
        for (const row of vacResult.rows) vacationDays.add(row.user_id)
      }

      const entries = employees.map(emp => {
        let code
        if (dow === 0 || dow === 6) {
          code = 'В'
        } else if (vacationDays.has(emp.id)) {
          code = 'ОТ'
        } else {
          code = 'Я'
        }
        return [ts.id, emp.id, dateStr, code]
      })

      const placeholders = entries.map((_, i) => {
        const b = i * 4
        return `($${b+1}, $${b+2}, $${b+3}, $${b+4})`
      }).join(', ')

      await client.query(
        `INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code)
         VALUES ${placeholders}
         ON CONFLICT (timesheet_id, employee_id, date) DO NOTHING`,
        entries.flat()
      )

      await client.query('COMMIT')
      added++
    } catch (error) {
      await client.query('ROLLBACK')
      console.error(`[cron] Ошибка при добавлении записей для табеля ${ts.id}:`, error)
    } finally {
      client.release()
    }
  }
  console.log(`[cron] Добавлены записи за ${dateStr} в ${added} табель(ей)`)
}

export async function runDailyTimesheetJob(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  if (day === 1) {
    await createTimesheetRecords(year, month)
  }
  await addDayEntries(year, month, day)
}

export function scheduleTimesheetCron() {
  cron.schedule('5 0 * * *', () => {
    console.log('[cron] Ежедневное задание табелей...')
    runDailyTimesheetJob().catch(err =>
      console.error('[cron] Ошибка:', err)
    )
  })
  console.log('[cron] Расписание табелей активировано (ежедневно в 00:05)')
}
