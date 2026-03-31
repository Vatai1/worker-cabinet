export const TIMESHEET_CODES = [
  { code: 'Я',  label: 'Явка' },
  { code: 'ОТ', label: 'Ежегодный отпуск' },
  { code: 'ОС', label: 'Отпуск без сохранения ЗП' },
  { code: 'УО', label: 'Учебный отпуск' },
  { code: 'Б',  label: 'Больничный' },
  { code: 'Т',  label: 'Нетрудоспособность без пособия' },
  { code: 'К',  label: 'Командировка' },
  { code: 'НН', label: 'Неявка (невыясненная причина)' },
  { code: 'В',  label: 'Выходной / праздник' },
  { code: 'ПР', label: 'Прогул' },
  { code: 'ДО', label: 'Дополнительный отпуск' },
  { code: 'ОЖ', label: 'Отпуск по уходу за ребёнком' },
  { code: 'Р',  label: 'Отпуск по беременности и родам' },
  { code: 'ОЗ', label: 'Отпуск (гос. обязанности)' },
  { code: 'УВ', label: 'Сокращённый рабочий день' },
] as const

export type TimesheetCode = typeof TIMESHEET_CODES[number]['code']

export const CODE_COLORS: Record<string, string> = {
  'В':  'bg-gray-100 dark:bg-gray-800',
  'ПР': 'bg-red-100 dark:bg-red-950',
  'НН': 'bg-red-100 dark:bg-red-950',
  'ОТ': 'bg-blue-100 dark:bg-blue-950',
  'Б':  'bg-yellow-100 dark:bg-yellow-950',
}
