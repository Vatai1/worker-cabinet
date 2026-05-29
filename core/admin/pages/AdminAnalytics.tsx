import { useState, useEffect } from 'react'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Badge } from '@/shared/components/ui/Badge'
import { BarChart3, Loader2 } from 'lucide-react'

const ACTION_LABELS: Record<string, string> = {
  role_create: 'Создание роли',
  role_update: 'Обновление роли',
  role_delete: 'Удаление роли',
  user_role_change: 'Смена роли',
  user_status_change: 'Смена статуса',
  user_password_reset: 'Сброс пароля',
  user_update: 'Обновление пользователя',
  settings_update: 'Обновление настроек',
  bulk_status_change: 'Массовая смена статуса',
  bulk_role_change: 'Массовая смена роли',
  account_unlock: 'Разблокировка аккаунта',
  login: 'Вход в систему',
  module_toggle: 'Переключение модуля',
}

export function AnalyticsTab() {
  const [data, setData] = useState<{
    activityByDay: { date: string; count: string }[]
    activityByType: { action: string; count: string }[]
    topUsers: { user_name: string; count: string }[]
    newUsersByMonth: { month: string; count: string }[]
    vacationByMonth: { month: string; count: string }[]
    departmentSize: { name: string; count: string }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => { fetchData() }, [days])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/analytics/activity?days=${days}`, { headers: getAuthHeaders() })
      if (res.ok) setData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!data) return null

  const maxDayCount = Math.max(...data.activityByDay.map(d => parseInt(d.count)), 1)
  const maxDeptCount = Math.max(...data.departmentSize.map(d => parseInt(d.count)), 1)
  const maxTypeCount = Math.max(...data.activityByType.map(d => parseInt(d.count)), 1)
  const chartColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#84cc16']

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
             <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Аналитика</h1>
            <p className="text-sm text-muted-foreground">Графики и статистика системы</p>
          </div>
          <div className="ml-auto">
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm">
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
              <option value={365}>Год</option>
            </select>
          </div>
        </div>
      </div>

      <div className="page-grid grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="section-card stagger-1">
          <CardHeader><CardTitle className="text-base">Активность по дням</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-40">
              {data.activityByDay.slice(-30).map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <span className="absolute -top-6 text-[10px] bg-popover border border-border px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {d.count} — {d.date}
                  </span>
                  <div
                    className="w-full bg-primary/70 rounded-t transition-all group-hover:bg-primary"
                    style={{ height: `${(parseInt(d.count) / maxDayCount) * 100}%`, minHeight: parseInt(d.count) > 0 ? 4 : 0 }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="section-card stagger-2">
          <CardHeader><CardTitle className="text-base">Размер отделов</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.departmentSize.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="text-sm w-32 truncate" title={d.name}>{d.name || 'Без отдела'}</span>
                <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(parseInt(d.count) / maxDeptCount) * 100}%`, backgroundColor: chartColors[i % chartColors.length] }} />
                </div>
                <span className="text-sm font-medium w-8 text-right">{d.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="section-card stagger-3">
          <CardHeader><CardTitle className="text-base">Типы действий</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.activityByType.map((d, i) => (
              <div key={d.action} className="flex items-center gap-3">
                <span className="text-sm flex-1">{ACTION_LABELS[d.action] || d.action}</span>
                <div className="w-32 h-5 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(parseInt(d.count) / maxTypeCount) * 100}%`, backgroundColor: chartColors[i % chartColors.length] }} />
                </div>
                <span className="text-sm font-medium w-8 text-right">{d.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="section-card stagger-4">
          <CardHeader><CardTitle className="text-base">Самые активные пользователи</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.topUsers.map((d, i) => (
              <div key={d.user_name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {i + 1}
                </div>
                <span className="text-sm flex-1 font-medium">{d.user_name}</span>
                <Badge className="text-[10px]">{d.count} действий</Badge>
              </div>
            ))}
            {data.topUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>}
          </CardContent>
        </Card>

        <Card className="section-card stagger-5">
          <CardHeader><CardTitle className="text-base">Новые пользователи по месяцам</CardTitle></CardHeader>
          <CardContent>
            {data.newUsersByMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {data.newUsersByMonth.map((d) => {
                  const maxVal = Math.max(...data.newUsersByMonth.map(x => parseInt(x.count)), 1)
                  return (
                    <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <span className="absolute -top-6 text-[10px] bg-popover border border-border px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        {d.count}
                      </span>
                      <div className="w-full bg-emerald-500 rounded-t" style={{ height: `${(parseInt(d.count) / maxVal) * 100}%`, minHeight: parseInt(d.count) > 0 ? 4 : 0 }} />
                      <span className="text-[9px] text-muted-foreground">{new Date(d.month).toLocaleDateString('ru-RU', { month: 'short' })}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="section-card stagger-6">
          <CardHeader><CardTitle className="text-base">Заявления на отпуск по месяцам</CardTitle></CardHeader>
          <CardContent>
            {data.vacationByMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {data.vacationByMonth.map((d) => {
                  const maxVal = Math.max(...data.vacationByMonth.map(x => parseInt(x.count)), 1)
                  return (
                    <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <span className="absolute -top-6 text-[10px] bg-popover border border-border px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        {d.count}
                      </span>
                      <div className="w-full bg-amber-500 rounded-t" style={{ height: `${(parseInt(d.count) / maxVal) * 100}%`, minHeight: parseInt(d.count) > 0 ? 4 : 0 }} />
                      <span className="text-[9px] text-muted-foreground">{new Date(d.month).toLocaleDateString('ru-RU', { month: 'short' })}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
