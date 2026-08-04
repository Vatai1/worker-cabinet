import { useState, useMemo, useEffect, lazy, Suspense } from 'react'
import { cn } from '@/shared/lib/utils'
import {
  Users, ClipboardList, UserPlus, Plane, Network,
  Calendar, Loader2, Sparkles, FileText, Building2, Briefcase, Wrench, Send,
} from 'lucide-react'
import { useModulesStore } from '@/shared/store/modulesStore'
import { HRSurveys } from '@/modules/surveys/pages/HRSurveys'
import { HROnboarding } from '@/modules/onboarding/pages/HROnboarding'
import { HRVacationCalendar } from '@/modules/vacation/pages/HRVacationCalendar'
import { DepartmentsTab } from '@/core/admin/pages/DepartmentsTab'
import { DictionariesTab } from '@/core/admin/pages/DictionariesTab'
import { HRTimesheet } from '@/modules/timesheet/pages/HRTimesheet'
const HRHierarchy = lazy(() => import('@/modules/hierarchy/pages/HRHierarchy').then(m => ({ default: m.HRHierarchy })))
const HRDocTemplates = lazy(() => import('@/modules/documents/pages/HRDocTemplates').then(m => ({ default: m.HRDocTemplates })))
const HRMailing = lazy(() => import('@/modules/mailing/pages/HRMailing').then(m => ({ default: m.HRMailing })))
const HRPositionsTab = () => <DictionariesTab variant="hr" initialTab="positions" />
const HRVacationTypesTab = () => <DictionariesTab variant="hr" initialTab="vacationTypes" />
const HRSkillsTab = () => <DictionariesTab variant="hr" initialTab="skills" />

type TabId = 'surveys' | 'onboarding' | 'vacation' | 'hierarchy' | 'hr_departments' | 'hr_positions' | 'hr_vacation_types' | 'hr_skills' | 'timesheet' | 'doc-templates' | 'mailing'

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
    { id: 'mailing', name: 'Рассылка', icon: Send, description: 'Массовая рассылка информации', module: 'mailing', color: 'from-fuchsia-500 to-pink-600' },
    { id: 'onboarding', name: 'Онбординг', icon: UserPlus, description: 'Шаблоны и адаптация', module: 'onboarding', color: 'from-emerald-500 to-teal-600' },
    { id: 'timesheet', name: 'Табель', icon: Calendar, description: 'Учёт рабочего времени', module: 'timesheet', color: 'from-cyan-500 to-blue-600' },
  ]},
  { label: 'Отпуска и структура', tabs: [
    { id: 'vacation', name: 'Отпуск', icon: Plane, description: 'Календарь отпусков', module: 'vacation', color: 'from-orange-500 to-amber-600' },
    { id: 'hierarchy', name: 'Иерархия', icon: Network, description: 'Оргструктура', module: 'hierarchy', color: 'from-pink-500 to-rose-600' },
  ]},
  { label: 'Документы', tabs: [
    { id: 'doc-templates', name: 'Шаблоны документов', icon: FileText, description: 'Шаблоны документов организации', module: 'documents', color: 'from-pink-500 to-rose-600' },
  ]},
  { label: 'Справочники', tabs: [
    { id: 'hr_departments', name: 'Отделы', icon: Building2, description: 'Структура организации', module: 'dictionaries', color: 'from-blue-500 to-indigo-600' },
    { id: 'hr_positions', name: 'Должности', icon: Briefcase, description: 'Справочник должностей', module: 'dictionaries', color: 'from-violet-500 to-purple-600' },
    { id: 'hr_vacation_types', name: 'Типы отпусков', icon: Plane, description: 'Типы отпусков', module: 'vacation', color: 'from-amber-500 to-orange-600' },
    { id: 'hr_skills', name: 'Навыки', icon: Wrench, description: 'Каталог навыков', module: 'skills', color: 'from-emerald-500 to-teal-600' },
  ]},
]

const TOP_NAV_TABS = ['mailing', 'timesheet', 'hierarchy', 'doc-templates'] as const

export function HRPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('surveys')
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)

  const filteredGroups = useMemo(() =>
    TAB_GROUPS
      .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => isModuleEnabled(tab.module)) }))
      .filter((group) => group.tabs.length > 0),
    [isModuleEnabled]
  )

  const allTabs = filteredGroups.flatMap((g) => g.tabs)
  const firstTab = filteredGroups[0]?.tabs[0]?.id
  const safeActiveTab = allTabs.some((t) => t.id === activeTab)
    ? activeTab
    : (firstTab as TabId | undefined)
  const currentTabInfo = allTabs.find((t) => t.id === safeActiveTab)

  const isTopLayout = TOP_NAV_TABS.includes(safeActiveTab as typeof TOP_NAV_TABS[number]) &&
    (safeActiveTab ? isModuleEnabled(allTabs.find(t => t.id === safeActiveTab)?.module || '') : false)
  const layoutMode: 'top' | 'left' = isTopLayout ? 'top' : 'left'

  const [displayedMode, setDisplayedMode] = useState<'top' | 'left'>(layoutMode)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')

  useEffect(() => {
    if (layoutMode === displayedMode) return
    setPhase('out')
    const t = setTimeout(() => {
      setDisplayedMode(layoutMode)
      requestAnimationFrame(() => setPhase('in'))
    }, 200)
    return () => clearTimeout(t)
  }, [layoutMode, displayedMode])

  useEffect(() => {
    if (phase !== 'in') return
    const t = setTimeout(() => setPhase('idle'), 220)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-card/5 rounded-full" />
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
      ) : (
        <div className={cn(
          'transition-[opacity,transform] duration-200 ease-out',
          phase === 'out'
            ? 'opacity-0 -translate-y-2 scale-[0.985]'
            : 'opacity-100 translate-y-0 scale-100',
        )}>
          {displayedMode === 'top' ? (
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
              {safeActiveTab === 'timesheet' && <HRTimesheet />}
              {safeActiveTab === 'hierarchy' && isModuleEnabled('hierarchy') && (
                <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                  <HRHierarchy />
                </Suspense>
              )}
              {safeActiveTab === 'doc-templates' && isModuleEnabled('documents') && (
                <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                  <HRDocTemplates />
                </Suspense>
              )}
              {safeActiveTab === 'mailing' && isModuleEnabled('mailing') && (
                <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                  <HRMailing />
                </Suspense>
              )}
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

              <div className="relative min-w-0">
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
                  ['mailing', HRMailing],
                  ['onboarding', HROnboarding],
                  ['vacation', HRVacationCalendar],
                  ['hr_departments', DepartmentsTab],
                  ['hr_positions', HRPositionsTab],
                  ['hr_vacation_types', HRVacationTypesTab],
                  ['hr_skills', HRSkillsTab],
                ] as const).map(([id, Component]) => (
                  <div
                    key={id}
                    className={cn(
                      'animate-fade-in',
                      safeActiveTab === id ? 'block' : 'hidden',
                    )}
                  >
                    <Component />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
