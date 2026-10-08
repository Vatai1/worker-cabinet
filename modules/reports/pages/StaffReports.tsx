import { Activity, Briefcase, Clock, Network, UserPlus, Users } from 'lucide-react'
import { ReportsWorkspace, type ReportDef } from '@/modules/reports/components/ReportsWorkspace'

const REPORTS: ReportDef[] = [
  { id: 'headcount', name: 'Численность', hint: 'Сотрудники по отделам и руководители', yearly: true, icon: Users, accent: 'from-blue-500 to-indigo-600' },
  { id: 'hires', name: 'Приём на работу', hint: 'Кто принят за год, по месяцам', yearly: true, icon: UserPlus, accent: 'from-emerald-500 to-teal-600' },
  { id: 'tenure', name: 'Стаж', hint: 'Сколько сотрудники работают в организации', yearly: false, icon: Clock, accent: 'from-violet-500 to-purple-600' },
  { id: 'positions', name: 'Должности', hint: 'Самые массовые и единичные должности', yearly: false, icon: Briefcase, accent: 'from-amber-500 to-orange-600' },
  { id: 'structure', name: 'Структура', hint: 'Отделы без руководителя и без сотрудников', yearly: false, icon: Network, accent: 'from-slate-500 to-gray-600' },
  { id: 'activity', name: 'Активность', hint: 'Кто давно не заходил в систему', yearly: false, icon: Activity, accent: 'from-rose-500 to-pink-600' },
]

export function StaffReports() {
  return <ReportsWorkspace endpoint="/users/reports" reports={REPORTS} />
}
