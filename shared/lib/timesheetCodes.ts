export const TIMESHEET_CODES = [
  { code: 'Я',  label: 'Явка' },
  { code: 'ОТ', label: 'Ежегодный основной оплачиваемый отпуск' },
  { code: 'ОД', label: 'Ежегодный дополнительный оплачиваемый отпуск' },
  { code: 'У',  label: 'Учебный отпуск' },
  { code: 'Р',  label: 'Отпуск по беременности и родам' },
  { code: 'ОЖ', label: 'Отпуск по уходу за ребёнком' },
  { code: 'ДО', label: 'Отпуск без сохранения ЗП с разрешения работодателя' },
  { code: 'ОЗ', label: 'Отпуск без сохранения ЗП в случаях, предусмотренных законом' },
  { code: 'НВ', label: 'Отгул (день отдыха)' },
  { code: 'К',  label: 'Командировка' },
  { code: 'Б',  label: 'Больничный' },
] as const

export const VACATION_CODES: string[] = ['ОТ', 'ОД', 'У', 'Р', 'ОЖ', 'ДО', 'ОЗ', 'НВ']

export const CODE_COLORS: Record<string, string> = {
  'Я':  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'ОТ': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'ОД': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'У':  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  'Р':  'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  'ОЖ': 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  'ОЗ': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'ДО': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'НВ': 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  'К':  'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  'Б':  'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  'В':  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}
