import { useState, useMemo, lazy, Suspense, useEffect } from 'react'
import { cn } from '@/shared/lib/utils'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import {
  Users, ClipboardList, UserPlus, Plane, Network, BookOpen,
  Calendar, Loader2, BarChart3, Sparkles,
} from 'lucide-react'
import { useModulesStore } from '@/shared/store/modulesStore'
import { HRSurveys } from '@/modules/surveys/pages/HRSurveys'
import { HROnboarding } from '@/modules/onboarding/pages/HROnboarding'
import { HRVacationCalendar } from '@/modules/vacation/pages/HRVacationCalendar'
import { HRDictionaries } from '@/core/admin/pages/HRDictionaries'
import { HRTimesheet } from '@/modules/timesheet/pages/HRTimesheet'
import { AnalyticsTab } from '@/core/admin/pages/AdminAnalytics'
const HRHierarchy = lazy(() => import('@/modules/hierarchy/pages/HRHierarchy').then(m => ({ default: m.HRHierarchy })))

type TabId = 'surveys' | 'onboarding' | 'vacation' | 'hierarchy' | 'dictionaries' | 'timesheet' | 'analytics'

interface TabItem {
  id: TabId
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  module: string
  color: string
}

interface TabGroup {
  label: string
  tabs: TabItem[]
}

const TAB_GROUPS: TabGroup[] = [
  { label: 'Управление персоналом', tabs: [
    { id: 'surveys', name: 'Опросы', icon: ClipboardList, description: 'Создание и управление опросами', module: 'surveys', color: 'from-violet-500 to-purple-600' },
    { id: 'onboarding', name: 'Онбординг', icon: UserPlus, description: 'Шаблоны и адаптация', module: 'onboarding', color: 'from-emerald-500 to-teal-600' },
    { id: 'timesheet', name: 'Табель', icon: Calendar, description: 'Учёт рабочего времени', module: 'timesheet', color: 'from-cyan-500 to-blue-600' },
  ]},
  { label: 'Отпуска и структура', tabs: [
    { id: 'vacation', name: 'Отпуск', icon: Plane, description: 'Календарь отпусков', module: 'vacation', color: 'from-orange-500 to-amber-600' },
    { id: 'hierarchy', name: 'Иерархия', icon: Network, description: 'Оргструктура', module: 'hierarchy', color: 'from-pink-500 to-rose-600' },
  ]},
  { label: 'Справочники и аналитика', tabs: [
    { id: 'dictionaries', name: 'Справочники', icon: BookOpen, description: 'Должности, типы, навыки', module: 'dictionaries', color: 'from-slate-500 to-gray-600' },
    { id: 'analytics', name: 'Аналитика', icon: BarChart3, description: 'Графики и статистика', module: 'analytics', color: 'from-indigo-500 to-blue-600' },
  ]},
]

export function HRPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('surveys')
  const [stats, setStats] = useState<{ totalUsers: number; totalDepartments: number; activeSurveys: number; pendingVacations: number } | null>(null)
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)

  const filteredGroups = useMemo(() =>
    TAB_GROUPS
      .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => isModuleEnabled(tab.module)) }))
      .filter((group) => group.tabs.length > 0),
    [isModuleEnabled]
  )

  const allTabs = filteredGroups.flatMap((g) => g.tabs)
  const activeTabInfo = allTabs.find((t) => t.id === activeTab)
  const firstTab = filteredGroups[0]?.tabs[0]?.id
  const safeActiveTab = allTabs.some((t) => t.id === activeTab)
    ? activeTab
    : (firstTab as TabId | undefined)
  const currentTabInfo = allTabs.find((t) => t.id === safeActiveTab)

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/stats`, { headers: getAuthHeaders() })
      if (res.ok) setStats(await res.json())
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white/5 rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-6 w-6 text-white/80" />
            <h1 className="text-2xl font-bold text-white">HR-панель</h1>
          </div>
          <p className="text-sm text-white/60">Управление персоналом и процессами</p>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-fade-in">
          <Users className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm font-medium">Все HR-модули отключены</p>
          <p className="text-xs mt-1">Включите модули в «Администрирование → Модули»</p>
        </div>
      ) : safeActiveTab === 'timesheet' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {allTabs.map((tab) => {
              const Icon = tab.icon
              const isActive = safeActiveTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-border/40',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.name}
                </button>
              )
            })}
          </div>
          <HRTimesheet />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          <nav className="space-y-3">
            {filteredGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-3 mb-1.5">{group.label}</p>
                <div className="space-y-0.5 bg-card rounded-xl border border-border/40 p-1.5">
                  {group.tabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = safeActiveTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'group flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all duration-200',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        <Icon className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground',
                        )} />
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            'text-sm font-medium truncate transition-colors',
                            isActive ? 'text-primary-foreground' : '',
                          )}>
                            {tab.name}
                          </p>
                        </div>
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground/60 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="min-w-0">
            {currentTabInfo && (
              <div className="flex items-center gap-3 mb-4">
                <div className={cn('p-2 rounded-xl bg-gradient-to-br text-white', currentTabInfo.color)}>
                  <currentTabInfo.icon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{currentTabInfo.name}</h2>
                  <p className="text-xs text-muted-foreground">{currentTabInfo.description}</p>
                </div>
              </div>
            )}
            {([
              ['surveys', HRSurveys],
              ['onboarding', HROnboarding],
              ['vacation', HRVacationCalendar],
              ['dictionaries', HRDictionaries],
              ['timesheet', HRTimesheet],
              ['analytics', AnalyticsTab],
            ] as const).map(([id, Component]) => (
              <div
                key={id}
                className={cn(
                  'transition-opacity duration-200',
                  safeActiveTab === id ? 'opacity-100 relative' : 'opacity-0 absolute inset-0 pointer-events-none invisible',
                )}
              >
                <Component />
              </div>
            ))}
            <div className={cn(
              'transition-opacity duration-200',
              safeActiveTab === 'hierarchy' ? 'opacity-100 relative' : 'opacity-0 absolute inset-0 pointer-events-none invisible',
            )}>
              <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                <HRHierarchy />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
