import { useState, lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import {
  Users, ClipboardList, UserPlus, Plane, Network, BookOpen,
  Calendar, Loader2,
} from 'lucide-react'
import { HRSurveys } from '@/pages/HRSurveys'
import { HROnboarding } from '@/pages/HROnboarding'
import { HRVacationCalendar } from '@/pages/HRVacationCalendar'
import { HRDictionaries } from '@/pages/HRDictionaries'
import { HRTimesheet } from '@/pages/HRTimesheet'
const HRHierarchy = lazy(() => import('@/pages/HRHierarchy').then(m => ({ default: m.HRHierarchy })))

type TabId = 'surveys' | 'onboarding' | 'vacation' | 'hierarchy' | 'dictionaries' | 'timesheet'

interface TabItem {
  id: TabId
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  color: string
}

interface TabGroup {
  label: string
  tabs: TabItem[]
}

const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Управление персоналом',
    tabs: [
      { id: 'surveys', name: 'Опросы', icon: ClipboardList, description: 'Создание и управление опросами', color: 'from-violet-500 to-purple-600' },
      { id: 'onboarding', name: 'Онбординг', icon: UserPlus, description: 'Шаблоны и адаптация сотрудников', color: 'from-emerald-500 to-teal-600' },
      { id: 'timesheet', name: 'Табель', icon: Calendar, description: 'Учёт рабочего времени', color: 'from-blue-500 to-indigo-600' },
    ],
  },
  {
    label: 'Отпуска и структура',
    tabs: [
      { id: 'vacation', name: 'Отпуск', icon: Plane, description: 'Календарь и управление отпусками', color: 'from-amber-500 to-orange-600' },
      { id: 'hierarchy', name: 'Иерархия', icon: Network, description: 'Организационная структура', color: 'from-cyan-500 to-blue-600' },
    ],
  },
  {
    label: 'Справочники',
    tabs: [
      { id: 'dictionaries', name: 'Справочники', icon: BookOpen, description: 'Должности, типы, навыки', color: 'from-pink-500 to-rose-600' },
    ],
  },
]

export function HRPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('surveys')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">HR-панель</h1>
          <p className="text-sm text-muted-foreground">Управление персоналом, опросами и онбордингом</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <nav className="space-y-4">
          {TAB_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 mb-1.5">{group.label}</p>
              <div className="space-y-0.5">
                {group.tabs.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'group flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all duration-200',
                        isActive
                          ? 'bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 shadow-sm'
                          : 'hover:bg-muted/40 border border-transparent',
                      )}
                    >
                      <div className={cn(
                        'p-2 rounded-lg transition-all duration-200 shrink-0',
                        isActive
                          ? `bg-gradient-to-br ${tab.color} text-white shadow-sm`
                          : 'bg-muted/50 text-muted-foreground group-hover:bg-muted',
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={cn(
                          'text-sm font-medium truncate transition-colors',
                          isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                        )}>
                          {tab.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 truncate leading-tight">{tab.description}</p>
                      </div>
                      {isActive && <div className="ml-auto w-1 h-4 rounded-full bg-primary shrink-0" />}
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
          ] as const).map(([id, Component]) => (
            <div
              key={id}
              className={cn(
                'transition-opacity duration-200 ease-in-out',
                activeTab === id ? 'opacity-100 relative' : 'opacity-0 absolute inset-0 pointer-events-none invisible',
              )}
            >
              <Component />
            </div>
          ))}
          <div
            className={cn(
              'transition-opacity duration-200 ease-in-out',
              activeTab === 'hierarchy' ? 'opacity-100 relative' : 'opacity-0 absolute inset-0 pointer-events-none invisible',
            )}
          >
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <HRHierarchy />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
