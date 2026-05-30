import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import {
  FileText,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  CalendarCheck,
  Shield,
} from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useRequestsStore } from '@/modules/requests/store/requestsStore'
import { formatDate } from '@/shared/lib/utils'

export function LeaderDashboard() {
  const { user } = useAuthStore()
  const { requests } = useRequestsStore()

  const subordinateRequests = user?.subordinates
    ? requests.filter((r) => user.subordinates!.includes(r.userId))
    : []

  const pendingRequests = subordinateRequests.filter((r) => r.status === 'pending')
  const approvedRequests = subordinateRequests.filter((r) => r.status === 'approved')
  const rejectedRequests = subordinateRequests.filter((r) => r.status === 'rejected')

  const totalSubordinates = user?.subordinates?.length || 0

  const calculateVacationRate = () => {
    if (totalSubordinates === 0) return '0%'
    const onVacation = subordinateRequests.filter((r) => {
      const now = new Date()
      const start = new Date(r.startDate)
      const end = new Date(r.endDate)
      return r.status === 'approved' && now >= start && now <= end
    }).length
    return `${Math.round((onVacation / totalSubordinates) * 100)}%`
  }

  const stats = [
    {
      title: 'Сотрудники',
      value: totalSubordinates.toString(),
      description: 'в подразделении',
      icon: Users,
      subtext: `${calculateVacationRate()} в отпуске`,
    },
    {
      title: 'На рассмотрении',
      value: pendingRequests.length.toString(),
      description: 'заявок',
      icon: Clock,
      subtext: `всего ${subordinateRequests.length} заявок`,
    },
    {
      title: 'Одобрено',
      value: approvedRequests.length.toString(),
      description: 'заявок',
      icon: CheckCircle,
      subtext: `${rejectedRequests.length} отклонено`,
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

  const getEmployeeName = (userId: string) => {
    const employees: Record<string, { firstName: string; lastName: string }> = {
      '1': { firstName: 'Иван', lastName: 'Иванов' },
      '2': { firstName: 'Сидор', lastName: 'Сидоров' },
      '3': { firstName: 'Анна', lastName: 'Иванова' },
      '4': { firstName: 'Мария', lastName: 'Петрова' },
    }
    const emp = employees[userId]
    return emp ? `${emp.firstName} ${emp.lastName}` : `Сотрудник #${userId}`
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-white/3 rounded-full blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-5 w-5 text-white/70" />
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Лидер</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Панель лидера</h1>
          <p className="mt-2 text-white/50 text-sm">Рассмотреть заявки, календарь отпусков, документы</p>
        </div>
      </div>

      <div className="page-grid">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'
          return (
            <Card key={stat.title} className={`section-card hover-lift ${staggerClass}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {stat.title}
                </CardTitle>
                <div className="p-3 rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
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

      <div className="page-grid">
        <Card className="section-card stagger-1">
          <CardHeader>
            <CardTitle>Требуют рассмотрения</CardTitle>
            <CardDescription>
              Заявки от сотрудников, ожидающие решения
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет заявок на рассмотрении</p>
              ) : (
                pendingRequests.slice(0, 3).map((request) => (
                  <div key={request.id} className="flex gap-3">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"></div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {getEmployeeName(request.userId)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {request.type === 'vacation' ? 'Отпуск' :
                         request.type === 'sick_leave' ? 'Больничный' :
                         request.type === 'remote_work' ? 'Удаленная работа' :
                         request.type === 'business_trip' ? 'Командировка' : 'Другое'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(request.startDate)} - {formatDate(request.endDate)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {pendingRequests.length > 3 && (
              <Button
                variant="link"
                className="mt-4 w-full"
                onClick={() => (window.location.href = '/manager')}
              >
                Показать все ({pendingRequests.length})
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="section-card stagger-2">
          <CardHeader>
            <CardTitle>Быстрые действия</CardTitle>
            <CardDescription>
              Часто выполняемые задачи
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <a
                href="/manager"
                className="interactive group flex items-center gap-4 rounded-xl border border-border/60 p-4 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">Рассмотреть заявки</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pendingRequests.length} заявок на рассмотрении
                  </p>
                </div>
                <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              <a
                href="/vacation"
                className="interactive group flex items-center gap-4 rounded-xl border border-border/60 p-4 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <CalendarCheck className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">Календарь отпусков</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Просмотр графика отпусков команды
                  </p>
                </div>
                <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              <a
                href="/documents"
                className="interactive group flex items-center gap-4 rounded-xl border border-border/60 p-4 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">Документы</p>
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

      <Card className="section-card stagger-3">
        <CardHeader>
          <CardTitle>Статус отпусков команды</CardTitle>
          <CardDescription>
            Текущий статус отпусков сотрудников подразделения
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {user?.subordinates?.slice(0, 5).map((subordinateId) => {
              const subordinateRequestsList = subordinateRequests.filter(
                (r) => r.userId === subordinateId
              )
              const approvedVacations = subordinateRequestsList.filter(
                (r) => r.status === 'approved' && r.type === 'vacation'
              )
              const now = new Date()
              const onVacation = approvedVacations.some((r) => {
                const start = new Date(r.startDate)
                const end = new Date(r.endDate)
                return now >= start && now <= end
              })

              return (
                <div
                  key={subordinateId}
                  className="flex items-center justify-between p-4 rounded-xl border border-border/60 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      onVacation
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-muted/50 text-muted-foreground'
                    }`}>
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{getEmployeeName(subordinateId)}</p>
                      <p className="text-xs text-muted-foreground">
                        {onVacation ? 'В отпуске' : 'На работе'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{approvedVacations.length} отпусков</p>
                    <p className="text-xs text-muted-foreground">
                      всего
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
