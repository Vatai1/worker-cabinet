import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/shared/lib/utils'
import {
  Users, ClipboardList, UserPlus, Plane, Network,
  Calendar, Loader2, Sparkles, FileText, Building2, Briefcase, Tag, Send,
  HelpCircle,
} from 'lucide-react'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { getCookie, setCookie } from '@/shared/lib/cookies'
import { HRPanelIntroModal } from '@/shared/components/HRPanelIntroModal'
import { PageBanner } from '@/shared/components/PageBanner'
import { Button } from '@/shared/components/ui/Button'

const HR_PANEL_INTRO_COOKIE = 'hr_panel_intro_seen'
import { HREmployees } from '@/core/employees/pages/HREmployees'
import { HRSurveys } from '@/modules/surveys/pages/HRSurveys'
import { HROnboarding } from '@/modules/onboarding/pages/HROnboarding'
import { HRVacationCalendar } from '@/modules/vacation/pages/HRVacationCalendar'
import { DepartmentsTab } from '@/core/admin/pages/DepartmentsTab'
import { DictionariesTab } from '@/core/admin/pages/DictionariesTab'
import { HRTimesheet } from '@/modules/timesheet/pages/HRTimesheet'
import { HRInstitution } from '@/modules/institution/pages/HRInstitution'
const GlobalHierarchy = lazy(() => import('@/modules/hierarchy/pages/GlobalHierarchy').then(m => ({ default: m.GlobalHierarchy })))
const HRDocTemplates = lazy(() => import('@/modules/documents/pages/HRDocTemplates').then(m => ({ default: m.HRDocTemplates })))
const HRMailing = lazy(() => import('@/modules/mailing/pages/HRMailing').then(m => ({ default: m.HRMailing })))
const HRPositionsTab = () => <DictionariesTab variant="hr" initialTab="positions" />
const HRVacationTypesTab = () => <DictionariesTab variant="hr" initialTab="vacationTypes" />
const HRSkillsTab = () => <DictionariesTab variant="hr" initialTab="skills" />

type TabId = 'hr_employees' | 'surveys' | 'onboarding' | 'vacation' | 'hierarchy' | 'hr_departments' | 'hr_positions' | 'hr_vacation_types' | 'hr_skills' | 'timesheet' | 'doc-templates' | 'mailing' | 'institution'

interface TabItem {
  id: TabId
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  module: string | null
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
    { id: 'vacation', name: 'Отпуск', icon: Plane, description: 'Календарь отпусков, дни, доступ, пересечения', module: 'vacation', color: 'from-orange-500 to-amber-600' },
    { id: 'hierarchy', name: 'Иерархия', icon: Network, description: 'Оргструктура', module: 'hierarchy', color: 'from-pink-500 to-rose-600' },
  ]},
  { label: 'Документы', tabs: [
    { id: 'doc-templates', name: 'Шаблоны документов', icon: FileText, description: 'Шаблоны документов организации', module: 'documents', color: 'from-pink-500 to-rose-600' },
  ]},
  { label: 'Справочники', tabs: [
    { id: 'hr_employees', name: 'Сотрудники', icon: Users, description: 'Справочник сотрудников', module: null, color: 'from-blue-500 to-indigo-600' },
    { id: 'institution', name: 'Учреждение', icon: Building2, description: 'Информация и руководитель', module: 'dictionaries', color: 'from-indigo-500 to-blue-600' },
    { id: 'hr_departments', name: 'Отделы', icon: Building2, description: 'Структура организации', module: null, color: 'from-blue-500 to-indigo-600' },
    { id: 'hr_positions', name: 'Должности', icon: Briefcase, description: 'Справочник должностей', module: 'dictionaries', color: 'from-violet-500 to-purple-600' },
    { id: 'hr_vacation_types', name: 'Типы отпусков', icon: Plane, description: 'Типы отпусков', module: 'vacation', color: 'from-amber-500 to-orange-600' },
    { id: 'hr_skills', name: 'Теги', icon: Tag, description: 'Каталог тегов', module: 'skills', color: 'from-emerald-500 to-teal-600' },
  ]},
]

