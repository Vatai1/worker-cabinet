import { useAuthStore } from '@/core/auth/store/authStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Badge } from '@/shared/components/ui/Badge'
import { formatDate } from '@/shared/lib/utils'
import { Calendar, FileText, TrendingUp, ArrowRight, Sparkles, Clock, Zap } from 'lucide-react'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'

export function Dashboard() {
  const { user } = useAuthStore()
  const { balances } = useVacationStore()
  const userBalance = user?.id ? balances[user.id] : undefined
  const availableVacationDays = userBalance?.availableDays ?? 0

  const stats = [
    { title: 'Дни отпуска', value: availableVacationDays.toString(), description: 'доступно', icon: Calendar, subtext: `${userBalance?.usedDays ?? 0} использовано`, gradient: 'from-blue-500 to-indigo-600', iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    { title: 'Стаж работы', value: calculateWorkExperience(user?.hireDate), description: 'в компании', icon: TrendingUp, subtext: 'с ' + formatDate(user?.hireDate || ''), gradient: 'from-violet-500 to-purple-600', iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  ]

  function calculateWorkExperience(hireDate?: string): string {
    if (!hireDate) return '0'
    const hire = new Date(hireDate)
    const now = new Date()
    const years = now.getFullYear() - hire.getFullYear()
    const months = now.getMonth() - hire.getMonth()
    if (months < 0) return `${years - 1} лет`
    return `${years} лет ${months} мес.`
  }

  const quickActions = [
    { href: '/requests/new', title: 'Создать заявление', desc: 'Подать заявление на отпуск или больничный', icon: FileText, bg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
    { href: '/documents', title: 'Мои документы', desc: 'Доступ к трудовым документам', icon: FileText, bg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  ]

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 lg:p-10 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-80 h-80 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-card/3 rounded-full blur-2xl" />
        <div className="absolute top-[20%] right-[15%] w-3 h-3 rounded-full bg-card/20 animate-float" />
        <div className="absolute bottom-[25%] right-[30%] w-2 h-2 rounded-full bg-card/15 animate-float stagger-3" />
        <div className="absolute top-[60%] right-[60%] w-2.5 h-2.5 rounded-full bg-card/10 animate-float stagger-5" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-white/70" />
            <Badge className="bg-card/12 text-white border-white/15 text-xs backdrop-blur-sm">Добро пожаловать</Badge>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight">Привет, {user?.firstName}!</h1>
          <p className="mt-3 text-white/45 text-sm lg:text-base max-w-md">Вот обзор вашей информации на {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 page-grid">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className={`hover-lift group animate-slide-up stagger-${i + 1}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{stat.title}</p>
                    <p className="text-4xl font-extrabold tracking-tight">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.iconBg} transition-transform duration-200 group-hover:scale-110`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-border/40">
                  <p className="text-xs text-muted-foreground/70">{stat.description} · {stat.subtext}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 page-grid">
        <Card className="animate-slide-up stagger-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Быстрые действия
            </CardTitle>
            <CardDescription>Часто выполняемые задачи</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <a key={action.href} href={action.href} className="group flex items-center gap-3.5 rounded-xl border border-border/50 p-4 hover:bg-primary/3 hover:border-primary/15 transition-all duration-200 interactive">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.bg} shrink-0 transition-transform duration-200 group-hover:scale-105`}>
                    <Icon className={`h-5 w-5 ${action.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">{action.title}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{action.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                </a>
              )
            })}
          </CardContent>
        </Card>

        <Card className="animate-slide-up stagger-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Ближайшие события
            </CardTitle>
            <CardDescription>Ваши ближайшие рабочие дни и события</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                <Calendar className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground/70">Ближайшие события будут отображаться здесь</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
