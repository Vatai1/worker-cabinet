import { useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { API_BASE_URL } from '@/shared/lib/api'
import { useModulesStore } from '@/shared/store/modulesStore'
import { AnalyticsTab } from '@/core/admin/pages/AdminAnalytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import { Switch } from '@/shared/components/ui/Switch'
import { ModuleSettingsModal } from '@/core/admin/components/modules/ModuleSettingsModal'
import type { ModuleId } from '@/core/admin/components/modules/types'
import {
  Users, Key, Building2, Settings2, ScrollText, Search,
  Loader2, Plus, Trash2, Edit3, Check, X, AlertTriangle, Activity,
  ChevronLeft, ChevronRight, RefreshCw, UserCog, Lock,
  RotateCcw, Sliders, Clock, Globe, Sparkles,
  ShieldCheck, ArrowRightLeft, Eye, ArrowUpDown,
  BarChart3, Download, FileText, Database,
  HardDrive, Server, AlertCircle, Unlock, UserPlus, Boxes,
  TrendingUp, Clock3, FolderKanban, CalendarX, Settings,
  Calendar, Zap, Briefcase, Wrench, Plane,
  Pencil, Save, Bot,
} from 'lucide-react'
import type { AdminRole, AdminPermission, AdminUser, SystemSetting, AuditLogEntry, AdminStats } from '@/core/admin/types/admin'

type TabId = 'users' | 'roles' | 'departments' | 'settings' | 'audit' | 'analytics' | 'health' | 'errors' | 'security' | 'reports' | 'dictionaries' | 'modules' | 'assistant'

interface TabItem {
  id: TabId
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  color: string
  module?: string
}

interface TabGroup {
  label: string
  tabs: TabItem[]
}

const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Управление',
    tabs: [
      { id: 'users', name: 'Пользователи', icon: Users, description: 'Сотрудники, роли, статусы', color: 'from-blue-500 to-indigo-600' },
      { id: 'roles', name: 'Роли и доступы', icon: Key, description: 'Динамические роли, пермишены', color: 'from-violet-500 to-purple-600' },
      { id: 'departments', name: 'Отделы', icon: Building2, description: 'Структура организации', color: 'from-emerald-500 to-teal-600' },
    ],
  },
  {
    label: 'Отчёты',
    tabs: [
      { id: 'analytics', name: 'Аналитика', icon: BarChart3, description: 'Графики, статистика', color: 'from-amber-500 to-orange-600', module: 'analytics' },
      { id: 'reports', name: 'Отчёты', icon: FileText, description: 'Отпуска, наймы, CSV', color: 'from-cyan-500 to-blue-600' },
    ],
  },
  {
    label: 'Данные',
    tabs: [
      { id: 'modules', name: 'Модули', icon: Boxes, description: 'Включение/отключение разделов', color: 'from-orange-500 to-amber-600' },
      { id: 'dictionaries', name: 'Справочники', icon: ScrollText, description: 'Должности, навыки, типы', color: 'from-pink-500 to-rose-600' },
      { id: 'settings', name: 'Настройки', icon: Settings2, description: 'Параметры системы', color: 'from-slate-500 to-gray-600' },
      { id: 'assistant', name: 'Ассистент', icon: Bot, description: 'AI-ассистент, модель, промпт', color: 'from-violet-500 to-purple-600' },
    ],
  },
  {
    label: 'Безопасность и контроль',
    tabs: [
      { id: 'security', name: 'Безопасность', icon: ShieldCheck, description: 'Блокировки, попытки входа', color: 'from-red-500 to-rose-600' },
      { id: 'audit', name: 'Аудит', icon: Activity, description: 'Лог действий', color: 'from-indigo-500 to-blue-600' },
      { id: 'errors', name: 'Ошибки', icon: AlertCircle, description: 'Лог ошибок системы', color: 'from-orange-500 to-red-600' },
      { id: 'health', name: 'Система', icon: Server, description: 'БД, память, подключения', color: 'from-teal-500 to-emerald-600' },
    ],
  },
]

const ROLE_LABELS: Record<string, string> = {
  employee: 'Сотрудник',
  manager: 'Руководитель',
  hr: 'HR-менеджер',
  admin: 'Администратор',
  director: 'Директор',
  onboarding: 'Онбординг',
}

const ACTION_LABELS: Record<string, string> = {
  role_create: 'Создание роли',
  role_update: 'Обновление роли',
  role_delete: 'Удаление роли',
  user_role_change: 'Смена роли',
  user_status_change: 'Смена статуса',
  user_password_reset: 'Сброс пароля',
  user_update: 'Обновление пользователя',
  settings_update: 'Обновление настроек',
  bulk_status_change: 'Массовая смена статуса',
  bulk_role_change: 'Массовая смена роли',
  account_unlock: 'Разблокировка аккаунта',
  login: 'Вход в систему',
  module_toggle: 'Переключение модуля',
  module_create: 'Создание модуля',
  module_update: 'Обновление модуля',
  module_delete: 'Удаление модуля',
}

