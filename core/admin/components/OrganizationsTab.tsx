import { useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn, formatDateTime } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { useOrgStore } from '@/shared/store/orgStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import {
  Building2, Plus, X, Search, Loader2, AlertTriangle,
  Users, FolderOpen, Boxes, Settings as SettingsIcon, ChevronLeft, ExternalLink,
} from 'lucide-react'

interface Organization {
  id: number
  name: string
  slug: string
  inn: string | null
  address: string | null
  logo_s3_key: string | null
  is_active: boolean
  created_at: string
  settings?: Record<string, unknown>
  member_count?: number
}

interface OrgMember {
  id: number
  email: string
  first_name: string
  last_name: string
  middle_name: string | null
  position: string | null
  avatar: string | null
  org_role: string
  department_id: number | null
  department_name: string | null
  is_active: boolean
}

interface OrgDepartment {
  id: number
  name: string
  manager_first_name: string | null
  manager_last_name: string | null
  employee_count?: number
}

interface OrgModule {
  code: string
  name: string
  global_is_enabled: boolean
  is_enabled_override: boolean | null
  effective_enabled: boolean
}

type DetailTab = 'info' | 'departments' | 'members' | 'modules' | 'settings'

const ORG_ROLE_COLORS: Record<string, string> = {
  employee: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  manager: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  hr: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  admin: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

export function OrganizationsTab() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)

  useEffect(() => { fetchOrgs() }, [])

  const fetchOrgs = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/organizations`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setOrgs(Array.isArray(data) ? data : data.organizations || [])
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Учреждения</CardTitle>
              <CardDescription>Всего учреждений: {orgs.length}</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Добавить
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : orgs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Учреждения не найдены</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org)}
                  className="text-left p-5 rounded-2xl border-2 border-border/40 bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground truncate">{org.name}</h3>
                      <p className="font-mono text-xs text-muted-foreground mt-0.5">{org.slug}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    {org.inn && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-xs">ИНН:</span>
                        <span className="font-mono">{org.inn}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <Badge className={cn('text-[10px] border-transparent', org.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>
                        {org.is_active ? 'Активна' : 'Неактивна'}
                      </Badge>
                      {org.member_count !== undefined && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" /> {org.member_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchOrgs() }}
        />
      )}

      {selectedOrg && (
        <OrganizationDetailModal
          org={selectedOrg}
          onClose={() => setSelectedOrg(null)}
          onUpdated={(updated) => {
            setOrgs((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o))
            setSelectedOrg((prev) => prev ? { ...prev, ...updated } : prev)
          }}
        />
      )}
    </>
  )
}

function CreateOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [inn, setInn] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/organizations`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), inn: inn.trim() || undefined, address: address.trim() || undefined }),
      })
      if (res.ok) { onCreated() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-lg flex items-center gap-2"><Building2 className="h-5 w-5" /> Новое учреждение</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Название *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ГКУ СО ЦРЦТ" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Slug (латиница, без пробелов) *</label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="crct" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">ИНН</label>
            <Input value={inn} onChange={(e) => setInn(e.target.value)} placeholder="6511000001" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Адрес</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="г. Южно-Сахалинск, ..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" disabled={saving || !name.trim() || !slug.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Создать
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function OrganizationDetailModal({
  org, onClose, onUpdated,
}: {
  org: Organization
  onClose: () => void
  onUpdated: (updated: Partial<Organization>) => void
}) {
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('info')
  const [departmentFilter, setDepartmentFilter] = useState<number | null>(null)
  const [departmentFilterName, setDepartmentFilterName] = useState<string | null>(null)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const switchTab = (tab: DetailTab) => {
    if (tab !== 'members') {
      setDepartmentFilter(null)
      setDepartmentFilterName(null)
    }
    setActiveDetailTab(tab)
  }

  const handleSelectDept = (deptId: number, deptName: string) => {
    setDepartmentFilter(deptId)
    setDepartmentFilterName(deptName)
    setActiveDetailTab('members')
  }

  const handleClearDeptFilter = () => {
    setDepartmentFilter(null)
    setDepartmentFilterName(null)
  }

  const handleToggleActive = async () => {
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/organizations/${org.id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ is_active: !org.is_active }),
      })
      if (res.ok) {
        const data = await res.json()
        onUpdated({ is_active: data.is_active })
      }
    } catch {}
  }

  const handleOpenInAdmin = () => {
    useOrgStore.getState().setCurrentOrg(org.id)
    onClose()
  }

  const detailTabs: { id: DetailTab; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'info', name: 'Об учреждении', icon: Building2 },
    { id: 'departments', name: 'Отделы', icon: FolderOpen },
    { id: 'members', name: 'Сотрудники', icon: Users },
    { id: 'modules', name: 'Модули', icon: Boxes },
    { id: 'settings', name: 'Настройки', icon: SettingsIcon },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg truncate">{org.name}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{org.slug}</span>
                {org.inn && <span>· ИНН {org.inn}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 p-4 border-b border-border shrink-0 overflow-x-auto">
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                activeDetailTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div key={activeDetailTab} className="animate-fade-in">
            {activeDetailTab === 'info' && <InfoTab org={org} onToggleActive={handleToggleActive} />}
            {activeDetailTab === 'departments' && <DepartmentsTabContent orgId={org.id} onSelectDept={handleSelectDept} />}
            {activeDetailTab === 'members' && (
              <MembersTabContent
                orgId={org.id}
                departmentFilter={departmentFilter}
                departmentFilterName={departmentFilterName}
                onClearDeptFilter={handleClearDeptFilter}
                onBackToDepts={() => switchTab('departments')}
              />
            )}
            {activeDetailTab === 'modules' && <ModulesTabContent orgId={org.id} onOpenInAdmin={handleOpenInAdmin} />}
            {activeDetailTab === 'settings' && <SettingsTabContent orgId={org.id} onOpenInAdmin={handleOpenInAdmin} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoTab({ org, onToggleActive }: { org: Organization; onToggleActive: () => void }) {
  const [stats, setStats] = useState<{ members: number; departments: number; modulesEnabled: number } | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [membersRes, deptsRes, modulesRes] = await Promise.all([
          fetchWithRetry(`${API_BASE_URL}/organizations/${org.id}/members`, { headers: getAuthHeaders() }),
          fetchWithRetry(`${API_BASE_URL}/departments`, { headers: { ...getAuthHeaders(), 'X-Organization-Id': String(org.id) } }),
          fetchWithRetry(`${API_BASE_URL}/modules`, { headers: { ...getAuthHeaders(), 'X-Organization-Id': String(org.id) } }),
        ])
        const members = membersRes.ok ? await membersRes.json() : []
        const depts = deptsRes.ok ? await deptsRes.json() : []
        const modules = modulesRes.ok ? await modulesRes.json() : { enabled: [] }
        setStats({
          members: Array.isArray(members) ? members.length : 0,
          departments: Array.isArray(depts) ? depts.length : 0,
          modulesEnabled: modules.enabled?.length ?? 0,
        })
      } catch {}
    }
    fetchStats()
  }, [org.id])

  const rows: { label: string; value: string | null }[] = [
    { label: 'Название', value: org.name },
    { label: 'Slug', value: org.slug },
    { label: 'ИНН', value: org.inn },
    { label: 'Адрес', value: org.address },
    { label: 'Статус', value: org.is_active ? 'Активна' : 'Неактивна' },
    { label: 'Дата создания', value: formatDateTime(org.created_at) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs">Сотрудники</span>
          </div>
          <p className="text-2xl font-bold">{stats?.members ?? '—'}</p>
        </div>
        <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <FolderOpen className="h-4 w-4" />
            <span className="text-xs">Отделы</span>
          </div>
          <p className="text-2xl font-bold">{stats?.departments ?? '—'}</p>
        </div>
        <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Boxes className="h-4 w-4" />
            <span className="text-xs">Модулей включено</span>
          </div>
          <p className="text-2xl font-bold">{stats?.modulesEnabled ?? '—'}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 divide-y divide-border/40">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className={cn('text-sm font-medium', row.label === 'Slug' || row.label === 'ИНН' ? 'font-mono' : '')}>
              {row.value || '—'}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant={org.is_active ? 'outline' : 'default'} onClick={onToggleActive}>
          {org.is_active ? 'Деактивировать' : 'Активировать'}
        </Button>
      </div>
    </div>
  )
}

