import TIMESHEET_CODES from './timesheetCodes.json' with { type: 'json' }

export { TIMESHEET_CODES }
export const MANUAL_CODES = TIMESHEET_CODES.filter(item => item.manual !== false).map(item => item.code)
export const MINUTE_CODES = TIMESHEET_CODES.filter(item => item.minutes).map(item => item.code)
