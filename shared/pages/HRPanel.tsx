import { useState, useMemo, lazy, Suspense } from 'react'
import { cn } from '@/shared/lib/utils'
import {
  Users, ClipboardList, UserPlus, Plane, Network, BookOpen,
  Calendar, Loader2, BarChart3,
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
}

interface TabGroup {
  label: string
  tabs: TabItem[]
}

const TAB_GROUPS: TabGroup[] = [
  { label: 'Управление персоналом', tabs: [
    { id: 'surveys', name: 'Опросы', icon: ClipboardList, description: 'Создание и управление опросами', module: 'surveys' },
    { id: 'onboarding', name: 'Онбординг', icon: UserPlus, description: 'Шаблоны и адаптация', module: 'onboarding' },
    { id: 'timesheet', name: 'Табель', icon: Calendar, description: 'Учёт рабочего времени', module: 'timesheet' },
  ]},
  { label: 'Отпуска и структура', tabs: [
    { id: 'vacation', name: 'Отпуск', icon: Plane, description: 'Календарь отпусков', module: 'vacation' },
    { id: 'hierarchy', name: 'Иерархия', icon: Network, description: 'Оргструктура', module: 'hierarchy' },
  ]},
  { label: 'Справочники', tabs: [
    { id: 'dictionaries', name: 'Справочники', icon: BookOpen, description: 'Должности, типы, навыки', module: 'dictionaries' },
  ]},
  { label: 'Аналитика', tabs: [
    { id: 'analytics', name: 'Аналитика', icon: BarChart3, description: 'Графики и статистика', module: 'analytics' },
  ]},
]

export function HRPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('surveys')
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)

  const filteredGroups = useMemo(() =>
    TAB_GROUPS
      .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => isModuleEnabled(tab.module)) }))
      .filter((group) => group.tabs.length > 0),
    [isModuleEnabled]
  )

  const firstTab = filteredGroups[0]?.tabs[0]?.id
  const safeActiveTab = filteredGroups.some((g) => g.tabs.some((t) => t.id === activeTab))
    ? activeTab
    : (firstTab as TabId | undefined)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 page-header">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">HR-панель</h1>
          <p className="text-sm text-muted-foreground">Управление персоналом и процессами</p>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-fade-in">
          <Users className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm font-medium">Все HR-модули отключены</p>
          <p className="text-xs mt-1">Включите модули в «Администрирование → Модули»</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 page-grid">
          <nav className="space-y-4">
            {filteredGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-3 mb-1.5">{group.label}</p>
                <div className="space-y-0.5">
                  {group.tabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = safeActiveTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'group flex items-center gap-3 w-full rounded-lg px-3 py-2 text-left transition-all duration-200',
                          isActive
                            ? 'bg-primary/8 text-primary'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{tab.name}</p>
                        </div>
                        {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-primary shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="min-w-0 relative">
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
