import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { ChangelogModal } from '@/shared/components/ChangelogModal'
import { API_BASE_URL } from '@/shared/lib/api'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { PageBanner, BannerPill } from '@/shared/components/PageBanner'
import { Loader2, Users, Key, Building2, Settings2, Activity, Globe, Sparkles, ShieldCheck, Server, AlertCircle, Boxes, Briefcase, Plane, Palette, Tag, Network, Bug, FlaskConical, Film, Radio } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'

const HREmployees = lazy(() => import('@/core/employees/pages/HREmployees').then((m) => ({ default: m.HREmployees })))
const DepartmentsTab = lazy(() => import('@/core/admin/pages/DepartmentsTab').then((m) => ({ default: m.DepartmentsTab })))
const DictionariesTab = lazy(() => import('@/core/admin/pages/DictionariesTab').then((m) => ({ default: m.DictionariesTab })))
const OrganizationsTab = lazy(() => import('@/core/admin/components/OrganizationsTab').then((m) => ({ default: m.OrganizationsTab })))
const InstructionsTab = lazy(() => import('@/core/admin/components/InstructionsTab').then((m) => ({ default: m.InstructionsTab })))
const GlobalHierarchy = lazy(() => import('@/modules/hierarchy/pages/GlobalHierarchy').then((m) => ({ default: m.GlobalHierarchy })))
const AdminBugReports = lazy(() => import('@/core/admin/pages/AdminBugReports').then((m) => ({ default: m.AdminBugReports })))
const AdminRoleMappings = lazy(() => import('@/core/admin/pages/AdminRoleMappings').then((m) => ({ default: m.AdminRoleMappings })))
const OnlineUsersTab = lazy(() => import('@/core/admin/components/OnlineUsersTab').then((m) => ({ default: m.OnlineUsersTab })))
const RolesTab = lazy(() => import('@/core/admin/pages/tabs/RolesTab').then((m) => ({ default: m.RolesTab })))
const SettingsTab = lazy(() => import('@/core/admin/pages/tabs/SettingsTab').then((m) => ({ default: m.SettingsTab })))
const AuditTab = lazy(() => import('@/core/admin/pages/tabs/AuditTab').then((m) => ({ default: m.AuditTab })))
const HealthTab = lazy(() => import('@/core/admin/pages/tabs/HealthTab').then((m) => ({ default: m.HealthTab })))
const ErrorsTab = lazy(() => import('@/core/admin/pages/tabs/ErrorsTab').then((m) => ({ default: m.ErrorsTab })))
const SecurityTab = lazy(() => import('@/core/admin/pages/tabs/SecurityTab').then((m) => ({ default: m.SecurityTab })))
const ModulesTab = lazy(() => import('@/core/admin/pages/tabs/ModulesTab').then((m) => ({ default: m.ModulesTab })))
const TestDataTab = lazy(() => import('@/core/admin/pages/tabs/TestDataTab').then((m) => ({ default: m.TestDataTab })))
const AppearanceTab = lazy(() => import('@/core/admin/pages/tabs/AppearanceTab').then((m) => ({ default: m.AppearanceTab })))

type TabId = 'users' | 'roles' | 'role-mappings' | 'departments' | 'settings' | 'audit' | 'health' | 'errors' | 'online' | 'security' | 'organizations' | 'global-hierarchy' | 'modules' | 'appearance' | 'dict_positions' | 'dict_vacation' | 'dict_skills' | 'bug-reports' | 'test-data' | 'instructions'

interface TabItem {
  id: TabId
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  color: string
  module?: string
}

const TAB_PERMISSIONS: Partial<Record<TabId, string>> = {
  roles: 'admin:roles',
  'role-mappings': 'admin:roles',
  settings: 'admin:settings',
  modules: 'admin:settings',
  audit: 'admin:audit',
  errors: 'admin:errors',
  online: 'admin:online',
  'bug-reports': 'bug_reports:manage',
}

interface TabGroup {
  label: string
  tabs: TabItem[]
}

const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Управление',
    tabs: [
      { id: 'roles', name: 'Роли и доступы', icon: Key, description: 'Динамические роли, пермишены', color: 'from-violet-500 to-purple-600' },
      { id: 'role-mappings', name: 'Роли по должности', icon: ShieldCheck, description: 'Автоназначение org_role при первом входе', color: 'from-rose-500 to-red-600' },
      { id: 'departments', name: 'Отделы', icon: Building2, description: 'Структура организации', color: 'from-emerald-500 to-teal-600' },
      { id: 'organizations', name: 'Учреждения', icon: Building2, description: 'Все учреждения системы', color: 'from-indigo-500 to-blue-600' },
      { id: 'global-hierarchy', name: 'Иерархия', icon: Network, description: 'Глобальная структура учреждений', color: 'from-pink-500 to-rose-600' },
    ],
  },
  {
    label: 'Данные',
    tabs: [
      { id: 'modules', name: 'Модули', icon: Boxes, description: 'Включение/отключение разделов', color: 'from-orange-500 to-amber-600' },
      { id: 'settings', name: 'Настройки', icon: Settings2, description: 'Параметры системы', color: 'from-slate-500 to-gray-600' },
    ],
  },
  {
    label: 'Справочники',
    tabs: [
      { id: 'users', name: 'Сотрудники', icon: Users, description: 'Профили, роли, теги, балансы отпусков', color: 'from-blue-500 to-indigo-600' },
      { id: 'dict_positions', name: 'Должности', icon: Briefcase, description: 'Справочник должностей', color: 'from-pink-500 to-rose-600' },
      { id: 'dict_vacation', name: 'Отпуск', icon: Plane, description: 'Типы отпусков', color: 'from-sky-500 to-cyan-600', module: 'vacation' },
      { id: 'dict_skills', name: 'Теги', icon: Tag, description: 'Справочник тегов', color: 'from-violet-500 to-purple-600', module: 'skills' },
      { id: 'instructions', name: 'Видеоинструкции', icon: Film, description: 'Видеоинструкции для пользователей', color: 'from-indigo-500 to-violet-600' },
    ],
  },
  {
    label: 'Безопасность и контроль',
    tabs: [
      { id: 'online', name: 'Сейчас на сайте', icon: Radio, description: 'Кто онлайн, отошёл, когда заходил', color: 'from-emerald-500 to-green-600' },
      { id: 'security', name: 'Безопасность', icon: ShieldCheck, description: 'Блокировки, попытки входа', color: 'from-red-500 to-rose-600' },
      { id: 'audit', name: 'Аудит', icon: Activity, description: 'Лог действий', color: 'from-indigo-500 to-blue-600' },
      { id: 'errors', name: 'Ошибки', icon: AlertCircle, description: 'Лог ошибок системы', color: 'from-orange-500 to-red-600' },
      { id: 'bug-reports', name: 'Баг-репорты', icon: Bug, description: 'Отчёты пользователей', color: 'from-amber-500 to-orange-600' },
      { id: 'health', name: 'Система', icon: Server, description: 'БД, память, подключения', color: 'from-teal-500 to-emerald-600' },
      { id: 'test-data', name: 'Тестовые данные', icon: FlaskConical, description: 'Тестовый отдел и работники', color: 'from-lime-500 to-green-600' },
    ],
  },
  {
    label: 'Оформление',
    tabs: [
      { id: 'appearance', name: 'Темы', icon: Palette, description: 'Тема оформления системы', color: 'from-blue-500 to-cyan-600' },
    ],
  },
]

