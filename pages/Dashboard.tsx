import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { formatDate } from '@/lib/utils'
import {
  Calendar,
  FileText,
  TrendingUp,
} from 'lucide-react'
import { useVacationStore } from '@/store/vacationStore'

export function Dashboard() {
  const { user } = useAuthStore()
  const { notifications } = useUIStore()
  const { balances } = useVacationStore()

  const userBalance = user?.id ? balances[user.id] : undefined
  const availableVacationDays = userBalance?.availableDays ?? 0

  const stats = [
    {
      title: 'Дни отпуска',
      value: availableVacationDays.toString(),
      description: 'доступно',
      icon: Calendar,
      subtext: `${userBalance?.usedDays ?? 0} дней использовано`,
    },
    {
      title: 'Уведомления',
      value: notifications.filter(n => !n.read).length.toString(),
      description: 'непрочитанных',
      icon: FileText,
      subtext: `${notifications.length} всего`,
    },
    {
      title: 'Стаж',
      value: `${calculateWorkExperience(user?.hireDate)}`,
      description: 'в компании',
      icon: TrendingUp,
      subtext: 'с ' + formatDate(user?.hireDate || ''),
    },
  ]

  function calculateWorkExperience(hireDate?: string): string {
    if (!hireDate) return '0'
    const hire = new Date(hireDate)
    const now = new Date()
    const years = now.getFullYear() - hire.getFullYear()
    const months = now.getMonth() - hire.getMonth()

    if (months < 0) {
      return `${years - 1} лет`
    }
    return `${years} лет ${months} мес.`
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome section */}
      <div className="rounded-2xl gradient-primary p-8 text-white shadow-glow">
        <h1 className="text-3xl font-bold tracking-tight">
          Добро пожаловать, {user?.firstName}! 👋
        </h1>
        <p className="mt-2 text-white/90 text-lg">
          Вот обзор вашей информации на сегодня
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          const gradients = [
            'from-purple-500 to-purple-600',
            'from-blue-500 to-blue-600',
            'from-emerald-500 to-emerald-600',
          ]
          return (
            <Card key={stat.title} className="group cursor-pointer overflow-hidden relative hover:scale-105 transition-transform duration-300" style={{ animationDelay: `${index * 100}ms` }}>
              <div className={`absolute inset-0 bg-gradient-to-br ${gradients[index]} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {stat.title}
                </CardTitle>
                <div className={`p-3 rounded-xl bg-gradient-to-br ${gradients[index]} shadow-lg`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <p className="text-sm text-muted-foreground mt-2 font-medium">
                  {stat.description}
                </p>
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60"></span>
                    {stat.subtext}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Последние уведомления</CardTitle>
            <CardDescription>
              Ваши последние уведомления и обновления
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет уведомлений</p>
              ) : (
                notifications.slice(0, 3).map((notification) => (
                  <div key={notification.id} className="flex gap-3">
                    <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      notification.type === 'success' ? 'bg-emerald-500' :
                      notification.type === 'warning' ? 'bg-amber-500' :
                      notification.type === 'error' ? 'bg-destructive' :
                      'bg-primary/40'
                    }`} />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>Быстрые действия</CardTitle>
            <CardDescription>
              Часто выполняемые задачи
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <a
                href="/requests/new"
                className="group flex items-center gap-4 rounded-xl border-2 border-border/50 p-4 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 hover:scale-105"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg group-hover:shadow-xl transition-shadow">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">Создать заявление</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Подать заявление на отпуск или больничный
                  </p>
                </div>
                <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              <a
                href="/documents"
                className="group flex items-center gap-4 rounded-xl border-2 border-border/50 p-4 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 hover:scale-105"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg group-hover:shadow-xl transition-shadow">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">Мои документы</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Доступ к трудовым документам
                  </p>
                </div>
                <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Ближайшие события</CardTitle>
          <CardDescription>
            Ваши ближайшие рабочие дни и события
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Ближайшие события будут отображаться здесь</p>
        </CardContent>
      </Card>
    </div>
  )
}
