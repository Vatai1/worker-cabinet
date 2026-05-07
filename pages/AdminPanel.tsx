import { useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage, cn } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Switch } from '@/components/ui/Switch'
import {
  Shield, Users, Key, Building2, Settings2, ScrollText, Search,
  Loader2, Plus, Trash2, Edit3, Check, X, AlertTriangle, Activity,
  ChevronLeft, ChevronRight, RefreshCw, UserCog, Lock,
  UserPlus, RotateCcw, Sliders, Clock, Globe,
  ShieldCheck, ArrowRightLeft, Eye, ArrowUpDown,
} from 'lucide-react'
import type { AdminRole, AdminPermission, AdminUser, SystemSetting, AuditLogEntry, AdminStats } from '@/types/admin'

type TabId = 'users' | 'roles' | 'departments' | 'settings' | 'audit'

const TABS: { id: TabId; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'users', name: 'Пользователи', icon: Users },
  { id: 'roles', name: 'Роли и доступы', icon: Key },
  { id: 'departments', name: 'Отделы', icon: Building2 },
  { id: 'settings', name: 'Настройки', icon: Settings2 },
  { id: 'audit', name: 'Аудит', icon: ScrollText },
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

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/stats`, { headers: getAuthHeaders() })
      if (res.ok) setStats(await res.json())
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Администрирование</h1>
          <p className="text-sm text-muted-foreground">Управление ролями, доступами и настройками системы</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Пользователей" value={stats.totalUsers} sub={`Активных: ${stats.activeUsers}`} color="blue" />
          <StatCard icon={Key} label="Ролей" value={stats.totalRoles} color="purple" />
          <StatCard icon={Building2} label="Отделов" value={stats.totalDepartments} color="emerald" />
          <StatCard icon={Activity} label="Действий сегодня" value={stats.auditToday} color="amber" />
        </div>
      )}

      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.name}
            </button>
          )
        })}
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'departments' && <DepartmentsTab />}
      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'audit' && <AuditTab />}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sub?: string
  color: string
}) {
  const bgMap: Record<string, string> = {
    blue: 'from-blue-500 to-indigo-600',
    purple: 'from-violet-500 to-purple-600',
    emerald: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
  }
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={cn('p-2.5 rounded-xl bg-gradient-to-br text-white', bgMap[color] || bgMap.blue)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
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
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [editRole, setEditRole] = useState('')
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [resetPwdId, setResetPwdId] = useState<number | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRoles()
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [page, search, filterRole])

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/roles`, { headers: getAuthHeaders() })
      if (res.ok) setRoles(await res.json())
    } catch {}
  }

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      if (search) params.set('search', search)
      if (filterRole) params.set('role', filterRole)
      const res = await fetch(`${API_BASE_URL}/admin/users?${params}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
        setTotal(data.total)
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  const changeRole = async (userId: number, role: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/role`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
        setEditingUserId(null)
      } else {
        const data = await res.json()
        setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const changeStatus = async (userId: number, status: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/status`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: status as AdminUser['status'] } : u)))
      }
    } catch {}
  }

  const resetPassword = async (userId: number) => {
    if (!newPassword || newPassword.length < 6) { setError('Пароль минимум 6 символов'); return }
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/reset-password`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ newPassword }),
      })
      if (res.ok) { setResetPwdId(null); setNewPassword('') }
      else {
        const data = await res.json()
        setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const totalPages = Math.ceil(total / 25)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" /> Управление пользователями</CardTitle>
        <CardDescription>Всего: {total}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени, email, должности..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => { setFilterRole(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            <option value="">Все роли</option>
            {roles.map((r) => <option key={r.id} value={r.name}>{ROLE_LABELS[r.name] || r.name}</option>)}
          </select>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Сотрудник</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Должность</th>
                  <th className="pb-3 pr-4 font-medium">Отдел</th>
                  <th className="pb-3 pr-4 font-medium">Роль</th>
                  <th className="pb-3 pr-4 font-medium">Статус</th>
                  <th className="pb-3 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{user.last_name} {user.first_name}</div>
                      {user.middle_name && <div className="text-xs text-muted-foreground">{user.middle_name}</div>}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{user.email}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{user.position}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{user.department_name || '—'}</td>
                    <td className="py-3 pr-4">
                      {editingUserId === user.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="px-2 py-1 text-xs rounded border border-border bg-background"
                          >
                            {roles.map((r) => <option key={r.id} value={r.name}>{ROLE_LABELS[r.name] || r.name}</option>)}
                          </select>
                          <button onClick={() => changeRole(user.id, editRole)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingUserId(null)} className="p-1 text-red-600 hover:bg-red-50 rounded"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingUserId(user.id); setEditRole(user.role) }}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted/50 transition-colors"
                        >
                          {ROLE_LABELS[user.role] || user.role}
                          <Edit3 className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => changeStatus(user.id, user.status === 'active' ? 'inactive' : 'active')}
                        className="text-xs"
                      >
                        <Badge className={cn('text-[10px]', STATUS_COLORS[user.status])}>
                          {STATUS_LABELS[user.status] || user.status}
                        </Badge>
                      </button>
                    </td>
                    <td className="py-3">
                      {resetPwdId === user.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="password"
                            placeholder="Новый пароль"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="h-7 text-xs w-32"
                          />
                          <button onClick={() => resetPassword(user.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => { setResetPwdId(null); setNewPassword('') }} className="p-1 text-red-600 hover:bg-red-50 rounded"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setResetPwdId(user.id)}
                          className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Сбросить пароль"
                        >
                          <Lock className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Показано {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} из {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
    if (!confirm('Удалить эту роль?')) return
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
  const [users, setUsers] = useState<{ id: number; first_name: string; last_name: string }[]>([])

  useEffect(() => {
    fetchDepartments()
    fetchUsers()
  }, [])

  const fetchDepartments = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      if (res.ok) setDepartments(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users?limit=1000`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
      }
    } catch {}
  }

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newManager, setNewManager] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editManager, setEditManager] = useState('')

  const createDept = async () => {
    if (!newName.trim()) { setError('Название обязательно'); return }
    try {
      const res = await fetch(`${API_BASE_URL}/departments`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), manager_id: newManager ? parseInt(newManager) : null }),
      })
      if (res.ok) { setShowCreate(false); setNewName(''); setNewDesc(''); setNewManager(''); fetchDepartments() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const updateDept = async (id: number) => {
    try {
      const body: Record<string, unknown> = { name: editName.trim() }
      if (editManager) body.manager_id = parseInt(editManager)
      const res = await fetch(`${API_BASE_URL}/departments/${id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (res.ok) { setEditingId(null); fetchDepartments() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Отделы</CardTitle>
            <CardDescription>Всего: {departments.length}</CardDescription>
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Новый отдел</Button>
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
            <Input placeholder="Название" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Описание" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <select value={newManager} onChange={(e) => setNewManager(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
              <option value="">Без руководителя</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.last_name} {u.first_name}</option>)}
            </select>
            <Button onClick={createDept}>Создать</Button>
            <Button variant="outline" onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}>Отмена</Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Отдел</th>
                <th className="pb-3 pr-4 font-medium">Руководитель</th>
                <th className="pb-3 pr-4 font-medium">Сотрудников</th>
                <th className="pb-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {departments.map((dept) => (
                <tr key={dept.id} className="hover:bg-muted/30">
                  <td className="py-3 pr-4 font-medium">{dept.name}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{dept.manager_name || '—'}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{dept.employee_count}</td>
                  <td className="py-3">
                    {editingId === dept.id ? (
                      <div className="flex items-center gap-1">
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-xs w-40" />
                        <select value={editManager} onChange={(e) => setEditManager(e.target.value)} className="h-7 text-xs px-2 rounded border border-border bg-background">
                          <option value="">—</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.last_name} {u.first_name}</option>)}
                        </select>
                        <button onClick={() => updateDept(dept.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-red-600 hover:bg-red-50 rounded"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => { setEditingId(dept.id); setEditName(dept.name); setEditManager(dept.manager_id ? String(dept.manager_id) : '') }}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ===================== SETTINGS TAB =====================

function SettingsTab() {
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

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
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
          {settings.map((setting) => (
            <div key={setting.key} className="flex flex-col sm:flex-row sm:items-center gap-2 p-4 rounded-xl border border-border/50">
              <div className="flex-1">
                <p className="font-medium text-sm">{setting.description || setting.key}</p>
                <p className="text-xs text-muted-foreground font-mono">{setting.key}</p>
              </div>
              <Input
                value={setting.value}
                onChange={(e) => updateValue(setting.key, e.target.value)}
                className="sm:w-64"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
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
