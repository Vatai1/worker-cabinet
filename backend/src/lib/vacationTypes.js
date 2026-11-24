import { MANUAL_CODES } from './timesheetCodes.js'

const RULES = {
  annual_paid: { balance: true, excludeHolidays: true, code: 'О' },
  additional: { balance: true, excludeHolidays: true, code: 'О' },
  educational: { balance: false, excludeHolidays: false, code: 'ОУ' },
  maternity: { balance: false, excludeHolidays: false, code: 'Б' },
  child_care: { balance: false, excludeHolidays: false, code: 'Р' },
  unpaid: { balance: false, excludeHolidays: false, code: 'ДО' },
  veteran: { balance: false, excludeHolidays: false, code: 'ОЗ' },
  day_off: { balance: false, excludeHolidays: false, workingDays: true, code: 'НВ' },
}

export const vacationTypeRule = (code) => RULES[code] || RULES.annual_paid

export const VACATION_TIMESHEET_CODES = [...new Set(Object.values(RULES).map(r => r.code))].filter(code => !MANUAL_CODES.includes(code))

export async function requestTypeCode(db, request) {
  return (await db.query('SELECT code FROM vacation_types WHERE id = $1', [request.vacation_type_id])).rows[0]?.code ?? null
}
