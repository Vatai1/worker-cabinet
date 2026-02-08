import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { mockSalaries } from '@/data/mockData'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Calendar,
  DollarSign,
  FileText,
  TrendingUp,
  Users,
  Clock,
} from 'lucide-react'

export function Dashboard() {
  const { user } = useAuthStore()
  const { notifications } = useUIStore()

  const latestSalary = mockSalaries[0]
  const pendingRequests = 1 // Mock data

  const stats = [
    {
      title: 'Зарплата',
      value: formatCurrency(latestSalary.total),
      description: `за ${new Date(latestSalary.period + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`,
      icon: DollarSign,
      trend: '+10% по сравнению с прошлым месяцем',
      trendUp: true,
    },
    {
      title: 'Дни отпуска',
      value: '14',
      description: 'доступно',
      icon: Calendar,
      trend: '3 дня использовано в этом году',
      trendUp: true,
    },
    {
      title: 'Заявления',
      value: pendingRequests.toString(),
      description: 'на рассмотрении',
      icon: FileText,
      trend: '1 одобрено, 0 отклонено',
      trendUp: true,
    },
    {
      title: 'Стаж',
      value: `${calculateWorkExperience(user?.hireDate)}`,
      description: 'в компании',
      icon: TrendingUp,
      trend: 'с ' + formatDate(user?.hireDate || ''),
      trendUp: true,
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
    <div className="space-y-6">
      {/* Welcome section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Добро пожаловать, {user?.firstName}!
        </h1>
        <p className="text-muted-foreground">
          Вот обзор вашей информации на сегодня
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
                <div className="mt-2 flex items-center text-xs">
                  {stat.trendUp && <TrendingUp className="mr-1 h-3 w-3 text-green-500" />}
                  <span className={stat.trendUp ? 'text-green-500' : 'text-red-500'}>
                    {stat.trend}
                  </span>
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
              {notifications.slice(0, 3).map((notification) => (
                <div key={notification.id} className="flex gap-3">
                  <div className={`mt-0.5 h-2 w-2 rounded-full ${
                    notification.type === 'success' ? 'bg-green-500' :
                    notification.type === 'warning' ? 'bg-yellow-500' :
                    notification.type === 'error' ? 'bg-red-500' :
                    'bg-blue-500'
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
              ))}
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
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Создать заявление</p>
                  <p className="text-sm text-muted-foreground">
                    Подать заявление на отпуск или больничный
                  </p>
                </div>
              </a>
              <a
                href="/schedule"
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Просмотреть график</p>
                  <p className="text-sm text-muted-foreground">
                    Посмотреть расписание на ближайшие дни
                  </p>
                </div>
              </a>
              <a
                href="/documents"
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Мои документы</p>
                  <p className="text-sm text-muted-foreground">
                    Доступ к трудовым документам
                  </p>
                </div>
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
          <div className="space-y-3">
            {[
              { date: 'Завтра', time: '09:00 - 18:00', title: 'Рабочий день', type: 'work' },
              { date: '15 января', time: '09:00 - 18:00', title: 'Начало отпуска', type: 'vacation' },
              { date: '20 января', time: '10:00', title: 'Встреча с командой', type: 'meeting' },
            ].map((event, i) => (
              <div key={i} className="flex items-center gap-4 rounded-lg border p-3">
                <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {event.date} • {event.time}
                  </p>
                </div>
                <Badge variant={
                  event.type === 'vacation' ? 'success' :
                  event.type === 'meeting' ? 'warning' :
                  'default'
                }>
                  {event.type === 'vacation' ? 'Отпуск' :
                   event.type === 'meeting' ? 'Встреча' : 'Работа'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