interface Props {
  mode?: 'global' | 'org'
}

export function AdminPanel({ mode = 'global' }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const [apiVersion, setApiVersion] = useState<string | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const isGlobalMode = mode === 'global'
  const prevTabRef = useRef<TabId>('users')

  useEffect(() => {
    fetchWithRetry(`${API_BASE_URL}/version`, { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.api) setApiVersion(data.api) })
      .catch(() => {})
  }, [])

  const permissions = useAuthStore((s) => s.permissions)
  const HIDDEN_FOR_ORG_ADMIN: TabId[] = ['roles', 'role-mappings', 'security', 'health', 'errors', 'organizations', 'global-hierarchy', 'bug-reports', 'test-data', 'instructions']

  const filteredGroups = TAB_GROUPS
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => {
        if (!isGlobalMode && HIDDEN_FOR_ORG_ADMIN.includes(tab.id)) return false
        const permission = TAB_PERMISSIONS[tab.id]
        if (permission && !permissions.includes(permission)) return false
        return !tab.module || isModuleEnabled(tab.module)
      }),
    }))
    .filter((group) => group.tabs.length > 0)

  const allTabs = filteredGroups.flatMap((g) => g.tabs)
  const requestedTab = searchParams.get('tab') as TabId | null
  const activeTab = (requestedTab && allTabs.some((t) => t.id === requestedTab) ? requestedTab : allTabs[0]?.id) ?? 'users'

  useEffect(() => {
    if (activeTab !== 'global-hierarchy') prevTabRef.current = activeTab
  }, [activeTab])

  const closeHierarchy = () => setSearchParams(prevTabRef.current ? { tab: prevTabRef.current } : {})

  const orgStore = useOrgStore()
  const currentOrg = orgStore.organizations.find((o) => o.id === orgStore.currentOrgId)

  return (
    <div className="space-y-6">
      <PageBanner
        icon={Sparkles}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {isGlobalMode ? 'Глобальная админ-панель' : 'Админ панель учреждения'}
            <BannerPill icon={isGlobalMode ? Globe : Building2} tone="neutral">
              {isGlobalMode ? 'Все организации' : currentOrg?.name || 'Учреждение'}
            </BannerPill>
          </span>
        }
        subtitle={
          isGlobalMode
            ? 'Глобальное управление ролями, модулями и настройками'
            : 'Управление учреждением: пользователи, модули, настройки'
        }
        aside={
          <button
            type="button"
            onClick={() => setChangelogOpen(true)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Tag className="h-3 w-3" />
            Версия: {__APP_VERSION__}{apiVersion ? ` · API ${apiVersion}` : ''}
          </button>
        }
      />

      <div className="min-w-0">
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
          {activeTab === 'users' && <HREmployees adminMode isGlobalMode={isGlobalMode} />}
          {activeTab === 'roles' && <RolesTab />}
          {activeTab === 'role-mappings' && <AdminRoleMappings />}
          {activeTab === 'departments' && <DepartmentsTab />}
          {activeTab === 'settings' && <SettingsTab mode={mode} />}
          {activeTab === 'audit' && <AuditTab />}
          {activeTab === 'health' && <HealthTab />}
          {activeTab === 'errors' && <ErrorsTab />}
          {activeTab === 'online' && <OnlineUsersTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'organizations' && <OrganizationsTab />}
          {activeTab === 'global-hierarchy' && <GlobalHierarchy fullscreen onClose={closeHierarchy} />}
          {activeTab === 'dict_positions' && <DictionariesTab initialTab="positions" />}
          {activeTab === 'dict_vacation' && <DictionariesTab initialTab="vacationTypes" />}
          {activeTab === 'dict_skills' && <DictionariesTab initialTab="skills" />}
          {activeTab === 'modules' && <ModulesTab mode={mode} />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'bug-reports' && <AdminBugReports />}
          {activeTab === 'test-data' && <TestDataTab />}
          {activeTab === 'instructions' && <InstructionsTab />}
        </Suspense>
      </div>

      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  )
}
