import { query } from '../config/database.js'
import { getWorkingCalendar } from './workingCalendar.js'
import { vacationTypeRule, VACATION_TIMESHEET_CODES } from './vacationTypes.js'

export function timesheetDates({ year, month }) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) =>
    `${prefix}-${String(i + 1).padStart(2, '0')}`)
}

export async function getTimesheetEmployees(db, sheet, includeTest) {
  const { rows } = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.middle_name
     FROM users u JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = $1
     WHERE COALESCE(uo.department_id, u.department_id) = $2 AND uo.is_active AND u.status <> 'inactive'
       AND ($3 OR NOT u.is_test)
     ORDER BY u.last_name, u.first_name, u.id`,
    [sheet.organization_id, sheet.department_id, includeTest]
  )
  return rows
}

export async function getTimesheetMarks(db, sheet, dates, employeeIds) {
  const start = dates[0]
  const end = dates.at(-1)
  const calendar = await getWorkingCalendar(start, end, db)
  const { rows } = await db.query(
    `SELECT vr.user_id, vr.start_date, vr.end_date, vt.code AS type
     FROM vacation_requests vr
     JOIN request_statuses rs ON rs.id = vr.status_id
     JOIN vacation_types vt ON vt.id = vr.vacation_type_id
     WHERE vr.organization_id = $1 AND vr.user_id = ANY($2::int[]) AND rs.code = 'approved'
       AND vr.start_date <= $4 AND vr.end_date >= $3
     ORDER BY vr.id`,
    [sheet.organization_id, employeeIds, start, end]
  )
  const nonWorkingDays = dates.filter(calendar.isNonWorking)
  const vacations = new Map()
  for (const row of rows) {
    const rule = vacationTypeRule(row.type)
    for (const date of dates) {
      if (date < row.start_date || date > row.end_date) continue
      if (rule.workingDays && calendar.isNonWorking(date)) continue
      if (rule.excludeHolidays && calendar.isHoliday(date)) continue
      vacations.set(`${row.user_id}:${date}`, rule.code)
    }
  }
  return { nonWorkingDays, vacations }
}

export async function getTimesheetData(sheet, includeTest, db = { query }) {
  const employees = await getTimesheetEmployees(db, sheet, includeTest)
  const { rows: days } = await db.query(
    'SELECT date, status, revision, employee_ids, reason FROM timesheet_days WHERE timesheet_id = $1 ORDER BY date DESC',
    [sheet.id]
  )
  const { rows: stored } = await db.query(
    `SELECT te.*, u.first_name, u.last_name, u.middle_name
     FROM timesheet_entries te JOIN users u ON u.id = te.employee_id
     LEFT JOIN timesheet_days td ON td.timesheet_id = te.timesheet_id AND td.date = te.date
     LEFT JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = te.organization_id
     WHERE te.timesheet_id = $1 AND te.organization_id = $2 AND ($4 OR NOT u.is_test)
       AND CASE WHEN cardinality(td.employee_ids) > 0 THEN te.employee_id = ANY(td.employee_ids)
           ELSE uo.user_id IS NOT NULL AND COALESCE(uo.department_id, u.department_id) = $3 END
     ORDER BY u.last_name, u.first_name, te.date`,
    [sheet.id, sheet.organization_id, sheet.department_id, includeTest]
  )
  const currentEmployeeIds = employees.map(e => e.id)
  const employeeById = new Map(employees.map(e => [e.id, e]))
  for (const { employee_id: id, first_name, last_name, middle_name } of stored) {
    if (!employeeById.has(id)) employeeById.set(id, { id, first_name, last_name, middle_name })
  }
  const dates = timesheetDates(sheet)
  const { nonWorkingDays, vacations } = await getTimesheetMarks(db, sheet, dates, [...employeeById.keys()])
  const dayByDate = new Map(days.map(d => [d.date, d]))
  const isLocked = date => sheet.status !== 'draft' || ['submitted', 'approved'].includes(dayByDate.get(date)?.status)
  const entries = new Map()
  for (const entry of stored) {
    const key = `${entry.employee_id}:${entry.date}`
    if (isLocked(entry.date) || !VACATION_TIMESHEET_CODES.includes(entry.code)) entries.set(key, entry)
  }
  if (sheet.status === 'draft') {
    for (const date of dates) {
      if (isLocked(date)) continue
      const day = dayByDate.get(date)
      const roster = day?.employee_ids.length ? day.employee_ids : currentEmployeeIds
      for (const id of roster) {
        if (!employeeById.has(id)) continue
        const key = `${id}:${date}`
        const code = vacations.get(key) ?? (nonWorkingDays.includes(date) ? 'В' : null)
        if (code) {
          const { first_name, last_name, middle_name } = employeeById.get(id)
          entries.set(key, { employee_id: id, date, code, is_submitted: false, first_name, last_name, middle_name })
        }
      }
    }
  }
  return {
    employees: [...employeeById.values()], currentEmployeeIds, entries: [...entries.values()],
    days: days.map(day => ({ ...day, employee_ids: day.employee_ids.filter(id => employeeById.has(id)) })),
    nonWorkingDays,
  }
}
