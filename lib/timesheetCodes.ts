export const TIMESHEET_CODES = [
  { code: 'Я',  label: 'Явка' },
  { code: 'ОТ', label: 'Ежегодный отпуск' },
  { code: 'ОС', label: 'Отпуск без сохранения ЗП' },
  { code: 'ДО', label: 'Дополнительный отпуск' },
  { code: 'К',  label: 'Командировка' },
  { code: 'Б',  label: 'Больничный' },
] as const

export type TimesheetCode = typeof TIMESHEET_CODES[number]['code']

export const CODE_COLORS: Record<string, string> = {
  'Я':  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'ОТ': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'ОС': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'ДО': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'К':  'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  'Б':  'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  'В':  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}
