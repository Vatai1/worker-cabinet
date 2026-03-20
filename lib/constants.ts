export const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
]

export function getAvatarColor(id: string): string {
  const n = parseInt(id, 10) || 0
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

export const PROJECT_STATUS_CONFIG = {
  active: { label: 'Активный', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  completed: { label: 'Завершён', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  paused: { label: 'На паузе', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  planning: { label: 'Планирование', color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-950/30' },
  on_hold: { label: 'Приостановлен', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  cancelled: { label: 'Отменён', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
}

export const USER_STATUS_CONFIG = {
  active: { label: 'Активен', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  inactive: { label: 'Неактивен', color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-950/30' },
  on_leave: { label: 'В отпуске', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
}

export const TASK_PRIORITY_CONFIG = {
  low: { label: 'Низкий', color: '#22c55e', bg: 'bg-green-100 text-green-700' },
  medium: { label: 'Средний', color: '#f59e0b', bg: 'bg-amber-100 text-amber-700' },
  high: { label: 'Высокий', color: '#ef4444', bg: 'bg-red-100 text-red-700' },
}

export const TASK_STATUS_CONFIG = {
  pending: { label: 'Ожидает', color: 'text-slate-600', bg: 'bg-slate-50', icon: 'Circle' },
  in_progress: { label: 'В работе', color: 'text-blue-600', bg: 'bg-blue-50', icon: 'Clock' },
  completed: { label: 'Завершена', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'CheckCircle2' },
}