const TOP_NAV_TABS = ['mailing', 'timesheet', 'hierarchy', 'doc-templates'] as const

export function HRPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const prevTabRef = useRef<TabId>('surveys')

  const filteredGroups = useMemo(() =>
    TAB_GROUPS
      .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => tab.module === null || isModuleEnabled(tab.module)) }))
      .filter((group) => group.tabs.length > 0),
    [isModuleEnabled]
  )

  const allTabs = filteredGroups.flatMap((g) => g.tabs)
  const firstTab = filteredGroups[0]?.tabs[0]?.id
  const requestedTab = searchParams.get('tab') as TabId | null
  const safeActiveTab = requestedTab && allTabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : (firstTab as TabId | undefined)

  const isFullBleedTab = TOP_NAV_TABS.includes(safeActiveTab as typeof TOP_NAV_TABS[number]) &&
    (safeActiveTab ? isModuleEnabled(allTabs.find(t => t.id === safeActiveTab)?.module || '') : false)

  useEffect(() => {
    if (safeActiveTab && safeActiveTab !== 'hierarchy') prevTabRef.current = safeActiveTab
  }, [safeActiveTab])

  const closeHierarchy = () => setSearchParams(prevTabRef.current ? { tab: prevTabRef.current } : {})

  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(safeActiveTab ? [safeActiveTab] : []))
  useEffect(() => {
    if (!safeActiveTab) return
    setVisitedTabs(prev => prev.has(safeActiveTab) ? prev : new Set(prev).add(safeActiveTab))
  }, [safeActiveTab])

  const [showIntroModal, setShowIntroModal] = useState(false)
  useEffect(() => {
    if (getCookie(HR_PANEL_INTRO_COOKIE)) return
    setShowIntroModal(true)
    setCookie(HR_PANEL_INTRO_COOKIE, '1')
  }, [])

  return (
    <div className="space-y-6">
      <PageBanner
        icon={Sparkles}
        title="HR-панель"
        subtitle="Управление персоналом и процессами"
        aside={
          <Button variant="outline" size="sm" onClick={() => setShowIntroModal(true)}>
            <HelpCircle className="h-3.5 w-3.5" />
            Как это работает
          </Button>
        }
      />

      <HRPanelIntroModal open={showIntroModal} onClose={() => setShowIntroModal(false)} groups={filteredGroups} activeTabId={safeActiveTab} />

      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-fade-in">
          <Users className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm font-medium">Все HR-модули отключены</p>
          <p className="text-xs mt-1">Включите модули в «Администрирование → Модули»</p>
        </div>
      ) : isFullBleedTab ? (
        <div className="space-y-4 animate-fade-in">
          {safeActiveTab === 'timesheet' && <HRTimesheet />}
          {safeActiveTab === 'hierarchy' && isModuleEnabled('hierarchy') && (
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <GlobalHierarchy fullscreen editScopeOrgId={currentOrgId ?? undefined} initialOrgId={currentOrgId ?? undefined} onClose={closeHierarchy} />
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
        <div className="relative min-w-0 animate-fade-in">
          {([
            ['hr_employees', HREmployees],
            ['surveys', HRSurveys],
            ['mailing', HRMailing],
            ['institution', HRInstitution],
            ['onboarding', HROnboarding],
            ['vacation', HRVacationCalendar],
            ['hr_departments', DepartmentsTab],
            ['hr_positions', HRPositionsTab],
            ['hr_vacation_types', HRVacationTypesTab],
            ['hr_skills', HRSkillsTab],
          ] as const).map(([id, Component]) => (
            visitedTabs.has(id) && (
              <div
                key={id}
                className={cn(
                  'animate-fade-in',
                  safeActiveTab === id ? 'block' : 'hidden',
                )}
              >
                <Component />
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
