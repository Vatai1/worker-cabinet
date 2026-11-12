import { query } from '../config/database.js'
import { getWorkingCalendar } from './workingCalendar.js'
import { vacationTypeRule, VACATION_TIMESHEET_CODES } from './vacationTypes.js'
import { toLocalDateStr } from './dateUtils.js'

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
           ELSE (uo.user_id IS NOT NULL AND ($5 OR COALESCE(uo.department_id, u.department_id) = $3))
             OR EXISTS (SELECT 1 FROM department_transfers tr
                        WHERE tr.user_id = te.employee_id AND tr.from_department_id = $3) END
     ORDER BY u.last_name, u.first_name, te.date`,
    [sheet.id, sheet.organization_id, sheet.department_id, includeTest, sheet.status === 'approved']
  )
  const currentEmployeeIds = employees.map(e => e.id)
  const employeeById = new Map(employees.map(e => [e.id, e]))
  for (const { employee_id: id, first_name, last_name, middle_name } of stored) {
    if (!employeeById.has(id)) employeeById.set(id, { id, first_name, last_name, middle_name })
  }
  const dates = timesheetDates(sheet)
  const { rows: recordedTransfers } = await db.query(
    `SELECT tr.user_id, u.first_name, u.last_name, u.middle_name, tr.transferred_at,
            tr.to_department_name, tr.to_organization_name,
            (SELECT arrival.transferred_at FROM department_transfers arrival
             WHERE arrival.user_id = tr.user_id AND arrival.to_department_id = $1 AND arrival.id > tr.id
             ORDER BY arrival.id LIMIT 1) AS returned_at
     FROM department_transfers tr JOIN users u ON u.id = tr.user_id
     WHERE tr.from_department_id = $1 AND tr.transferred_at >= $2 AND tr.transferred_at < $3
       AND ($4 OR NOT u.is_test)
     ORDER BY tr.id`,
    [sheet.department_id, new Date(sheet.year, sheet.month - 1, 1), new Date(sheet.year, sheet.month, 1), includeTest]
  )
  const transferDates = new Map()
  for (const tr of recordedTransfers) {
    const start = toLocalDateStr(tr.transferred_at)
    const end = tr.returned_at && toLocalDateStr(tr.returned_at)
    if (end && end <= start) continue
    const label = tr.to_department_name
      ? `Переведён в «${tr.to_organization_name}», отдел «${tr.to_department_name}»`
      : 'Выбыл из подразделения'
    if (!employeeById.has(tr.user_id)) {
      employeeById.set(tr.user_id, { id: tr.user_id, first_name: tr.first_name, last_name: tr.last_name, middle_name: tr.middle_name })
    }
    for (const date of dates) {
      if (date >= start && (!end || date < end)) transferDates.set(`${tr.user_id}:${date}`, label)
    }
  }
  if (sheet.status === 'approved') {
    const lastMarks = new Map()
    for (const entry of stored) {
      if (entry.code && entry.code !== 'В' && entry.date > (lastMarks.get(entry.employee_id) ?? '')) {
        lastMarks.set(entry.employee_id, entry.date)
      }
    }
    const formerIds = [...lastMarks.keys()].filter(id => !currentEmployeeIds.includes(id) && lastMarks.get(id) < dates.at(-1))
    if (formerIds.length) {
      const { rows: destinations } = await db.query(
        `SELECT DISTINCT ON (uo.user_id) uo.user_id, d.name AS department_name, o.name AS organization_name
         FROM user_organizations uo JOIN users u ON u.id = uo.user_id
         JOIN departments d ON d.id = COALESCE(uo.department_id, u.department_id) AND d.organization_id = uo.org_id
         JOIN organizations o ON o.id = uo.org_id
         WHERE uo.user_id = ANY($1) AND uo.is_active AND d.id <> $2
           AND NOT EXISTS (SELECT 1 FROM department_transfers tr
                           WHERE tr.user_id = uo.user_id AND tr.from_department_id = $2)
         ORDER BY uo.user_id, (d.id = u.department_id) DESC NULLS LAST, uo.is_primary DESC NULLS LAST, uo.id`,
        [formerIds, sheet.department_id]
      )
      for (const destination of destinations) {
        const label = `Переведён в «${destination.organization_name}», отдел «${destination.department_name}» (дата перевода неизвестна)`
        for (const date of dates) {
          if (date > lastMarks.get(destination.user_id)) transferDates.set(`${destination.user_id}:${date}`, label)
        }
      }
    }
  }
  const { nonWorkingDays, vacations } = await getTimesheetMarks(db, sheet, dates, [...employeeById.keys()])
  const dayByDate = new Map(days.map(d => [d.date, d]))
  const isLocked = date => sheet.status !== 'draft' || ['submitted', 'approved'].includes(dayByDate.get(date)?.status)
  const entries = new Map()
  for (const entry of stored) {
    const key = `${entry.employee_id}:${entry.date}`
    const transferred = transferDates.has(key) && !dayByDate.get(entry.date)?.employee_ids.includes(entry.employee_id)
    if (transferred && (!isLocked(entry.date) || entry.code === 'В')) continue
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
        if (transferDates.has(key) && !day?.employee_ids.includes(id)) continue
        const code = vacations.get(key) ?? (nonWorkingDays.includes(date) ? 'В' : null)
        if (code) {
          const { first_name, last_name, middle_name } = employeeById.get(id)
          entries.set(key, { employee_id: id, date, code, is_submitted: false, first_name, last_name, middle_name })
        }
      }
    }
  }
  const transfers = []
  for (const id of employeeById.keys()) {
    let span
    for (const date of dates) {
      const key = `${id}:${date}`
      const label = entries.get(key)?.code || dayByDate.get(date)?.employee_ids.includes(id) ? null : transferDates.get(key)
      if (!label) {
        span = undefined
      } else if (span?.label === label) {
        span.end_date = date
      } else {
        span = { employee_id: id, start_date: date, end_date: date, label }
        transfers.push(span)
      }
    }
  }
  return {
    employees: [...employeeById.values()], currentEmployeeIds, entries: [...entries.values()],
    days: days.map(day => ({ ...day, employee_ids: day.employee_ids.filter(id => employeeById.has(id)) })),
    nonWorkingDays, transfers,
  }
}
