import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Badge } from '@/shared/components/ui/Badge'
import { formatDate, formatDateTime, cn } from '@/shared/lib/utils'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import { hasAnyRole } from '@/shared/lib/permissions'
import { surveyApi } from '@/modules/surveys/services/surveyApi'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { VacationRequestStatus, VACATION_TYPES } from '@/shared/types'
import type { Survey } from '@/shared/types'
import {
  Calendar, FileText, TrendingUp, ArrowRight, Sparkles, Clock, Zap, Bell, Plane,
  ClipboardList, Building2, Users, UserCheck, FolderKanban, Activity, UserPlus, Send,
} from 'lucide-react'

interface NotificationPreview {
  id: number
  type: string
  data: Record<string, unknown>
  status: string
  sent_at: string | null
  created_at: string
  read_at?: string | null
}

const NOTIF_TYPE_LABELS: Record<string, string> = {
  vacation_created: 'Заявка на отпуск',
  vacation_status_changed: 'Статус отпуска',
  document_assigned: 'Документ для ознакомления',
  survey_assigned: 'Новый опрос',
  onboarding_task: 'Задача онбординга',
  mailing: 'Рассылка',
  generic: 'Уведомление',
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

function calculateWorkExperience(hireDate?: string): string {
  if (!hireDate) return '0'
  const hire = new Date(hireDate)
  const now = new Date()
  const years = now.getFullYear() - hire.getFullYear()
  const months = now.getMonth() - hire.getMonth()
  if (months < 0) return `${years - 1} лет`
  return `${years} лет ${months} мес.`
}

export function Dashboard() {
  const { user } = useAuthStore()
  const { balances, currentUserRequests, fetchBalance, fetchUserRequests } = useVacationStore()
  const { isModuleEnabled } = useModulesStore()
  const { departments, fetchDepartments } = useDepartmentsStore()

  const isHR = hasAnyRole('hr', 'admin')
  const vacationEnabled = isModuleEnabled('vacation')
  const surveysEnabled = isModuleEnabled('surveys')
  const notificationsEnabled = isModuleEnabled('notifications')
  const onboardingEnabled = isModuleEnabled('onboarding')

  const userBalance = user?.id ? balances[user.id] : undefined
  const availableVacationDays = userBalance?.availableDays ?? 0
  const usedVacationDays = userBalance?.usedDays ?? 0
  const totalVacationDays = userBalance?.totalDays ?? 0
  const vacationProgress = totalVacationDays > 0 ? Math.min(100, Math.round((usedVacationDays / totalVacationDays) * 100)) : 0

  const [surveys, setSurveys] = useState<(Survey & { responded: boolean })[]>([])
  const [surveysLoading, setSurveysLoading] = useState(true)
  const [notifications, setNotifications] = useState<NotificationPreview[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifLoading, setNotifLoading] = useState(true)
  const [orgPulse, setOrgPulse] = useState<{ pendingApprovals: number; onboardingActive: number; employeeCount: number } | null>(null)
  const [orgPulseLoading, setOrgPulseLoading] = useState(false)

  useEffect(() => {
    if (user?.id && vacationEnabled) {
      const year = new Date().getFullYear()
      fetchBalance(user.id, year).catch(() => {})
      fetchUserRequests(user.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, vacationEnabled])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  useEffect(() => {
    if (!surveysEnabled) { setSurveysLoading(false); return }
    setSurveysLoading(true)
    surveyApi.listMy()
      .then(setSurveys)
      .catch(() => setSurveys([]))
      .finally(() => setSurveysLoading(false))
  }, [surveysEnabled])

  useEffect(() => {
    if (!notificationsEnabled) { setNotifLoading(false); return }
    setNotifLoading(true)
    Promise.all([
      fetch(`${API_BASE_URL}/notifications/my?page=1&limit=4`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : { notifications: [] })),
      fetch(`${API_BASE_URL}/notifications/my/unread-count`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : { count: 0 })),
    ])
      .then(([list, count]) => {
        setNotifications(list.notifications ?? [])
        setUnreadCount(count.count ?? 0)
      })
      .catch(() => {})
      .finally(() => setNotifLoading(false))
  }, [notificationsEnabled])

  useEffect(() => {
    if (!isHR) return
    setOrgPulseLoading(true)
    Promise.all([
      vacationEnabled ? vacationApi.getAllRequests({ status: 'on_approval' }) : Promise.resolve([]),
      onboardingEnabled
        ? fetch(`${API_BASE_URL}/onboarding`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : []))
        : Promise.resolve([]),
      fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([pending, onboarding, employees]) => {
        setOrgPulse({
          pendingApprovals: pending.length,
          onboardingActive: onboarding.filter((o: { completed_at: string | null }) => !o.completed_at).length,
          employeeCount: employees.length,
        })
      })
      .catch(() => {})
      .finally(() => setOrgPulseLoading(false))
  }, [isHR, vacationEnabled, onboardingEnabled])

  const upcomingVacation = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return [...currentUserRequests]
      .filter((r) =>
        (r.status === VacationRequestStatus.ON_APPROVAL || r.status === VacationRequestStatus.APPROVED) &&
        new Date(r.startDate) >= today
      )
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0]
  }, [currentUserRequests])

  const pendingSurveys = useMemo(() => surveys.filter((s) => !s.responded), [surveys])
  const myDepartment = useMemo(() => departments.find((d) => String(d.id) === user?.departmentId), [departments, user?.departmentId])

  const stats = [
    { title: 'Стаж работы', value: calculateWorkExperience(user?.hireDate), description: 'в компании', icon: TrendingUp, subtext: 'с ' + formatDate(user?.hireDate || ''), iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  ]

  const quickActions = [
    { key: 'requests', href: '/requests?create=true', title: 'Создать заявление', desc: 'Отпуск, больничный и другое', icon: FileText, bg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', enabled: true },
    { key: 'vacation', href: '/vacation', title: 'Отпуск', desc: 'Баланс, календарь, заявки', icon: Plane, bg: 'bg-sky-500/10', iconColor: 'text-sky-600 dark:text-sky-400', enabled: vacationEnabled },
    { key: 'surveys', href: '/surveys', title: 'Опросы', desc: 'Пройти доступные опросы', icon: ClipboardList, bg: 'bg-purple-500/10', iconColor: 'text-purple-600 dark:text-purple-400', enabled: surveysEnabled },
    { key: 'documents', href: '/documents', title: 'Мои документы', desc: 'Доступ к трудовым документам', icon: FileText, bg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', enabled: isModuleEnabled('documents') },
    { key: 'projects', href: '/projects', title: 'Проекты', desc: 'Ваши текущие проекты', icon: FolderKanban, bg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', enabled: isModuleEnabled('projects') },
    { key: 'onboarding', href: '/hr?tab=onboarding', title: 'Онбординг', desc: 'Адаптация новых работников', icon: UserPlus, bg: 'bg-teal-500/10', iconColor: 'text-teal-600 dark:text-teal-400', enabled: isHR && onboardingEnabled },
    { key: 'mailing', href: '/hr?tab=mailing', title: 'Рассылка', desc: 'Отправить письмо работникам', icon: Send, bg: 'bg-pink-500/10', iconColor: 'text-pink-600 dark:text-pink-400', enabled: isHR && isModuleEnabled('mailing') },
  ].filter((a) => a.enabled)

  const pulseStats = [
    vacationEnabled && orgPulse ? { key: 'pending', href: '/hr?tab=vacation', label: 'Заявок на согласовании', value: orgPulse.pendingApprovals, icon: Plane, className: 'text-amber-600 bg-amber-500/15' } : null,
    onboardingEnabled && orgPulse ? { key: 'onboarding', href: '/hr?tab=onboarding', label: 'В процессе онбординга', value: orgPulse.onboardingActive, icon: UserPlus, className: 'text-teal-600 bg-teal-500/15' } : null,
    orgPulse ? { key: 'employees', href: '/employees', label: 'Всего работников', value: orgPulse.employeeCount, icon: Users, className: 'text-blue-600 bg-blue-500/15' } : null,
  ].filter((s): s is { key: string; href: string; label: string; value: number; icon: typeof Plane; className: string } => s !== null)

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
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight">{getGreeting()}, {user?.firstName}!</h1>
          <p className="mt-3 text-white/45 text-sm lg:text-base max-w-md">
            Вот обзор вашей информации на {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {isHR && (
        <Card className="overflow-hidden p-0 animate-slide-up stagger-1">
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Пульс организации</h2>
              <p className="text-xs text-muted-foreground">Ключевые показатели прямо сейчас</p>
            </div>
          </div>
          {orgPulseLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className={cn('grid divide-y divide-border sm:divide-y-0 sm:divide-x', pulseStats.length === 3 ? 'sm:grid-cols-3' : pulseStats.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
              {pulseStats.map((s) => {
                const Icon = s.icon
                return (
                  <Link key={s.key} to={s.href} className="flex items-center gap-3 p-5 transition-colors hover:bg-muted/30">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.className)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xl font-bold tracking-tight">{s.value}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>
      )}

      <div className={cn('grid gap-4 page-grid', vacationEnabled ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
        {vacationEnabled && (
          <Card className="hover-lift group animate-slide-up stagger-1">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Дни отпуска</p>
                  <p className="text-4xl font-extrabold tracking-tight">{availableVacationDays}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-transform duration-200 group-hover:scale-110">
                  <Calendar className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all" style={{ width: `${vacationProgress}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground/70">Использовано {usedVacationDays} из {totalVacationDays}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className={`hover-lift group animate-slide-up stagger-${i + 2}`}>
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

      <div className="grid gap-4 lg:grid-cols-2 page-grid">
        {vacationEnabled && (
          <Card className="overflow-hidden p-0 animate-slide-up stagger-3">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-tight">Ближайшее событие</h2>
                <p className="text-xs text-muted-foreground">Ваш ближайший отпуск</p>
              </div>
            </div>
            <div className="p-5">
              {upcomingVacation ? (
                <Link to="/vacation" className="flex items-center gap-4 group">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Plane className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {VACATION_TYPES[upcomingVacation.vacationType]?.name ?? 'Отпуск'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(upcomingVacation.startDate)} — {formatDate(upcomingVacation.endDate)} · {upcomingVacation.duration} дн.
                    </p>
                    <Badge variant={upcomingVacation.status === VacationRequestStatus.APPROVED ? 'success' : 'warning'} className="mt-2">
                      {upcomingVacation.status === VacationRequestStatus.APPROVED ? 'Согласовано' : 'На согласовании'}
                    </Badge>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                </Link>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-8 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">Нет предстоящих отпусков</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {notificationsEnabled && (
          <Card className="overflow-hidden p-0 animate-slide-up stagger-4">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-tight">Уведомления</h2>
                <p className="text-xs text-muted-foreground">{unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Все прочитаны'}</p>
              </div>
              {unreadCount > 0 && (
                <span className="inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full bg-amber-500/15 px-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="p-5">
              {notifLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">Нет уведомлений</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {notifications.map((n) => {
                    const data = n.data || {}
                    const label = NOTIF_TYPE_LABELS[n.type] || n.type
                    const title = n.type === 'mailing' ? (data.title as string) : (data.subject as string) || label
                    return (
                      <div key={n.id} className="flex items-center gap-3">
                        {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                        <p className={cn('min-w-0 flex-1 truncate text-sm', n.read_at ? 'text-muted-foreground' : 'font-medium')}>{title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground/70">{formatDateTime(n.sent_at || n.created_at)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border px-5 py-3">
              <Link to="/notifications" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Все уведомления <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 page-grid">
        {surveysEnabled && (
          <Card className="overflow-hidden p-0 animate-slide-up stagger-5">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-tight">Опросы</h2>
                <p className="text-xs text-muted-foreground">{pendingSurveys.length > 0 ? `${pendingSurveys.length} без ответа` : 'Всё пройдено'}</p>
              </div>
            </div>
            <div className="p-5">
              {surveysLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : pendingSurveys.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-8 text-center">
                  <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">Нет опросов, требующих ответа</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingSurveys.slice(0, 4).map((s) => (
                    <Link key={s.id} to="/surveys" className="flex items-center gap-3 group">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                        <ClipboardList className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium group-hover:text-primary transition-colors">{s.title}</p>
                        {s.deadline && <p className="text-xs text-muted-foreground">До {formatDate(s.deadline)}</p>}
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        <Card className="overflow-hidden p-0 animate-slide-up stagger-6">
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">Мой отдел</h2>
          </div>
          <div className="p-5">
            {myDepartment ? (
              <div className="space-y-3">
                <p className="text-lg font-semibold">{myDepartment.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <UserCheck className="h-4 w-4 shrink-0" />
                  Руководитель: {myDepartment.manager_name || '—'}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4 shrink-0" />
                  Работников: {myDepartment.employee_count ?? '—'}
                </div>
                <Link to={`/departments/${myDepartment.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Перейти к отделу <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-8 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Отдел не назначен</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="animate-slide-up stagger-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Быстрые действия
          </CardTitle>
          <CardDescription>Часто выполняемые задачи</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link key={action.key} to={action.href} className="group flex items-center gap-3.5 rounded-xl border border-border/50 p-4 hover:bg-primary/3 hover:border-primary/15 transition-all duration-200 interactive">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.bg} shrink-0 transition-transform duration-200 group-hover:scale-105`}>
                    <Icon className={`h-5 w-5 ${action.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">{action.title}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{action.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
