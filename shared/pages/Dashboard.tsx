import { Sparkles, Plane, ClipboardList, FolderKanban, Calendar, Network, Send, UserPlus, Users, Building2 } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { Card } from '@/shared/components/ui/Card'
import { PageBanner } from '@/shared/components/PageBanner'

interface Feature {
  module: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}

const FEATURES: Feature[] = [
  { module: 'vacation', icon: Plane, title: 'Отпуска', desc: 'Календарь, баланс дней, заявления и согласования' },
  { module: 'core', icon: Users, title: 'Работники', desc: 'Профили, отделы и оргструктура компании' },
  { module: 'projects', icon: FolderKanban, title: 'Проекты', desc: 'Проекты компании и ваши задачи в них' },
  { module: 'surveys', icon: ClipboardList, title: 'Опросы', desc: 'Опросы от HR и аналитика ответов' },
  { module: 'timesheet', icon: Calendar, title: 'Табель', desc: 'Учёт рабочего времени по форме Т-13' },
  { module: 'hierarchy', icon: Network, title: 'Иерархия', desc: 'Организационная структура компании' },
  { module: 'onboarding', icon: UserPlus, title: 'Онбординг', desc: 'Адаптация новых работников' },
  { module: 'mailing', icon: Send, title: 'Рассылки', desc: 'Уведомления и рассылки от HR' },
]

export function Dashboard() {
  const { user } = useAuthStore()
  const enabledModules = useModulesStore((s) => s.enabledModules)
  const badges = useModulesStore((s) => s.badges)
  const loaded = useModulesStore((s) => s.loaded)
  const features = FEATURES.filter((f) => f.module === 'core' || !loaded || enabledModules.has(f.module))

  return (
    <div className="space-y-6">
      <PageBanner
        icon={Sparkles}
        eyebrow="Кабинет работника"
        title={`Добро пожаловать${user?.firstName ? `, ${user.firstName}` : ''}!`}
        subtitle="Это общее пространство компании для работы с отпусками, документами, проектами и опросами — всё, что раньше требовало бумаг и хождения по кабинетам, теперь в одном месте."
      />

      <Card className="p-6 lg:p-8 animate-slide-up stagger-1">
        <div className="flex items-center gap-2.5 mb-1">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Что здесь есть</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Разделы доступны в меню слева — набор зависит от вашей роли</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon
            const badge = badges[f.module]
            return (
              <div key={f.module} className="flex items-start gap-3 rounded-xl border border-border/50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{f.title}</p>
                    {badge && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
