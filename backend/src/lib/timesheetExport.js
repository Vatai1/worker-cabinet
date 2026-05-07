import { query } from '../config/database.js'

export async function getTimesheetExportData(id) {
  const tsResult = await query(
    `SELECT t.*, d.name as department_name FROM timesheets t
     JOIN departments d ON t.department_id = d.id WHERE t.id = $1`,
    [id]
  )
  if (tsResult.rows.length === 0) return null
  const timesheet = tsResult.rows[0]

  const entriesResult = await query(
    `SELECT te.employee_id, te.date, te.code,
            u.first_name, u.last_name
     FROM timesheet_entries te
     JOIN users u ON te.employee_id = u.id
     WHERE te.timesheet_id = $1
     ORDER BY u.last_name, u.first_name, te.date`,
    [id]
  )

  const daysInMonth = new Date(timesheet.year, timesheet.month, 0).getDate()

  const byEmployee = {}
  for (const e of entriesResult.rows) {
    if (!byEmployee[e.employee_id]) {
      byEmployee[e.employee_id] = { name: `${e.last_name} ${e.first_name}`, days: {} }
    }
    byEmployee[e.employee_id].days[e.date] = e.code
  }

  return { timesheet, daysInMonth, byEmployee }
}
