import type { TimesheetDetails } from '@/shared/components/timesheet/TimesheetGrid'

export const TIMESHEET_DATE = '2026-11-10'
export const DEPARTMENT = { id: 2, name: 'Отдел эксплуатации' }

export const EMPLOYEE_SETTINGS = [
  { id: 1, name: 'Иванов Алексей', position: 'Инженер', department_id: 2, department_name: DEPARTMENT.name, staff_number: '0012', staff_numbers: ['0012', '0047'], hourly: true },
  { id: 2, name: 'Соколова Мария', position: 'Специалист', department_id: 2, department_name: DEPARTMENT.name, staff_number: '0035', staff_numbers: ['0035'], hourly: false },
  { id: 3, name: 'Орлов Павел', position: 'Диспетчер', department_id: null, department_name: null, staff_number: '0054', staff_numbers: ['0054'], hourly: false },
]

export function makeTimesheet(): TimesheetDetails {
  return {
    id: 42,
    department_id: DEPARTMENT.id,
    department_name: DEPARTMENT.name,
    year: 2026,
    month: 11,
    status: 'draft',
    version: 1,
    number: 'Т-24',
    document_date: '2026-11-10',
    kind: 'original',
    period: 'half',
    today: TIMESHEET_DATE,
    employees: [
      { id: 1, last_name: 'Иванов', first_name: 'Алексей', staff_number: '0012', hourly: true },
      { id: 1, last_name: 'Иванов', first_name: 'Алексей', staff_number: '0047', hourly: true },
      { id: 2, last_name: 'Соколова', first_name: 'Мария', staff_number: '0035', hourly: false },
      { id: 3, last_name: 'Орлов', first_name: 'Павел', staff_number: '0054', hourly: false },
    ],
    currentEmployeeIds: [1, 2, 3],
    current_staff_rows: [
      { employee_id: 1, staff_number: '0012' },
      { employee_id: 1, staff_number: '0047' },
      { employee_id: 2, staff_number: '0035' },
      { employee_id: 3, staff_number: '0054' },
    ],
    days: [{ date: '2026-11-09', status: 'approved', revision: 1, employee_ids: [1, 2, 3], reason: null }],
    entries: [
      { employee_id: 1, staff_number: '0012', date: '2026-11-09', code: 'Я', minutes: 480 },
      { employee_id: 1, staff_number: '0047', date: '2026-11-09', code: 'НН' },
      { employee_id: 2, staff_number: '0035', date: TIMESHEET_DATE, code: 'О', is_automatic: true },
      { employee_id: 3, staff_number: '0054', date: '2026-11-09', code: 'Я' },
    ],
    nonWorkingDays: ['2026-11-01', '2026-11-04', '2026-11-07', '2026-11-08', '2026-11-14', '2026-11-15'],
    transfers: [],
  }
}