function DepartmentsTabContent({ orgId, onSelectDept }: { orgId: number; onSelectDept: (deptId: number, deptName: string) => void }) {
  const [departments, setDepartments] = useState<OrgDepartment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDepartments = async () => {
      setLoading(true)
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/departments`, {
          headers: { ...getAuthHeaders(), 'X-Organization-Id': String(orgId) },
        })
        if (res.ok) {
          const data = await res.json()
          setDepartments(Array.isArray(data) ? data : [])
        }
      } catch {}
      finally { setLoading(false) }
    }
    fetchDepartments()
  }, [orgId])

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  if (departments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p>Отделов нет</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">Нажмите на отдел, чтобы посмотреть сотрудников</p>
      {departments.map((dept) => (
        <button
          key={dept.id}
          onClick={() => onSelectDept(dept.id, dept.name)}
          className="flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 w-full text-left"
        >
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">{dept.name}</p>
            {dept.manager_first_name && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Рук: {dept.manager_last_name} {dept.manager_first_name}
              </p>
            )}
          </div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground/50 rotate-180 shrink-0" />
        </button>
      ))}
    </div>
  )
}

function MembersTabContent({
  orgId, departmentFilter, departmentFilterName, onClearDeptFilter, onBackToDepts,
}: {
  orgId: number
  departmentFilter: number | null
  departmentFilterName: string | null
  onClearDeptFilter: () => void
  onBackToDepts: () => void
}) {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/organizations/${orgId}/members`, { headers: getAuthHeaders() })
      if (res.ok) setMembers(await res.json())
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchMembers() }, [orgId])

  const changeRole = async (userId: number, newRole: string) => {
    setUpdatingId(userId)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/organizations/${orgId}/members/${userId}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ org_role: newRole }),
      })
      if (res.ok) {
        setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, org_role: newRole } : m))
      }
    } catch {}
    finally { setUpdatingId(null) }
  }

  const filtered = members.filter((m) => {
    if (departmentFilter !== null && m.department_id !== departmentFilter) return false
    const q = search.toLowerCase()
    return !q ||
      `${m.last_name} ${m.first_name} ${m.middle_name || ''}`.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
  })

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-3">
      {departmentFilter !== null && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <button
            onClick={onBackToDepts}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Отделы
          </button>
          <ChevronLeft className="h-3 w-3 text-muted-foreground/30" />
          <Badge className="text-[10px] bg-primary/10 text-primary border-transparent">
            <Users className="h-3 w-3 mr-1" />
            {departmentFilterName}
          </Badge>
          <button
            onClick={onClearDeptFilter}
            className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Все сотрудники
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или email..."
          className="pl-9"
        />
      </div>
      <p className="text-xs text-muted-foreground">Найдено: {filtered.length} из {members.length}</p>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>Сотрудников нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => (
            <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/40">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-sm font-bold shrink-0">
                {(member.first_name?.[0] || '?')}{(member.last_name?.[0] || '')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">
                  {member.last_name} {member.first_name} {member.middle_name || ''}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="truncate">{member.email}</span>
                  {member.position && <span>· {member.position}</span>}
                </div>
                {member.department_name && (
                  <p className="text-xs text-muted-foreground">{member.department_name}</p>
                )}
              </div>
              <select
                value={member.org_role}
                onChange={(e) => changeRole(member.id, e.target.value)}
                disabled={updatingId === member.id}
                className={cn(
                  'text-xs font-medium rounded-md px-2 py-1 border-0 cursor-pointer disabled:opacity-50',
                  ORG_ROLE_COLORS[member.org_role] || ORG_ROLE_COLORS.employee
                )}
              >
                <option value="employee">Сотрудник</option>
                <option value="manager">Руководитель</option>
                <option value="hr">HR</option>
                <option value="admin">Администратор</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ModulesTabContent({ orgId, onOpenInAdmin }: { orgId: number; onOpenInAdmin: () => void }) {
  const [modules, setModules] = useState<OrgModule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchModules = async () => {
      setLoading(true)
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/admin/modules`, {
          headers: { ...getAuthHeaders(), 'X-Organization-Id': String(orgId) },
        })
        if (res.ok) {
          const data = await res.json()
          setModules(data.map((m: Record<string, unknown>) => ({
            code: m.code as string,
            name: (m.org_name as string) || (m.global_name as string) || (m.name as string),
            global_is_enabled: m.global_is_enabled as boolean,
            is_enabled_override: m.is_enabled_override as boolean | null,
            effective_enabled: m.effective_enabled as boolean,
          })))
        }
      } catch {}
      finally { setLoading(false) }
    }
    fetchModules()
  }, [orgId])

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  const enabledCount = modules.filter(m => m.effective_enabled).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Включено {enabledCount} из {modules.length}</p>
        <Button size="sm" variant="outline" onClick={onOpenInAdmin}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          Открыть в админке
        </Button>
      </div>
      <div className="space-y-2">
        {modules.map((mod) => (
          <div key={mod.code} className="flex items-center gap-3 p-3 rounded-xl border border-border/40">
            <div className={cn(
              'p-2 rounded-lg shrink-0',
              mod.effective_enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <Boxes className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{mod.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{mod.code}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!mod.global_is_enabled && (
                <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent">
                  Глобально отключён
                </Badge>
              )}
              {mod.global_is_enabled && mod.is_enabled_override === false && (
                <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-transparent">
                  Отключён локально
                </Badge>
              )}
              {mod.global_is_enabled && mod.is_enabled_override !== false && (
                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-transparent">
                  Включён
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsTabContent({ orgId, onOpenInAdmin }: { orgId: number; onOpenInAdmin: () => void }) {
  const [settings, setSettings] = useState<{ key: string; value: string; description?: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true)
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/admin/settings`, {
          headers: { ...getAuthHeaders(), 'X-Organization-Id': String(orgId) },
        })
        if (res.ok) {
          const data = await res.json()
          const filtered = (Array.isArray(data) ? data : []).filter(
            (s: { key: string }) => s.key.startsWith('company_') || s.key.startsWith('login_')
          )
          setSettings(filtered.map((s: { key: string; value: string; description?: string }) => ({ key: s.key, value: s.value, description: s.description })))
        }
      } catch {}
      finally { setLoading(false) }
    }
    fetchSettings()
  }, [orgId])

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  if (settings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <SettingsIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p>Настроек нет</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onOpenInAdmin}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          Открыть в админке
        </Button>
      </div>
      <div className="rounded-xl border border-border/50 divide-y divide-border/40">
        {settings.map((s) => (
          <div key={s.key} className="flex items-center justify-between px-4 py-2.5 gap-4">
            <div className="min-w-0">
              <p className="text-sm font-mono text-muted-foreground shrink-0">{s.key}</p>
              {s.description && <p className="text-xs text-muted-foreground/70 mt-0.5">{s.description}</p>}
            </div>
            <span className="text-sm font-medium text-right truncate">{s.value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
