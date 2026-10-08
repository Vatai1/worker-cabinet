import { CalendarCheck, CalendarRange, Hourglass, Plane, Repeat, Timer, Users, Wallet } from 'lucide-react'
import { ReportsWorkspace, type ReportDef } from '@/modules/reports/components/ReportsWorkspace'

const REPORTS: ReportDef[] = [
  { id: 'balances', name: 'Остатки', hint: 'Положено, использовано, осталось', yearly: true, icon: Wallet, accent: 'from-blue-500 to-indigo-600' },
  { id: 'plan', name: 'Распределение', hint: 'Нераспределённые дни и часть от 14 дней', yearly: true, icon: CalendarRange, accent: 'from-violet-500 to-purple-600' },
  { id: 'unused', name: 'Неиспользованные', hint: 'Кто давно не был в отпуске', yearly: true, icon: Hourglass, accent: 'from-amber-500 to-orange-600', monthsFilter: true },
  { id: 'overlaps', name: 'Отсутствия', hint: 'Сколько людей в отпуске по неделям', yearly: true, icon: Users, accent: 'from-rose-500 to-pink-600' },
  { id: 'approvals', name: 'Согласование', hint: 'Сколько дней заявления ждали решения', yearly: true, icon: Timer, accent: 'from-cyan-500 to-sky-600' },
  { id: 'changes', name: 'Переносы и отмены', hint: 'Изменённые отпуска с причинами', yearly: true, icon: Repeat, accent: 'from-slate-500 to-gray-600' },
  { id: 'day-offs', name: 'Отгулы', hint: 'Начислено, использовано, остаток', yearly: false, icon: CalendarCheck, accent: 'from-emerald-500 to-teal-600' },
  { id: 'travel', name: 'Проезд', hint: 'Право в текущем двухлетнем периоде', yearly: false, icon: Plane, accent: 'from-sky-500 to-blue-600' },
]

export function HRVacationReports() {
  return <ReportsWorkspace endpoint="/vacation/reports" reports={REPORTS} />
}