const ACTION_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  role_create:        { icon: Plus,          color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  role_update:        { icon: Edit3,         color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-900/30' },
  role_delete:        { icon: Trash2,        color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-100 dark:bg-red-900/30' },
  user_role_change:   { icon: ArrowRightLeft,color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-100 dark:bg-violet-900/30' },
  user_status_change: { icon: ArrowUpDown,   color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-900/30' },
  user_password_reset:{ icon: RotateCcw,     color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-100 dark:bg-orange-900/30' },
  user_update:        { icon: UserCog,       color: 'text-sky-600 dark:text-sky-400',          bg: 'bg-sky-100 dark:bg-sky-900/30' },
  settings_update:    { icon: Sliders,       color: 'text-indigo-600 dark:text-indigo-400',    bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
  bulk_status_change: { icon: ArrowUpDown,   color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-900/30' },
  bulk_role_change:   { icon: ArrowRightLeft,color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-100 dark:bg-violet-900/30' },
  account_unlock:     { icon: Unlock,        color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  login:              { icon: Activity,      color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-900/30' },
  module_toggle:      { icon: Boxes,         color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-100 dark:bg-orange-900/30' },
  module_create:      { icon: Boxes,         color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  module_update:      { icon: Boxes,         color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-900/30' },
  module_delete:      { icon: Trash2,        color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-100 dark:bg-red-900/30' },
}

const ENTITY_LABELS: Record<string, string> = {
  role: 'Роль',
  user: 'Пользователь',
  system: 'Система',
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн. назад`
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function DetailBadge({ label, value, variant = 'default' }: { label: string; value: string; variant?: 'default' | 'from' | 'to' }) {
  const variantClass = {
    default: 'bg-muted/60 text-muted-foreground',
    from: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    to: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  }[variant]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', variantClass)}>
      <span className="opacity-60">{label}:</span> {value}
    </span>
  )
}

function AuditDetails({ details }: { details: Record<string, unknown> }) {
  if (!details) return null

  const elements: React.ReactNode[] = []

  if (details.userName) {
    elements.push(
      <span key="user" className="inline-flex items-center gap-1 text-xs">
        <UserPlus className="h-3 w-3 opacity-50" />
        <span className="font-medium">{String(details.userName)}</span>
      </span>
    )
  }

  if (details.oldRole && details.newRole) {
    elements.push(
      <span key="role" className="inline-flex items-center gap-1.5 text-xs">
        <DetailBadge label="Было" value={ROLE_LABELS[String(details.oldRole)] || String(details.oldRole)} variant="from" />
        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
        <DetailBadge label="Стало" value={ROLE_LABELS[String(details.newRole)] || String(details.newRole)} variant="to" />
      </span>
    )
  }

  if (details.oldStatus && details.newStatus) {
    elements.push(
      <span key="status" className="inline-flex items-center gap-1.5 text-xs">
        <DetailBadge label="Было" value={STATUS_LABELS[String(details.oldStatus)] || String(details.oldStatus)} variant="from" />
        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
        <DetailBadge label="Стало" value={STATUS_LABELS[String(details.newStatus)] || String(details.newStatus)} variant="to" />
      </span>
    )
  }

  if (details.name) {
    elements.push(
      <span key="name" className="text-xs font-medium px-2 py-0.5 rounded bg-muted/60">
        {String(details.name)}
      </span>
    )
  }

  if (details.updatedFields && Array.isArray(details.updatedFields)) {
    elements.push(
      <span key="fields" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        Изменено полей: <span className="font-medium text-foreground">{details.updatedFields.length}</span>
      </span>
    )
  }

  if (details.count !== undefined) {
    elements.push(
      <span key="count" className="text-xs text-muted-foreground">
        Записей обновлено: <span className="font-medium text-foreground">{String(details.count)}</span>
      </span>
    )
  }

  if (elements.length === 0) {
    return <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{JSON.stringify(details)}</p>
  }

  return <div className="flex items-center gap-2 flex-wrap mt-1.5">{elements}</div>
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  inactive: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  on_leave: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  on_leave: 'В отпуске',
}

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('users')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)

  const filteredGroups = TAB_GROUPS
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => !tab.module || isModuleEnabled(tab.module)),
    }))
    .filter((group) => group.tabs.length > 0)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/stats`, { headers: getAuthHeaders() })
      if (res.ok) setStats(await res.json())
    } catch {}
  }

  const allTabs = filteredGroups.flatMap((g) => g.tabs)
  const activeTabInfo = allTabs.find((t) => t.id === activeTab)

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-card/5 rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-6 w-6 text-white/80" />
            <h1 className="text-2xl font-bold text-white">Администрирование</h1>
          </div>
          <p className="text-sm text-white/60">Управление ролями, доступами и настройками системы</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <nav className="space-y-3">
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-3 mb-1.5">{group.label}</p>
              <div className="space-y-0.5 bg-card rounded-xl border border-border/40 p-1.5">
                {group.tabs.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
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
          {activeTabInfo && (
            <div className="flex items-center gap-3 mb-4">
              <div className={cn('p-2 rounded-xl bg-gradient-to-br text-white', activeTabInfo.color)}>
                <activeTabInfo.icon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{activeTabInfo.name}</h2>
                <p className="text-xs text-muted-foreground">{activeTabInfo.description}</p>
              </div>
            </div>
          )}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'roles' && <RolesTab />}
          {activeTab === 'departments' && <DepartmentsTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'audit' && <AuditTab />}
          {activeTab === 'analytics' && <AnalyticsTab />}
          {activeTab === 'health' && <HealthTab />}
          {activeTab === 'errors' && <ErrorsTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'reports' && <ReportsTab />}
          {activeTab === 'dictionaries' && <DictionariesTab />}
          {activeTab === 'modules' && <ModulesTab />}
          {activeTab === 'assistant' && <AssistantSettingsTab />}
        </div>
      </div>
    </div>
  )
}

// ===================== USERS TAB =====================

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [bulkRole, setBulkRole] = useState('')
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null)

  useEffect(() => { fetchRoles() }, [])

  useEffect(() => { fetchUsers() }, [page, search, filterRole])

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/roles`, { headers: getAuthHeaders() })
      if (res.ok) setRoles(await res.json())
    } catch {}
  }

  const fetchUsers = async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      if (search) params.set('search', search)
      if (filterRole) params.set('role', filterRole)
      const res = await fetch(`${API_BASE_URL}/admin/users?${params}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users); setTotal(data.total)
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  const changeRole = async (userId: number, role: string) => {
    const user = users.find(u => u.id === userId)
    const confirmed = await confirmDialog({
      title: 'Изменить роль',
      message: `Изменить роль ${user?.first_name} ${user?.last_name} на «${ROLE_LABELS[role] || role}»?`,
      confirmText: 'Изменить',
    })
    if (!confirmed) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/role`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
        if (detailUser?.id === userId) setDetailUser(prev => prev ? { ...prev, role } : null)
      } else {
        const data = await res.json(); setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const changeStatus = async (userId: number, status: string) => {
    const user = users.find(u => u.id === userId)
    const confirmed = await confirmDialog({
      title: status === 'active' ? 'Активировать' : 'Деактивировать',
      message: `${status === 'active' ? 'Активировать' : 'Деактивировать'} ${user?.first_name} ${user?.last_name}?`,
      confirmText: status === 'active' ? 'Активировать' : 'Деактивировать',
      danger: status === 'inactive',
    })
    if (!confirmed) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/status`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: status as AdminUser['status'] } : u))
        if (detailUser?.id === userId) setDetailUser(prev => prev ? { ...prev, status: status as AdminUser['status'] } : null)
      }
    } catch {}
  }

  const resetPassword = async (userId: number, newPassword: string) => {
    if (!newPassword || newPassword.length < 6) { setError('Пароль минимум 6 символов'); return }
    const confirmed = await confirmDialog({ title: 'Сбросить пароль', message: 'Установить новый пароль для этого пользователя?', confirmText: 'Сбросить', danger: true })
    if (!confirmed) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/reset-password`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ newPassword }),
      })
      if (res.ok) fetchUsers()
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const totalPages = Math.ceil(total / 25)

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  const toggleAll = () => {
    if (selectedIds.size === users.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(users.map(u => u.id)))
  }

  const executeBulkAction = async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const confirmed = await confirmDialog({
      title: 'Массовое действие',
      message: `Применить к ${ids.length} сотрудникам?`,
      confirmText: 'Применить',
    })
    if (!confirmed) return
    try {
      if (bulkAction === 'activate') {
        const res = await fetch(`${API_BASE_URL}/admin/users/bulk-status`, {
          method: 'PUT', headers: getAuthHeadersWithContentType(),
          body: JSON.stringify({ userIds: ids, status: 'active' }),
        })
        if (res.ok) { setSelectedIds(new Set()); fetchUsers() }
        else { const d = await res.json(); setError(d.error) }
      } else if (bulkAction === 'deactivate') {
        const res = await fetch(`${API_BASE_URL}/admin/users/bulk-status`, {
          method: 'PUT', headers: getAuthHeadersWithContentType(),
          body: JSON.stringify({ userIds: ids, status: 'inactive' }),
        })
        if (res.ok) { setSelectedIds(new Set()); fetchUsers() }
        else { const d = await res.json(); setError(d.error) }
      } else if (bulkAction === 'setRole' && bulkRole) {
        const res = await fetch(`${API_BASE_URL}/admin/users/bulk-role`, {
          method: 'PUT', headers: getAuthHeadersWithContentType(),
          body: JSON.stringify({ userIds: ids, role: bulkRole }),
        })
        if (res.ok) { setSelectedIds(new Set()); setBulkAction(''); setBulkRole(''); fetchUsers() }
        else { const d = await res.json(); setError(d.error) }
      }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const exportUsers = () => { window.open(`${API_BASE_URL}/admin/users/export`, '_blank') }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Поиск по имени, email, должности..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }} className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
            <option value="">Все роли</option>
            {roles.map(r => <option key={r.id} value={r.name}>{ROLE_LABELS[r.name] || r.name}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={exportUsers}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Экспорт
          </Button>
        </div>
      </div>

      <div className={cn(
        'flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20 transition-all',
        selectedIds.size > 0 ? 'opacity-100 h-auto' : 'opacity-0 h-0 p-0 border-0 overflow-hidden',
      )}>
        <span className="text-sm font-medium">Выбрано: {selectedIds.size}</span>
        <select value={bulkAction} onChange={e => setBulkAction(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm">
          <option value="">Действие...</option>
          <option value="activate">Активировать</option>
          <option value="deactivate">Деактивировать</option>
          <option value="setRole">Изменить роль</option>
        </select>
        {bulkAction === 'setRole' && (
          <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm">
            <option value="">Выберите роль...</option>
            {roles.map(r => <option key={r.id} value={r.name}>{ROLE_LABELS[r.name] || r.name}</option>)}
          </select>
        )}
        <Button size="sm" onClick={executeBulkAction} disabled={!bulkAction || (bulkAction === 'setRole' && !bulkRole)}>Применить</Button>
        <Button variant="ghost" size="sm" onClick={() => { setSelectedIds(new Set()); setBulkAction(''); setBulkRole('') }}><X className="h-4 w-4" /></Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <div
              role="checkbox"
              aria-checked={selectedIds.size === users.length && users.length > 0}
              tabIndex={0}
              className={cn(
                'h-[18px] w-[18px] rounded-md flex items-center justify-center shrink-0 border-2 transition-colors',
                selectedIds.size === users.length && users.length > 0
                  ? 'bg-primary border-primary'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/40',
              )}
              onClick={toggleAll}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAll() } }}
            >
              {selectedIds.size === users.length && users.length > 0 && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
            </div>
            <span>Выбрать всех на странице</span>
            <span className="ml-auto">{total} сотрудников</span>
          </div>
          <div className="space-y-1">
            {users.map(user => {
              const fullName = `${user.last_name} ${user.first_name}${user.middle_name ? ' ' + user.middle_name : ''}`
              const selected = selectedIds.has(user.id)
              return (
                <div
                  key={user.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border cursor-pointer group',
                    selected
                      ? 'bg-primary/8 border-primary/25'
                      : 'border-transparent hover:bg-muted/40 hover:border-border/50',
                  )}
                  onClick={() => setDetailUser(user)}
                >
                  <div
                    role="checkbox"
                    aria-checked={selected}
                    tabIndex={0}
                    className={cn(
                      'h-[18px] w-[18px] rounded-md flex items-center justify-center shrink-0 border-2 transition-colors',
                      selected
                        ? 'bg-primary border-primary'
                        : 'border-muted-foreground/25 group-hover:border-muted-foreground/40',
                    )}
                    onClick={e => { e.stopPropagation(); toggleSelect(user.id) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSelect(user.id) } }}
                  >
                    {selected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                  </div>
                  <div className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors',
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary',
                  )}>
                    {user.first_name?.[0]}{user.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{fullName}</span>
                      <Badge className={cn('text-[10px]', STATUS_COLORS[user.status])}>{STATUS_LABELS[user.status]}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="truncate">{user.position || user.email}</span>
                      {user.department_name && <span>· {user.department_name}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Показано {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} из {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {detailUser && (
        <UserDetailModal
          user={detailUser}
          roles={roles}
          onClose={() => setDetailUser(null)}
          onChangeRole={(role) => { changeRole(detailUser.id, role) }}
          onChangeStatus={(status) => { changeStatus(detailUser.id, status) }}
          onResetPassword={(pwd) => { resetPassword(detailUser.id, pwd) }}
        />
      )}
    </div>
  )
}

function UserDetailModal({ user, roles, onClose, onChangeRole, onChangeStatus, onResetPassword }: {
  user: AdminUser
  roles: AdminRole[]
  onClose: () => void
  onChangeRole: (role: string) => void
  onChangeStatus: (status: string) => void
  onResetPassword: (password: string) => void
}) {
  const [activeSection, setActiveSection] = useState<'info' | 'edit' | 'role' | 'password'>('info')
  const [newPassword, setNewPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState(user.role)
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([])
  const [editForm, setEditForm] = useState({
    position: user.position || '',
    department_id: user.department_id ?? '',
    phone: user.phone || '',
    office: user.office || '',
    cabinet: user.cabinet || '',
  })
  const [saving, setSaving] = useState(false)
  const [showDeptPicker, setShowDeptPicker] = useState(false)
  const [showPositionPicker, setShowPositionPicker] = useState(false)
  const [positions, setPositions] = useState<string[]>([])
  const fullName = `${user.last_name} ${user.first_name}${user.middle_name ? ' ' + user.middle_name : ''}`

  useEffect(() => {
    fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setDepartments(data.departments || data))
      .catch(() => {})
    fetch(`${API_BASE_URL}/dictionaries/positions`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setPositions((Array.isArray(data) ? data : data.positions || []).map((p: { name: string }) => p.name)))
      .catch(() => {})
  }, [])

  const saveEdit = async () => {
    const confirmed = await confirmDialog({ title: 'Сохранить изменения', message: `Обновить данные ${user.first_name} ${user.last_name}?`, confirmText: 'Сохранить' })
    if (!confirmed) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        position: editForm.position,
        phone: editForm.phone,
        office: editForm.office,
        cabinet: editForm.cabinet,
      }
      if (editForm.department_id !== '') body.department_id = Number(editForm.department_id)
      else body.department_id = null
      const res = await fetch(`${API_BASE_URL}/admin/users/${user.id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (res.ok) {
        onClose()
      } else {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка')
      }
    } catch (err) {
      alert(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col border border-border" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-lg font-bold text-primary shrink-0">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-lg">{fullName}</h3>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={cn('text-[10px]', STATUS_COLORS[user.status])}>{STATUS_LABELS[user.status]}</Badge>
                <Badge className="text-[10px] bg-primary/10 text-primary">{ROLE_LABELS[user.role] || user.role}</Badge>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex border-b border-border">
          {([
            { id: 'info' as const, name: 'Профиль', icon: Users },
            { id: 'edit' as const, name: 'Изменить', icon: Pencil },
            { id: 'role' as const, name: 'Роль', icon: ShieldCheck },
            { id: 'password' as const, name: 'Пароль', icon: Lock },
          ]).map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors',
                  activeSection === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeSection === 'info' && (
            <div className="space-y-4">
              <InfoRow label="Должность" value={user.position || '—'} />
              <InfoRow label="Отдел" value={user.department_name || '—'} />
              <InfoRow label="Телефон" value={user.phone || '—'} />
              <InfoRow label="Дата приёма" value={user.hire_date || '—'} />
              {user.manager_first_name && (
                <InfoRow label="Руководитель" value={`${user.manager_last_name} ${user.manager_first_name}`} />
              )}
              <div className="pt-2 flex gap-2">
                <Button
                  size="sm"
                  variant={user.status === 'active' ? 'outline' : 'default'}
                  onClick={() => onChangeStatus(user.status === 'active' ? 'inactive' : 'active')}
                >
                  {user.status === 'active' ? (
                    <><Lock className="h-3.5 w-3.5 mr-1.5" />Деактивировать</>
                  ) : (
                    <><Unlock className="h-3.5 w-3.5 mr-1.5" />Активировать</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {activeSection === 'edit' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Должность</label>
                <button
                  onClick={() => setShowPositionPicker(true)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className={editForm.position ? 'text-foreground' : 'text-muted-foreground'}>
                      {editForm.position || 'Выбрать должность...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {editForm.position && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={e => { e.stopPropagation(); setEditForm(f => ({ ...f, position: '' })) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setEditForm(f => ({ ...f, position: '' })) } }}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Отдел</label>
                <button
                  onClick={() => setShowDeptPicker(true)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className={editForm.department_id ? 'text-foreground' : 'text-muted-foreground'}>
                      {editForm.department_id ? departments.find(d => d.id === Number(editForm.department_id))?.name || 'Отдел' : 'Выбрать отдел...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {editForm.department_id && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={e => { e.stopPropagation(); setEditForm(f => ({ ...f, department_id: '' })) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setEditForm(f => ({ ...f, department_id: '' })) } }}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Телефон</label>
                <Input
                  placeholder="+7 (___) ___-__-__"
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Офис</label>
                  <Input
                    placeholder="Адрес офиса"
                    value={editForm.office}
                    onChange={e => setEditForm(f => ({ ...f, office: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Кабинет</label>
                  <Input
                    placeholder="Номер кабинета"
                    value={editForm.cabinet}
                    onChange={e => setEditForm(f => ({ ...f, cabinet: e.target.value }))}
                  />
                </div>
              </div>
              <Button onClick={saveEdit} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                Сохранить
              </Button>
            </div>
          )}

          {activeSection === 'role' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Текущая роль: <span className="font-medium text-foreground">{ROLE_LABELS[user.role] || user.role}</span></p>
              <div className="space-y-1.5">
                {roles.map(r => {
                  const isSelected = selectedRole === r.name
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRole(r.name)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left',
                        isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/30 border border-transparent',
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                        isSelected ? 'border-primary' : 'border-border',
                      )}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{ROLE_LABELS[r.name] || r.name}</p>
                        {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
              {selectedRole !== user.role && (
                <Button onClick={() => onChangeRole(selectedRole)} className="w-full">
                  <ShieldCheck className="h-4 w-4 mr-1.5" />Изменить на «{ROLE_LABELS[selectedRole] || selectedRole}»
                </Button>
              )}
            </div>
          )}

          {activeSection === 'password' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center gap-2 text-amber-600 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Внимание
                </div>
                <p className="text-xs text-muted-foreground mt-1">Пароль будет немедленно изменён. Пользователю потребуется войти заново.</p>
              </div>
              <Input
                type="password"
                placeholder="Новый пароль (минимум 6 символов)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              <Button onClick={() => { onResetPassword(newPassword); setNewPassword('') }} disabled={newPassword.length < 6} className="w-full" variant="destructive">
                <RotateCcw className="h-4 w-4 mr-1.5" />Сбросить пароль
              </Button>
            </div>
          )}
        </div>
      </div>

      {showDeptPicker && (
        <DepartmentPickerModal
          departments={departments}
          selectedId={editForm.department_id ? Number(editForm.department_id) : null}
          onSelect={id => { setEditForm(f => ({ ...f, department_id: id ?? '' })); setShowDeptPicker(false) }}
          onClose={() => setShowDeptPicker(false)}
        />
      )}
      {showPositionPicker && (
        <PositionPickerModal
          positions={positions}
          selected={editForm.position}
          onSelect={pos => { setEditForm(f => ({ ...f, position: pos })); setShowPositionPicker(false) }}
          onClose={() => setShowPositionPicker(false)}
        />
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

// ===================== ROLES TAB =====================

function RolesTab() {
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null)
  const [editPerms, setEditPerms] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/roles`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/admin/permissions`, { headers: getAuthHeaders() }),
      ])
      if (rolesRes.ok) setRoles(await rolesRes.json())
      if (permsRes.ok) setPermissions(await permsRes.json())
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  const modules = [...new Set(permissions.map((p) => p.module))].sort()

  const createRole = async () => {
    if (!newName.trim()) { setError('Название обязательно'); return }
    try {
      const res = await fetch(`${API_BASE_URL}/admin/roles`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      })
      if (res.ok) {
        setShowCreate(false); setNewName(''); setNewDesc(''); fetchData()
      } else {
        const data = await res.json(); setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deleteRole = async (id: number) => {
    if (!await confirmDialog({ title: 'Удаление роли', message: 'Удалить эту роль?', confirmText: 'Удалить', variant: 'danger' })) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/roles/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      if (res.ok) fetchData()
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const savePermissions = async () => {
    if (!editingRole) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/roles/${editingRole.id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ permissionIds: editPerms }),
      })
      if (res.ok) { setEditingRole(null); fetchData() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const togglePerm = (pid: number) => {
    setEditPerms((prev) => prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid])
  }

  const toggleModule = (module: string) => {
    const modulePermIds = permissions.filter((p) => p.module === module).map((p) => p.id)
    const allSelected = modulePermIds.every((id) => editPerms.includes(id))
    if (allSelected) {
      setEditPerms((prev) => prev.filter((id) => !modulePermIds.includes(id)))
    } else {
      setEditPerms((prev) => [...new Set([...prev, ...modulePermIds])])
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (editingRole) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> Настройка доступов: {ROLE_LABELS[editingRole.name] || editingRole.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <Button onClick={savePermissions}><Check className="h-4 w-4 mr-1" /> Сохранить</Button>
            <Button variant="outline" onClick={() => setEditingRole(null)}>Отмена</Button>
          </div>

          {modules.map((mod) => {
            const modPerms = permissions.filter((p) => p.module === mod)
            const allSelected = modPerms.every((p) => editPerms.includes(p.id))
            return (
              <div key={mod} className="border border-border/50 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Switch checked={allSelected} onCheckedChange={() => toggleModule(mod)} />
                  <span className="font-medium capitalize">{mod}</span>
                  <span className="text-xs text-muted-foreground">
                    ({modPerms.filter((p) => editPerms.includes(p.id)).length}/{modPerms.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-9">
                  {modPerms.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-muted/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editPerms.includes(perm.id)}
                        onChange={() => togglePerm(perm.id)}
                        className="rounded border-border"
                      />
                      <span>{perm.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> Роли и доступы</CardTitle>
            <CardDescription>Управление ролями и правами доступа</CardDescription>
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Новая роль</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {showCreate && (
          <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5">
            <Input placeholder="Название роли" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Описание" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <Button onClick={createRole}>Создать</Button>
            <Button variant="outline" onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}>Отмена</Button>
          </div>
        )}

        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:border-border transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color || '#6366f1' }} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ROLE_LABELS[role.name] || role.name}</span>
                    {role.is_system && (
                      <span className="relative group">
                        <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 cursor-help">Системная</Badge>
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-popover border border-border text-xs text-popover-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-normal w-56 text-center z-50">
                          Встроенная роль для работы системы. Нельзя удалить, но можно настроить доступы.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
                        </span>
                      </span>
                    )}
                  </div>
                  {role.description && <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{role.permissions.length} разрешений</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditingRole(role); setEditPerms(role.permissions.map((p) => p.id)) }}>
                  <Edit3 className="h-3.5 w-3.5 mr-1" /> Доступы
                </Button>
                {!role.is_system && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => deleteRole(role.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ===================== DEPARTMENTS TAB =====================

function DepartmentsTab() {
  const [departments, setDepartments] = useState<{ id: number; name: string; manager_id: number | null; manager_name: string | null; employee_count: string; vacation_requests_blocked: boolean; description: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchDepartments() }, [])

  const fetchDepartments = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      if (res.ok) setDepartments(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newManagerId, setNewManagerId] = useState<number | null>(null)
  const [newManagerName, setNewManagerName] = useState('')
  const [showPicker, setShowPicker] = useState<'create' | number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editManagerId, setEditManagerId] = useState<number | null>(null)
  const [editManagerName, setEditManagerName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)

  const createDept = async () => {
    if (!newName.trim()) { setError('Название обязательно'); return }
    const confirmed = await confirmDialog({ title: 'Создать отдел', message: `Создать отдел «${newName.trim()}»?`, confirmText: 'Создать' })
    if (!confirmed) return
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/departments`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), manager_id: newManagerId }),
      })
      if (res.ok) { setShowCreate(false); setNewName(''); setNewDesc(''); setNewManagerId(null); setNewManagerName(''); fetchDepartments() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const updateDept = async (id: number) => {
    const confirmed = await confirmDialog({ title: 'Сохранить изменения', message: `Сохранить изменения для отдела «${editName.trim()}»?`, confirmText: 'Сохранить' })
    if (!confirmed) return
    try {
      const body: Record<string, unknown> = { name: editName.trim(), description: editDesc.trim() }
      if (editManagerId) body.manager_id = editManagerId
      else body.manager_id = null
      const res = await fetch(`${API_BASE_URL}/dictionaries/departments/${id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (res.ok) { setEditingId(null); fetchDepartments() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deleteDept = async (id: number, name: string) => {
    const confirmed = await confirmDialog({ title: 'Удалить отдел', message: `Удалить отдел «${name}»? Сотрудники будут отвязаны от отдела.`, confirmText: 'Удалить', danger: true })
    if (!confirmed) return
    try {
      await fetch(`${API_BASE_URL}/dictionaries/departments/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchDepartments()
    } catch {}
  }

  const startEdit = (dept: typeof departments[0]) => {
    setEditingId(dept.id)
    setEditName(dept.name)
    setEditDesc(dept.description || '')
    setEditManagerId(dept.manager_id)
    setEditManagerName(dept.manager_name || '')
  }

  const pickUser = (userId: number, userName: string) => {
    if (showPicker === 'create') {
      setNewManagerId(userId)
      setNewManagerName(userName)
    } else if (typeof showPicker === 'number') {
      setEditManagerId(userId)
      setEditManagerName(userName)
    }
    setShowPicker(null)
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          {departments.length} {departments.length === 1 ? 'отдел' : 'отделов'}
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Новый отдел</Button>
      </div>

      {showCreate && (
        <Card className="border-dashed border-primary/40">
          <CardContent className="pt-5 space-y-3">
            <Input placeholder="Название отдела" value={newName} onChange={e => setNewName(e.target.value)} />
            <Input placeholder="Описание (необязательно)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">Руководитель:</span>
              <button
                onClick={() => setShowPicker('create')}
                className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background text-sm hover:bg-muted/30 transition-colors"
              >
                <span className={newManagerName ? 'text-foreground' : 'text-muted-foreground'}>
                  {newManagerName || 'Выбрать руководителя...'}
                </span>
                {newManagerId && (
                  <button onClick={e => { e.stopPropagation(); setNewManagerId(null); setNewManagerName('') }} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </button>
            </div>
            <div className="flex gap-2">
              <Button onClick={createDept} disabled={!newName.trim()}>Создать</Button>
              <Button variant="outline" onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); setNewManagerId(null); setNewManagerName('') }}>Отмена</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {departments.map((dept) => (
          <Card key={dept.id} className="group relative">
            <CardContent className="pt-5">
              {editingId === dept.id ? (
                <div className="space-y-3">
                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Название" />
                  <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Описание" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">Рук.:</span>
                    <button
                      onClick={() => setShowPicker(dept.id)}
                      className="flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm hover:bg-muted/30 transition-colors"
                    >
                      <span className={editManagerName ? 'text-foreground' : 'text-muted-foreground'}>
                        {editManagerName || 'Выбрать...'}
                      </span>
                      {editManagerId && (
                        <button onClick={e => { e.stopPropagation(); setEditManagerId(null); setEditManagerName('') }} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateDept(dept.id)}><Check className="h-3.5 w-3.5 mr-1" />Сохранить</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Отмена</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{dept.name}</h3>
                      {dept.description && <p className="text-xs text-muted-foreground mt-0.5">{dept.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(dept)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteDept(dept.id, dept.name)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn(
                      'p-1.5 rounded-lg',
                      dept.manager_name ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground',
                    )}>
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{dept.manager_name || 'Без руководителя'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge className="text-[10px]">{dept.employee_count} чел.</Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {departments.length === 0 && !showCreate && (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <Building2 className="h-10 w-10 opacity-20" />
          <p className="text-sm">Нет отделов</p>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5 mr-1" />Создать первый</Button>
        </div>
      )}

      {showPicker !== null && (
        <UserPickerModal
          onSelect={pickUser}
          onClose={() => setShowPicker(null)}
        />
      )}
    </div>
  )
}

function DepartmentPickerModal({ departments, selectedId, onSelect, onClose }: {
  departments: { id: number; name: string }[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = departments.filter(d => {
    if (!search.trim()) return true
    return d.name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col border border-border" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Выбор отдела</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Поиск отдела..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <button
            onClick={() => onSelect(null)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
              selectedId === null ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/40',
            )}
          >
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <X className="h-4 w-4" />
            </div>
            <span className="text-sm text-muted-foreground">Без отдела</span>
          </button>
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">{search ? 'Ничего не найдено' : 'Нет отделов'}</div>
          ) : (
            <div className="space-y-0.5 mt-1">
              {filtered.map(d => (
                <button
                  key={d.id}
                  onClick={() => onSelect(d.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                    selectedId === d.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/40',
                  )}
                >
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center text-blue-600 shrink-0">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{d.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {search && (
          <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
            Найдено: {filtered.length} из {departments.length}
          </div>
        )}
      </div>
    </div>
  )
}

function PositionPickerModal({ positions, selected, onSelect, onClose }: {
  positions: string[]
  selected: string
  onSelect: (position: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = positions.filter(p => {
    if (!search.trim()) return true
    return p.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col border border-border" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Выбор должности</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Поиск должности..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search ? 'Ничего не найдено' : 'Нет должностей'}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(pos => (
                <button
                  key={pos}
                  onClick={() => onSelect(pos)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                    selected === pos ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/40',
                  )}
                >
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-500/5 flex items-center justify-center text-violet-600 shrink-0">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{pos}</span>
                  {selected === pos && <Check className="h-4 w-4 text-primary ml-auto" />}
                </button>
              ))}
            </div>
          )}
        </div>
        {search && (
          <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
            Найдено: {filtered.length} из {positions.length}
          </div>
        )}
      </div>
    </div>
  )
}

function UserPickerModal({ onSelect, onClose }: { onSelect: (id: number, name: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<{ id: number; first_name: string; last_name: string; email: string; position: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const inputRef = useState<HTMLInputElement | null>(null)[0]

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE_URL}/admin/users?limit=1000`, { headers: getAuthHeaders() })
        if (res.ok) {
          const data = await res.json()
          setUsers(data.users || [])
        }
      } catch {} finally { setLoading(false) }
    }
    fetchUsers()
  }, [])

  const filtered = users.filter(u => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return `${u.last_name} ${u.first_name} ${u.email} ${u.position || ''}`.toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col border border-border" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Выбор сотрудника</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef as any}
              autoFocus
              placeholder="Поиск по имени, email, должности..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search ? 'Ничего не найдено' : 'Нет сотрудников'}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(u => {
                const fullName = `${u.last_name} ${u.first_name}`
                return (
                  <button
                    key={u.id}
                    onClick={() => onSelect(u.id, fullName)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors text-left"
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {u.first_name?.[0]}{u.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.position || u.email}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {search && (
          <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
            Найдено: {filtered.length} из {users.length}
          </div>
        )}
      </div>
    </div>
  )
}

// ===================== SETTINGS TAB =====================

function SettingsTab() {
  const [settings, setSettings] = useState<SystemSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [tsCreating, setTsCreating] = useState(false)
  const [tsResult, setTsResult] = useState<string | null>(null)

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings`, { headers: getAuthHeaders() })
      if (res.ok) setSettings(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const saveSettings = async () => {
    setSaving(true); setError(null); setSuccess(false)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ settings: settings.map((s) => ({ key: s.key, value: s.value })) }),
      })
      if (res.ok) setSuccess(true)
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  const updateValue = (key: string, value: string) => {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))
  }

  const handleAutoCreateTimesheets = async () => {
    setTsCreating(true)
    setTsResult(null)
    setError(null)
    try {
      const now = new Date()
      const res = await fetch(`${API_BASE_URL}/timesheet/auto-create`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ year: now.getFullYear(), month: now.getMonth() + 1 }),
      })
      const data = await res.json()
      if (res.ok || res.status === 201) {
        setTsResult(data.message || `Создано: ${data.created}`)
      } else {
        setError(data.error || 'Ошибка')
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setTsCreating(false)
    }
  }

  const tsAutoEnabled = settings.find(s => s.key === 'timesheet_auto_create')
  const tsAutoOn = tsAutoEnabled?.value === 'true'

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Системные настройки</CardTitle>
          <CardDescription>Глобальные параметры приложения</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-sm">
              <Check className="h-4 w-4 shrink-0" /> Настройки сохранены
            </div>
          )}

          <div className="grid gap-4">
            {settings.map((setting) => {
              const isBoolean = setting.value === 'true' || setting.value === 'false'
              return (
              <div key={setting.key} className="flex flex-col sm:flex-row sm:items-center gap-2 p-4 rounded-xl border border-border/50">
                <div className="flex-1">
                  <p className="font-medium text-sm">{setting.description || setting.key}</p>
                  <p className="text-xs text-muted-foreground font-mono">{setting.key}</p>
                </div>
                {isBoolean ? (
                  <Switch
                    checked={setting.value === 'true'}
                    onCheckedChange={(checked) => updateValue(setting.key, String(checked))}
                  />
                ) : (
                  <Input
                    value={setting.value}
                    onChange={(e) => updateValue(setting.key, e.target.value)}
                    className="sm:w-64"
                  />
                )}
              </div>
              )
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Табели
          </CardTitle>
          <CardDescription>Автоматическое создание табелей рабочего времени</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50">
            <div>
              <p className="font-medium text-sm">Автосоздание табелей</p>
              <p className="text-xs text-muted-foreground">Автоматически создавать табели для всех отделов за текущий месяц при первом обращении</p>
            </div>
            <Switch
              checked={tsAutoOn}
              onCheckedChange={(checked) => {
                if (tsAutoEnabled) {
                  updateValue('timesheet_auto_create', String(checked))
                } else {
                  setSettings(prev => [...prev, { key: 'timesheet_auto_create', value: String(checked), description: 'Автосоздание табелей', updated_at: '' }])
                }
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleAutoCreateTimesheets} disabled={tsCreating} variant={tsAutoOn ? 'default' : 'outline'}>
              {tsCreating ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Создание...</>
              ) : (
                <><Zap className="h-4 w-4 mr-1.5" /> Создать табели за текущий месяц</>
              )}
            </Button>
            {tsResult && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">{tsResult}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ===================== ASSISTANT SETTINGS TAB =====================

function AssistantSettingsTab() {
  const [settings, setSettings] = useState<SystemSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings`, { headers: getAuthHeaders() })
      if (res.ok) {
        const all = await res.json()
        setSettings(all.filter((s: SystemSetting) => s.key.startsWith('assistant_')))
      }
    } catch {} finally { setLoading(false) }
  }

  const saveSettings = async () => {
    setSaving(true); setError(null); setSuccess(false)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ settings: settings.map((s) => ({ key: s.key, value: s.value })) }),
      })
      if (res.ok) setSuccess(true)
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  const updateValue = (key: string, value: string) => {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))
  }

  const configured = settings.some(s => s.key === 'assistant_api_url' && s.value) && settings.some(s => s.key === 'assistant_api_key' && s.value)

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> Настройки AI-ассистента
          </CardTitle>
          <CardDescription>
            Подключение OpenAI-совместимого API для чат-бота в разделе "Ассистент"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-sm">
              <Check className="h-4 w-4 shrink-0" /> Настройки сохранены
            </div>
          )}

          <div className="grid gap-4">
            {settings.map((setting) => {
              const isKey = setting.key === 'assistant_api_key'
              const isPrompt = setting.key === 'assistant_system_prompt'
              return (
                <div key={setting.key} className="flex flex-col sm:flex-row sm:items-start gap-2 p-4 rounded-xl border border-border/50">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{setting.description || setting.key}</p>
                    <p className="text-xs text-muted-foreground font-mono">{setting.key}</p>
                  </div>
                  {isKey ? (
                    <Input
                      type="password"
                      value={setting.value}
                      onChange={(e) => updateValue(setting.key, e.target.value)}
                      placeholder="sk-..."
                      className="sm:w-80"
                    />
                  ) : isPrompt ? (
                    <textarea
                      value={setting.value}
                      onChange={(e) => updateValue(setting.key, e.target.value)}
                      rows={3}
                      className="sm:w-96 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  ) : (
                    <Input
                      value={setting.value}
                      onChange={(e) => updateValue(setting.key, e.target.value)}
                      className="sm:w-80"
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 text-sm ${configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <div className={`w-2 h-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {configured ? 'Подключено' : 'Не настроено — заполните API URL и API ключ'}
            </div>
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ===================== AUDIT TAB =====================

function AuditTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => { fetchLogs() }, [page, filterAction, dateFrom, dateTo])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      if (filterAction) params.set('action', filterAction)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`${API_BASE_URL}/admin/audit-log?${params}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
      }
    } catch {} finally { setLoading(false) }
  }

  const totalPages = Math.ceil(total / 25)
  const now = Date.now()
  const todayCount = logs.filter(l => (now - new Date(l.created_at).getTime()) < 86400000).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <ScrollText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{total}</p>
              <p className="text-[11px] text-muted-foreground">Всего записей</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{todayCount}</p>
              <p className="text-[11px] text-muted-foreground">Сегодня</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{new Set(logs.map(l => l.user_id).filter(Boolean)).size}</p>
              <p className="text-[11px] text-muted-foreground">Активных пользователей</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{new Set(logs.map(l => l.action)).size}</p>
              <p className="text-[11px] text-muted-foreground">Типов действий</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> Журнал аудита</CardTitle>
              <CardDescription>История действий в системе</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchLogs()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Eye className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm appearance-none"
              >
                <option value="">Все типы действий</option>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">с</span>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="w-36" />
              <span className="text-xs text-muted-foreground">по</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="w-36" />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Загрузка журнала...</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ScrollText className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Нет записей</p>
              <p className="text-xs mt-1">Попробуйте изменить фильтры</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-px bg-border/50" />
              <div className="space-y-1">
                {logs.map((log) => {
                  const config = ACTION_CONFIG[log.action] || { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted/50' }
                  const Icon = config.icon
                  const isExpanded = expandedId === log.id
                  const logDate = new Date(log.created_at)

                  return (
                    <div
                      key={log.id}
                      className={cn(
                        'relative flex items-start gap-4 p-4 rounded-xl transition-all cursor-pointer group',
                        isExpanded ? 'bg-muted/30 border border-border/50' : 'hover:bg-muted/15',
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <div className={cn(
                        'relative z-10 mt-0.5 p-2 rounded-xl border-2 border-background shadow-sm transition-transform group-hover:scale-110',
                        config.bg,
                      )}>
                        <Icon className={cn('h-4 w-4', config.color)} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('font-semibold text-sm', config.color)}>
                              {ACTION_LABELS[log.action] || log.action}
                            </span>
                            {log.entity_type && (
                              <Badge className={cn('text-[10px]', config.bg, config.color)}>
                                {ENTITY_LABELS[log.entity_type] || log.entity_type}
                                {log.entity_id ? ` #${log.entity_id}` : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-muted-foreground" title={logDate.toLocaleString('ru-RU')}>
                              {relativeTime(log.created_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          {log.user_name && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-[8px] font-bold text-primary">
                                {log.user_name.charAt(0)}
                              </div>
                              {log.user_name}
                            </span>
                          )}
                          {log.ip_address && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Globe className="h-3 w-3 opacity-50" />
                              {log.ip_address}
                            </span>
                          )}
                        </div>

                        {(isExpanded || log.details) && (
                          <div className={cn(
                            'mt-2 pt-2 border-t border-border/30',
                            !isExpanded && 'opacity-60',
                          )}>
                            {log.details ? (
                              <AuditDetails details={log.details} />
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Нет подробностей</p>
                            )}
                          </div>
                        )}

                        {isExpanded && (
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>ID: {log.id}</span>
                            <span>Полная дата: {logDate.toLocaleString('ru-RU')}</span>
                            {log.user_id && <span>User ID: {log.user_id}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border/30">
              <p className="text-sm text-muted-foreground">
                Показано <span className="font-medium text-foreground">{(page - 1) * 25 + 1}–{Math.min(page * 25, total)}</span> из <span className="font-medium text-foreground">{total}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Назад
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (page <= 3) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = page - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-sm font-medium transition-all',
                          page === pageNum
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/50',
                        )}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Далее <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ===================== ANALYTICS TAB =====================

// ===================== HEALTH TAB =====================

function HealthTab() {
  const [health, setHealth] = useState<{
    database: { version: string; sizeFormatted: string; connections: { state: string; count: string }[]; tables: { table: string; rows: string; size: string }[] }
    server: { uptimeFormatted: string; memory: { rss: string; heapUsed: string; heapTotal: string }; nodeVersion: string; platform: string }
    environment: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchHealth() }, [])

  const fetchHealth = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/health`, { headers: getAuthHeaders() })
      if (res.ok) setHealth(await res.json())
    } catch {} finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!health) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <Database className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">PostgreSQL</p>
              <p className="font-bold">{health.database.version}</p>
              <p className="text-xs text-muted-foreground">Размер: {health.database.sizeFormatted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Node.js {health.server.nodeVersion}</p>
              <p className="font-bold">Uptime: {health.server.uptimeFormatted}</p>
              <p className="text-xs text-muted-foreground">{health.server.platform} | {health.environment}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <HardDrive className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Память (Heap)</p>
              <p className="font-bold">{health.server.memory.heapUsed} / {health.server.memory.heapTotal}</p>
              <p className="text-xs text-muted-foreground">RSS: {health.server.memory.rss}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Подключения к БД</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchHealth}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Обновить</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {health.database.connections.map((c) => (
              <div key={c.state} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30">
                <div className={cn('w-2 h-2 rounded-full', c.state === 'active' ? 'bg-emerald-500' : 'bg-amber-500')} />
                <span className="text-sm capitalize">{c.state}</span>
                <Badge className="text-[10px]">{c.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Таблицы базы данных</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Таблица</th>
                  <th className="pb-2 pr-4 font-medium text-right">Строк</th>
                  <th className="pb-2 font-medium text-right">Размер</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {health.database.tables.map((t) => (
                  <tr key={t.table} className="hover:bg-muted/20">
                    <td className="py-2 pr-4 font-mono text-xs">{t.table}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{parseInt(t.rows).toLocaleString('ru-RU')}</td>
                    <td className="py-2 text-right text-muted-foreground">{t.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ===================== ERRORS TAB =====================

function ErrorsTab() {
  const [errors, setErrors] = useState<{ id: number; message: string; stack: string | null; path: string | null; method: string | null; status_code: number; user_email: string | null; ip: string | null; created_at: string }[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => { fetchErrors() }, [page])

  const fetchErrors = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/error-log?page=${page}&limit=25`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setErrors(data.errors)
        setTotal(data.total)
      }
    } catch {} finally { setLoading(false) }
  }

  const totalPages = Math.ceil(total / 25)
  const statusColor = (code: number) => {
    if (code >= 500) return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
    if (code >= 400) return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30'
    return 'text-muted-foreground bg-muted/50'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Журнал ошибок</CardTitle>
            <CardDescription>Всего: {total}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchErrors}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Обновить</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : errors.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Check className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Ошибок не обнаружено</p>
          </div>
        ) : (
          <div className="space-y-2">
            {errors.map((err) => (
              <div key={err.id} className={cn('p-4 rounded-xl border transition-colors cursor-pointer', expandedId === err.id ? 'border-border bg-muted/10' : 'border-border/30 hover:border-border/60')} onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}>
                <div className="flex items-start gap-3">
                  <Badge className={cn('text-[10px] shrink-0', statusColor(err.status_code || 500))}>
                    {err.status_code || 500}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{err.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {err.method && <span className="font-mono">{err.method}</span>}
                      {err.path && <span className="font-mono truncate">{err.path}</span>}
                      <span>·</span>
                      <span>{new Date(err.created_at).toLocaleString('ru-RU')}</span>
                      {err.user_email && <><span>·</span><span>{err.user_email}</span></>}
                    </div>
                    {expandedId === err.id && err.stack && (
                      <pre className="mt-3 p-3 rounded-lg bg-muted/30 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground max-h-64 overflow-y-auto">
                        {err.stack}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">{(page - 1) * 25 + 1}–{Math.min(page * 25, total)} из {total}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ===================== SECURITY TAB =====================

function SecurityTab() {
  const [failedLogins, setFailedLogins] = useState<{ attempts: { id: number; email: string; ip_address: string; created_at: string }[]; byIp: { ip_address: string; count: string; last_attempt: string }[]; byEmail: { email: string; count: string; last_attempt: string }[] } | null>(null)
  const [lockedAccounts, setLockedAccounts] = useState<{ id: number; email: string; first_name: string; last_name: string; locked_until: string; failed_login_count: number; department: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => { fetchData() }, [days])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [flRes, lockedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/security/failed-logins?days=${days}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/admin/security/locked-accounts`, { headers: getAuthHeaders() }),
      ])
      if (flRes.ok) setFailedLogins(await flRes.json())
      if (lockedRes.ok) setLockedAccounts(await lockedRes.json())
    } catch {} finally { setLoading(false) }
  }

  const unlockAccount = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${id}/unlock`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
      })
      if (res.ok) setLockedAccounts((prev) => prev.filter((a) => a.id !== id))
    } catch {}
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {lockedAccounts.length > 0 && (
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Lock className="h-5 w-5" /> Заблокированные аккаунты ({lockedAccounts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lockedAccounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
                  <div>
                    <p className="font-medium">{a.last_name} {a.first_name}</p>
                    <p className="text-xs text-muted-foreground">{a.email} · Попыток: {a.failed_login_count} · До: {new Date(a.locked_until).toLocaleString('ru-RU')}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => unlockAccount(a.id)}>
                    <Unlock className="h-3.5 w-3.5 mr-1" /> Разблокировать
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Неудачные попытки входа</CardTitle>
              <CardDescription>За последние {days} дней</CardDescription>
            </div>
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm">
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {failedLogins && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">По IP-адресам</h4>
                <div className="space-y-1">
                  {failedLogins.byIp.map((ip) => (
                    <div key={ip.ip_address} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 text-sm">
                      <span className="font-mono text-xs">{ip.ip_address}</span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px]" variant="destructive">{ip.count}</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(ip.last_attempt).toLocaleString('ru-RU')}</span>
                      </div>
                    </div>
                  ))}
                  {failedLogins.byIp.length === 0 && <p className="text-sm text-muted-foreground py-2">Нет данных</p>}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">По email</h4>
                <div className="space-y-1">
                  {failedLogins.byEmail.map((e) => (
                    <div key={e.email} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 text-sm">
                      <span className="font-mono text-xs">{e.email}</span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px]" variant="destructive">{e.count}</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(e.last_attempt).toLocaleString('ru-RU')}</span>
                      </div>
                    </div>
                  ))}
                  {failedLogins.byEmail.length === 0 && <p className="text-sm text-muted-foreground py-2">Нет данных</p>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ===================== REPORTS TAB =====================

type ReportId = 'vacation' | 'hires' | 'turnover' | 'tenure' | 'unused_vacations' | 'project_load'

function ReportsTab() {
  const [vacationYear, setVacationYear] = useState(new Date().getFullYear())
  const [vacationData, setVacationData] = useState<unknown[]>([])
  const [hiresData, setHiresData] = useState<unknown[]>([])
  const [turnoverData, setTurnoverData] = useState<{
    year: number; avgHeadcount: number; totalHired: number; totalFired: number
    turnoverRate: string; monthly: { month: string; hired: number }[]
    byDepartment: { department: string; hired: number; fired: number; active: number }[]
  } | null>(null)
  const [tenureData, setTenureData] = useState<{
    tenureDistribution: { group: string; count: number }[]
    avgTenureYears: string; earliestHire: string | null
    byDepartment: { department: string; count: number; avgYears: number }[]
  } | null>(null)
  const [unusedVacationsData, setUnusedVacationsData] = useState<{
    year: number; totalUnused: number; employeesWithUnused: number
    employees: Record<string, unknown>[]
  } | null>(null)
  const [projectLoadData, setProjectLoadData] = useState<{
    summary: { totalProjects: number; activeProjects: number; totalAssigned: number; activeAssigned: number }
    projects: { id: number; name: string; status: string; memberCount: number; members: { id: number; name: string; role: string }[] }[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeReport, setActiveReport] = useState<ReportId | null>(null)
  const [turnoverYear, setTurnoverYear] = useState(new Date().getFullYear())
  const [unusedYear, setUnusedYear] = useState(new Date().getFullYear())

  const loadVacationReport = async () => {
    setLoading(true); setActiveReport('vacation')
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/vacations?year=${vacationYear}`, { headers: getAuthHeaders() })
      if (res.ok) setVacationData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const loadHiresReport = async () => {
    setLoading(true); setActiveReport('hires')
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/hires`, { headers: getAuthHeaders() })
      if (res.ok) setHiresData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const loadTurnoverReport = async () => {
    setLoading(true); setActiveReport('turnover')
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/turnover?year=${turnoverYear}`, { headers: getAuthHeaders() })
      if (res.ok) setTurnoverData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const loadTenureReport = async () => {
    setLoading(true); setActiveReport('tenure')
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/tenure-age`, { headers: getAuthHeaders() })
      if (res.ok) setTenureData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const loadUnusedVacationsReport = async () => {
    setLoading(true); setActiveReport('unused_vacations')
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/unused-vacations?year=${unusedYear}`, { headers: getAuthHeaders() })
      if (res.ok) setUnusedVacationsData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const loadProjectLoadReport = async () => {
    setLoading(true); setActiveReport('project_load')
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/project-load`, { headers: getAuthHeaders() })
      if (res.ok) setProjectLoadData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const downloadCsv = (endpoint: string) => {
    window.open(`${API_BASE_URL}/admin/reports/${endpoint}&format=csv`, '_blank')
  }

  const reportCards: { id: ReportId; name: string; desc: string; icon: React.ComponentType<{ className?: string }>; bgColor: string; iconColor: string; onClick: () => void }[] = [
    { id: 'vacation', name: 'Отчёт по отпускам', desc: 'Балансы дней, использованные и доступные отпуска', icon: FileText, bgColor: 'bg-amber-100 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-400', onClick: loadVacationReport },
    { id: 'hires', name: 'Отчёт по наймам', desc: 'Сотрудники с датами найма, отделами и руководителями', icon: UserCog, bgColor: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400', onClick: loadHiresReport },
    { id: 'turnover', name: 'Текучесть кадров', desc: 'Коэффициент текучести, наймы и увольнения по отделам', icon: TrendingUp, bgColor: 'bg-red-100 dark:bg-red-900/30', iconColor: 'text-red-600 dark:text-red-400', onClick: loadTurnoverReport },
    { id: 'tenure', name: 'Стаж и распределение', desc: 'Средний стаж, распределение по группам и отделам', icon: Clock3, bgColor: 'bg-violet-100 dark:bg-violet-900/30', iconColor: 'text-violet-600 dark:text-violet-400', onClick: loadTenureReport },
    { id: 'unused_vacations', name: 'Неиспользованные отпуска', desc: 'Сотрудники с неиспользованными днями отпуска', icon: CalendarX, bgColor: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600 dark:text-blue-400', onClick: loadUnusedVacationsReport },
    { id: 'project_load', name: 'Загрузка по проектам', desc: 'Количество участников и состав проектов', icon: FolderKanban, bgColor: 'bg-cyan-100 dark:bg-cyan-900/30', iconColor: 'text-cyan-600 dark:text-cyan-400', onClick: loadProjectLoadReport },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reportCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.id} className={cn('cursor-pointer hover:border-primary/50 transition-colors', activeReport === card.id && 'border-primary/50 ring-1 ring-primary/20')} onClick={card.onClick}>
              <CardContent className="p-6 flex items-center gap-4">
                <div className={cn('p-3 rounded-xl', card.bgColor)}>
                  <Icon className={cn('h-6 w-6', card.iconColor)} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{card.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          )
        })}
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {activeReport === 'vacation' && !loading && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>Отчёт по отпускам {vacationYear}</CardTitle>
                <Input type="number" value={vacationYear} onChange={(e) => setVacationYear(parseInt(e.target.value))} className="w-24 h-8 text-sm" onClick={(e) => e.stopPropagation()} />
                <Button size="sm" onClick={loadVacationReport}>Обновить</Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => downloadCsv(`vacations?year=${vacationYear}`)}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Сотрудник</th>
                    <th className="pb-2 pr-3 font-medium">Отдел</th>
                    <th className="pb-2 pr-3 font-medium text-right">Всего</th>
                    <th className="pb-2 pr-3 font-medium text-right">Использовано</th>
                    <th className="pb-2 pr-3 font-medium text-right">Зарезервировано</th>
                    <th className="pb-2 font-medium text-right">Доступно</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {(vacationData as Record<string, unknown>[]).map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="py-2 pr-3">{String(r.last_name)} {String(r.first_name)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{String(r.department || '—')}</td>
                      <td className="py-2 pr-3 text-right">{String(r.total_days)}</td>
                      <td className="py-2 pr-3 text-right">{String(r.used_days)}</td>
                      <td className="py-2 pr-3 text-right">{String(r.reserved_days)}</td>
                      <td className="py-2 text-right font-medium">{String(r.available_days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'hires' && !loading && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Отчёт по наймам</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCsv('hires?')}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Сотрудник</th>
                    <th className="pb-2 pr-3 font-medium">Email</th>
                    <th className="pb-2 pr-3 font-medium">Должность</th>
                    <th className="pb-2 pr-3 font-medium">Отдел</th>
                    <th className="pb-2 pr-3 font-medium">Дата найма</th>
                    <th className="pb-2 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {(hiresData as Record<string, unknown>[]).map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="py-2 pr-3">{String(r.last_name)} {String(r.first_name)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{String(r.email)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{String(r.position)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{String(r.department || '—')}</td>
                      <td className="py-2 pr-3">{String(r.hire_date || '—')}</td>
                      <td className="py-2"><Badge className={cn('text-[10px]', STATUS_COLORS[String(r.status)])}>{STATUS_LABELS[String(r.status)] || String(r.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'turnover' && !loading && turnoverData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>Текучесть кадров {turnoverData.year}</CardTitle>
                <Input type="number" value={turnoverYear} onChange={(e) => setTurnoverYear(parseInt(e.target.value))} className="w-24 h-8 text-sm" onClick={(e) => e.stopPropagation()} />
                <Button size="sm" onClick={loadTurnoverReport}>Обновить</Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => downloadCsv(`turnover?year=${turnoverYear}`)}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-xl bg-muted/30 text-center">
                <p className="text-2xl font-bold">{turnoverData.turnoverRate}%</p>
                <p className="text-xs text-muted-foreground">Коэфф. текучести</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 text-center">
                <p className="text-2xl font-bold">{turnoverData.avgHeadcount}</p>
                <p className="text-xs text-muted-foreground">Ср. численность</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-center">
                <p className="text-2xl font-bold text-emerald-600">{turnoverData.totalHired}</p>
                <p className="text-xs text-muted-foreground">Принято</p>
              </div>
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-center">
                <p className="text-2xl font-bold text-red-600">{turnoverData.totalFired}</p>
                <p className="text-xs text-muted-foreground">Уволено</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Отдел</th>
                    <th className="pb-2 pr-3 font-medium text-right">Активных</th>
                    <th className="pb-2 pr-3 font-medium text-right text-emerald-600">Нанято</th>
                    <th className="pb-2 font-medium text-right text-red-600">Уволено</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {turnoverData.byDepartment.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="py-2 pr-3">{r.department}</td>
                      <td className="py-2 pr-3 text-right">{r.active}</td>
                      <td className="py-2 pr-3 text-right text-emerald-600">{r.hired}</td>
                      <td className="py-2 text-right text-red-600">{r.fired}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'tenure' && !loading && tenureData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Стаж и распределение</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCsv('tenure-age?')}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-muted/30 text-center">
                <p className="text-2xl font-bold">{tenureData.avgTenureYears} лет</p>
                <p className="text-xs text-muted-foreground">Средний стаж</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 text-center">
                <p className="text-2xl font-bold">{tenureData.tenureDistribution.reduce((s, r) => s + r.count, 0)}</p>
                <p className="text-xs text-muted-foreground">Активных сотрудников</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Распределение по стажу</h4>
              <div className="space-y-2">
                {(() => {
                  const maxCount = Math.max(...tenureData.tenureDistribution.map(d => d.count), 1)
                  return tenureData.tenureDistribution.map((d) => (
                    <div key={d.group} className="flex items-center gap-3">
                      <span className="text-sm w-32 truncate">{d.group}</span>
                      <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full" style={{ width: `${(d.count / maxCount) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{d.count}</span>
                    </div>
                  ))
                })()}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Отдел</th>
                    <th className="pb-2 pr-3 font-medium text-right">Сотрудников</th>
                    <th className="pb-2 font-medium text-right">Средний стаж</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {tenureData.byDepartment.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="py-2 pr-3">{r.department}</td>
                      <td className="py-2 pr-3 text-right">{r.count}</td>
                      <td className="py-2 text-right font-medium">{r.avgYears.toFixed(1)} лет</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'unused_vacations' && !loading && unusedVacationsData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>Неиспользованные отпуска {unusedVacationsData.year}</CardTitle>
                <Input type="number" value={unusedYear} onChange={(e) => setUnusedYear(parseInt(e.target.value))} className="w-24 h-8 text-sm" onClick={(e) => e.stopPropagation()} />
                <Button size="sm" onClick={loadUnusedVacationsReport}>Обновить</Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => downloadCsv(`unused-vacations?year=${unusedYear}`)}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-center">
                <p className="text-2xl font-bold text-amber-600">{unusedVacationsData.totalUnused}</p>
                <p className="text-xs text-muted-foreground">Неиспользованных дней</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 text-center">
                <p className="text-2xl font-bold">{unusedVacationsData.employeesWithUnused}</p>
                <p className="text-xs text-muted-foreground">Сотрудников с остатком</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Сотрудник</th>
                    <th className="pb-2 pr-3 font-medium">Отдел</th>
                    <th className="pb-2 pr-3 font-medium text-right">Всего</th>
                    <th className="pb-2 pr-3 font-medium text-right">Использовано</th>
                    <th className="pb-2 pr-3 font-medium text-right">Зарезервировано</th>
                    <th className="pb-2 font-medium text-right text-amber-600">Остаток</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {(unusedVacationsData.employees as Record<string, unknown>[]).map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="py-2 pr-3">{String(r.last_name)} {String(r.first_name)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{String(r.department || '—')}</td>
                      <td className="py-2 pr-3 text-right">{String(r.total_days)}</td>
                      <td className="py-2 pr-3 text-right">{String(r.used_days)}</td>
                      <td className="py-2 pr-3 text-right">{String(r.reserved_days)}</td>
                      <td className="py-2 text-right font-medium text-amber-600">{String(r.available_days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'project_load' && !loading && projectLoadData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Загрузка по проектам</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCsv('project-load?')}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-xl bg-muted/30 text-center">
                <p className="text-2xl font-bold">{projectLoadData.summary.totalProjects}</p>
                <p className="text-xs text-muted-foreground">Всего проектов</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-center">
                <p className="text-2xl font-bold text-emerald-600">{projectLoadData.summary.activeProjects}</p>
                <p className="text-xs text-muted-foreground">Активных</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 text-center">
                <p className="text-2xl font-bold">{projectLoadData.summary.totalAssigned}</p>
                <p className="text-xs text-muted-foreground">Назначено людей</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-center">
                <p className="text-2xl font-bold text-blue-600">{projectLoadData.summary.activeAssigned}</p>
                <p className="text-xs text-muted-foreground">На активных проектах</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Проект</th>
                    <th className="pb-2 pr-3 font-medium">Статус</th>
                    <th className="pb-2 pr-3 font-medium text-right">Участников</th>
                    <th className="pb-2 font-medium">Команда</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {projectLoadData.projects.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="py-2 pr-3 font-medium">{p.name}</td>
                      <td className="py-2 pr-3"><Badge className="text-[10px]">{p.status}</Badge></td>
                      <td className="py-2 pr-3 text-right">{p.memberCount}</td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {p.members.length > 0 ? p.members.map(m => m.name).join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ===================== DICTIONARIES TAB =====================

function DictionariesTab() {
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const [activeDict, setActiveDict] = useState<string>('positions')
  const [data, setData] = useState<{
    positions: { name: string; count: string }[]
    vacationTypes: { id: number; code: string; name: string }[]
    skills: { id: number; name: string }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [newSkill, setNewSkill] = useState('')
  const [newVacationName, setNewVacationName] = useState('')
  const [newVacationCode, setNewVacationCode] = useState('')
  const [editPositionName, setEditPositionName] = useState<string | null>(null)
  const [editPositionNewName, setEditPositionNewName] = useState('')
  const [editSkillId, setEditSkillId] = useState<number | null>(null)
  const [editSkillName, setEditSkillName] = useState('')
  const [editVacationId, setEditVacationId] = useState<number | null>(null)
  const [editVacationName, setEditVacationName] = useState('')
  const [editVacationCode, setEditVacationCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/dictionaries`, { headers: getAuthHeaders() })
      if (res.ok) setData(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const addSkill = async () => {
    if (!newSkill.trim()) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/dictionaries/skills`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newSkill.trim() }),
      })
      if (res.ok) { setNewSkill(''); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const updateSkill = async (id: number) => {
    if (!editSkillName.trim()) return
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/skills/${id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: editSkillName.trim() }),
      })
      if (res.ok) { setEditSkillId(null); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deleteSkill = async (id: number) => {
    try {
      await fetch(`${API_BASE_URL}/admin/dictionaries/skills/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchData()
    } catch {}
  }

  const addVacationType = async () => {
    if (!newVacationName.trim() || !newVacationCode.trim()) return
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/vacation-types`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newVacationName.trim(), code: newVacationCode.trim() }),
      })
      if (res.ok) { setNewVacationName(''); setNewVacationCode(''); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const updateVacationType = async (id: number) => {
    if (!editVacationName.trim()) return
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/vacation-types/${id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: editVacationName.trim(), code: editVacationCode.trim() }),
      })
      if (res.ok) { setEditVacationId(null); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deleteVacationType = async (id: number) => {
    try {
      await fetch(`${API_BASE_URL}/dictionaries/vacation-types/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchData()
    } catch {}
  }

  const renamePosition = async (oldName: string) => {
    if (!editPositionNewName.trim() || editPositionNewName.trim() === oldName) { setEditPositionName(null); return }
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/positions/rename`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ oldName, newName: editPositionNewName.trim() }),
      })
      if (res.ok) { setEditPositionName(null); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deletePosition = async (name: string) => {
    try {
      await fetch(`${API_BASE_URL}/dictionaries/positions/${encodeURIComponent(name)}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchData()
    } catch {}
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!data) return null

  const dictTabs = [
    { id: 'positions', name: 'Должности', icon: Briefcase, color: 'from-blue-500 to-indigo-600', count: data.positions.length },
    { id: 'vacationTypes', name: 'Типы отпусков', icon: Plane, color: 'from-emerald-500 to-teal-600', count: data.vacationTypes.length },
  ]
  if (isModuleEnabled('skills')) {
    dictTabs.push({ id: 'skills', name: 'Навыки', icon: Wrench, color: 'from-violet-500 to-purple-600', count: data.skills.length })
  }

  const activeTab = dictTabs.find(t => t.id === activeDict) ?? dictTabs[0]
  const ActiveIcon = activeTab.icon

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {dictTabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeDict === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveDict(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? `bg-gradient-to-br ${tab.color} text-white shadow-sm`
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-border/40',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.name}
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full',
                isActive ? 'bg-card/20' : 'bg-muted',
              )}>{tab.count}</span>
            </button>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-xl bg-gradient-to-br text-white', activeTab.color)}>
              <ActiveIcon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{activeTab.name}</CardTitle>
              <CardDescription>
                {activeDict === 'positions' && 'Должности сотрудников (из профиля)'}
                {activeDict === 'vacationTypes' && 'Типы отпусков для системы'}
                {activeDict === 'skills' && 'Каталог навыков компании'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeDict === 'positions' && (
            <div className="space-y-0.5">
              {data.positions.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <Briefcase className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Нет должностей</p>
                </div>
              )}
              {data.positions.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group">
                  {editPositionName === p.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-muted-foreground/50 font-mono w-6">{i + 1}.</span>
                      <Input value={editPositionNewName} onChange={e => setEditPositionNewName(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && renamePosition(p.name)} />
                      <Button size="sm" variant="outline" onClick={() => renamePosition(p.name)}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditPositionName(null)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground/50 font-mono w-6">{i + 1}.</span>
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px]">{p.count} чел.</Badge>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditPositionName(p.name); setEditPositionNewName(p.name) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deletePosition(p.name)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeDict === 'vacationTypes' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input placeholder="Название" value={newVacationName} onChange={e => setNewVacationName(e.target.value)} className="h-9 text-sm" />
                <Input placeholder="Код" value={newVacationCode} onChange={e => setNewVacationCode(e.target.value)} className="h-9 text-sm w-24" />
                <Button size="sm" onClick={addVacationType} disabled={!newVacationName.trim() || !newVacationCode.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Добавить
                </Button>
              </div>
              <div className="space-y-0.5">
                {data.vacationTypes.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <Plane className="h-8 w-8 opacity-20" />
                    <p className="text-sm">Нет типов отпусков</p>
                  </div>
                )}
                {data.vacationTypes.map((vt) => (
                  <div key={vt.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group">
                    {editVacationId === vt.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input value={editVacationName} onChange={e => setEditVacationName(e.target.value)} className="h-8 text-sm" autoFocus />
                        <Input value={editVacationCode} onChange={e => setEditVacationCode(e.target.value)} className="h-8 text-sm w-20" />
                        <Button size="sm" variant="outline" onClick={() => updateVacationType(vt.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditVacationId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{vt.code}</span>
                          <span className="text-sm font-medium">{vt.name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditVacationId(vt.id); setEditVacationName(vt.name); setEditVacationCode(vt.code) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteVacationType(vt.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeDict === 'skills' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input placeholder="Новый навык" value={newSkill} onChange={e => setNewSkill(e.target.value)} className="h-9 text-sm" onKeyDown={e => e.key === 'Enter' && addSkill()} />
                <Button size="sm" onClick={addSkill} disabled={!newSkill.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Добавить
                </Button>
              </div>
              <div className="space-y-0.5">
                {data.skills.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <Wrench className="h-8 w-8 opacity-20" />
                    <p className="text-sm">Нет навыков</p>
                  </div>
                )}
                {data.skills.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group">
                    {editSkillId === s.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input value={editSkillName} onChange={e => setEditSkillName(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && updateSkill(s.id)} />
                        <Button size="sm" variant="outline" onClick={() => updateSkill(s.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditSkillId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-medium">{s.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditSkillId(s.id); setEditSkillName(s.name) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteSkill(s.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ===================== MODULES TAB =====================

interface ModuleItem {
  id: number
  code: string
  name: string
  description: string | null
  icon: string | null
  route: string | null
  category: string
  sort_order: number
  is_enabled: boolean
  updated_at: string
}

type ModuleCategoryKey = 'core' | 'hr' | 'work' | 'docs' | 'admin'

interface ModuleCategory {
  key: ModuleCategoryKey
  name: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

const MODULE_CATEGORIES: ModuleCategory[] = [
  { key: 'core', name: 'Основные', icon: Boxes, color: 'text-blue-500' },
  { key: 'hr', name: 'HR и Люди', icon: UserPlus, color: 'text-emerald-500' },
  { key: 'work', name: 'Проекты и Работа', icon: FolderKanban, color: 'text-violet-500' },
  { key: 'docs', name: 'Документы и Коммуникации', icon: FileText, color: 'text-amber-500' },
  { key: 'admin', name: 'Аналитика и Управление', icon: BarChart3, color: 'text-pink-500' },
]

const MODULE_COLORS: Record<string, { active: string; inactive: string; icon: string }> = {
  vacation:     { active: 'from-blue-500 to-indigo-600',   inactive: 'bg-blue-100 dark:bg-blue-900/30',  icon: 'text-blue-600 dark:text-blue-400' },
  surveys:      { active: 'from-violet-500 to-purple-600', inactive: 'bg-violet-100 dark:bg-violet-900/30', icon: 'text-violet-600 dark:text-violet-400' },
  projects:     { active: 'from-emerald-500 to-teal-600',  inactive: 'bg-emerald-100 dark:bg-emerald-900/30', icon: 'text-emerald-600 dark:text-emerald-400' },
  documents:    { active: 'from-amber-500 to-orange-600',  inactive: 'bg-amber-100 dark:bg-amber-900/30', icon: 'text-amber-600 dark:text-amber-400' },
  timesheet:    { active: 'from-cyan-500 to-blue-600',     inactive: 'bg-cyan-100 dark:bg-cyan-900/30', icon: 'text-cyan-600 dark:text-cyan-400' },
  onboarding:   { active: 'from-pink-500 to-rose-600',     inactive: 'bg-pink-100 dark:bg-pink-900/30', icon: 'text-pink-600 dark:text-pink-400' },
  hierarchy:    { active: 'from-indigo-500 to-blue-600',   inactive: 'bg-indigo-100 dark:bg-indigo-900/30', icon: 'text-indigo-600 dark:text-indigo-400' },
  dictionaries: { active: 'from-teal-500 to-emerald-600',  inactive: 'bg-teal-100 dark:bg-teal-900/30', icon: 'text-teal-600 dark:text-teal-400' },
  calendar:     { active: 'from-sky-500 to-blue-600',      inactive: 'bg-sky-100 dark:bg-sky-900/30', icon: 'text-sky-600 dark:text-sky-400' },
  analytics:    { active: 'from-amber-500 to-orange-600',  inactive: 'bg-amber-100 dark:bg-amber-900/30', icon: 'text-amber-600 dark:text-amber-400' },
}

function ModulesTab() {
  const [modules, setModules] = useState<ModuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settingsModule, setSettingsModule] = useState<ModuleId | null>(null)

  useEffect(() => { fetchModules() }, [])

  const fetchModules = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/modules`, { headers: getAuthHeaders() })
      if (res.ok) setModules(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const toggleModule = async (mod: ModuleItem) => {
    setTogglingId(mod.id)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/modules/${mod.id}/toggle`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
      })
      if (res.ok) {
        const data = await res.json()
        setModules((prev) => prev.map((m) => m.id === mod.id ? { ...m, is_enabled: data.enabled } : m))
        useModulesStore.getState().fetchModules()
      } else {
        const data = await res.json()
        setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setTogglingId(null) }
  }

  const enabledCount = modules.filter(m => m.is_enabled).length

  const SETTINGS_MAP: Record<string, ModuleId> = {
    vacation: 'vacation',
    calendar: 'calendar',
    notifications: 'notifications',
    auth: 'auth',
  }

  const SETTINGS_INFO: Record<string, { emoji: string; color: string }> = {
    vacation: { emoji: '🏖️', color: '#10B981' },
    calendar: { emoji: '📅', color: '#8B5CF6' },
    notifications: { emoji: '🔔', color: '#F59E0B' },
    auth: { emoji: '🔐', color: '#3B82F6' },
  }

  const CORE_CODES = ['notifications', 'auth']

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const groupedModules = MODULE_CATEGORIES
    .map(cat => ({
      ...cat,
      modules: modules
        .filter(m => {
  if (CORE_CODES.includes(m.code)) return cat.key === 'core'
  const catKey = (!m.category || m.category === 'general') ? 'core' : m.category
  return catKey === cat.key
})
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter(g => g.modules.length > 0)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" /> Модули системы</CardTitle>
              <CardDescription>Включено {enabledCount} из {modules.length} модулей</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
            </div>
          )}

          <div className="space-y-6">
            {groupedModules.map(group => {
              const CategoryIcon = group.icon
              const groupEnabled = group.modules.filter(m => m.is_enabled).length
              return (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <CategoryIcon className={cn('h-4 w-4', group.color)} />
                    <h3 className="font-semibold text-sm text-foreground">{group.name}</h3>
                    <Badge className="text-[10px] bg-muted text-muted-foreground ml-auto">
                      {groupEnabled}/{group.modules.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {group.modules.map((mod) => {
                      const colors = MODULE_COLORS[mod.code] || MODULE_COLORS.documents
                      const isLoading = togglingId === mod.id
                      const hasSettings = mod.code in SETTINGS_MAP
                      const settingsInfo = SETTINGS_INFO[mod.code]

                      return (
                        <div
                          key={mod.id}
                          className={cn(
                            'relative flex flex-col p-5 rounded-2xl border-2 transition-all duration-300',
                            mod.is_enabled
                              ? 'border-primary/20 bg-card shadow-sm hover:shadow-md hover:border-primary/40'
                              : 'border-border/30 bg-muted/20 opacity-70 hover:opacity-100',
                          )}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className={cn(
                              'p-2.5 rounded-xl transition-all duration-300',
                              mod.is_enabled
                                ? `bg-primary/10 text-primary`
                                : colors.inactive,
                            )}>
                              {settingsInfo ? (
                                <span className="block w-5 h-5 text-center text-base leading-5">{settingsInfo.emoji}</span>
                              ) : (
                                <Boxes className={cn('h-5 w-5', !mod.is_enabled && (colors.icon || 'text-muted-foreground'))} />
                              )}
                            </div>

                            {!CORE_CODES.includes(mod.code) && (
                              <button
                                onClick={() => toggleModule(mod)}
                                disabled={isLoading}
                                className={cn(
                                  'relative w-12 h-7 rounded-full transition-all duration-300 shrink-0',
                                  mod.is_enabled ? 'bg-primary shadow-sm' : 'bg-muted-foreground/20',
                                  isLoading && 'opacity-50 cursor-wait',
                                )}
                              >
                                <div className={cn(
                                  'absolute top-0.5 w-6 h-6 rounded-full bg-card shadow-sm transition-all duration-300',
                                  mod.is_enabled ? 'left-[22px]' : 'left-0.5',
                                )} />
                                {isLoading && (
                                  <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />
                                )}
                              </button>
                            )}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className={cn(
                                'font-semibold transition-colors',
                                mod.is_enabled ? 'text-foreground' : 'text-muted-foreground',
                              )}>
                                {mod.name}
                              </h3>
                              {!CORE_CODES.includes(mod.code) && (
                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={
                                  mod.is_enabled
                                    ? { backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981', borderColor: 'rgba(16,185,129,0.3)' }
                                    : { backgroundColor: 'rgba(107,114,128,0.15)', color: '#6B7280', borderColor: 'transparent' }
                                }>
                                  {mod.is_enabled ? 'Активен' : 'Отключен'}
                                </span>
                              )}
                            </div>
                            {mod.description && (
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{mod.description}</p>
                            )}
                            {mod.route && (
                              <p className="text-[10px] font-mono text-muted-foreground/60 mt-2">{mod.route}</p>
                            )}
                          </div>

                          {hasSettings && (
                            <button
                              onClick={() => setSettingsModule(SETTINGS_MAP[mod.code])}
                              disabled={!mod.is_enabled}
                              className={cn(
                                'flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm mt-4 transition-colors duration-200 border',
                                mod.is_enabled
                                  ? 'bg-primary text-primary-foreground border-primary/20 hover:bg-primary/90'
                                  : 'text-muted-foreground cursor-not-allowed border-transparent bg-transparent',
                              )}
                            >
                              <Settings className="w-4 h-4" />
                              Настройки
                            </button>
                          )}

                          {mod.is_enabled && (
                            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {settingsModule && (
        <ModuleSettingsModal
          moduleId={settingsModule}
          isOpen={true}
          onClose={() => setSettingsModule(null)}
        />
      )}
    </>
  )
}
