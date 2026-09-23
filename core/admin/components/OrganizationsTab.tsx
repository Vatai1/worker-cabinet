import { useState, useEffect, useMemo } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn, formatDateTime, personName } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { useOrgStore } from '@/shared/store/orgStore'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import {
  Building2, Plus, X, Search, Loader2, AlertTriangle, Save,
  Users, FolderOpen, Boxes, Settings as SettingsIcon, ChevronLeft, ChevronRight, ChevronDown, ExternalLink,
  CornerDownRight, Crown,
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
  head_id?: number | null
  head_first_name?: string | null
  head_last_name?: string | null
  head_middle_name?: string | null
  parent_id?: number | null
  parent_name?: string | null
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
  manager_name: string | null
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

// Учреждения образуют дерево (головная организация → подчинённые). Список
// строится в порядке обхода дерева, чтобы иерархия была видна сразу, без
// необходимости открывать каждую карточку.
function buildOrgTree(orgs: Organization[], collapsed: Set<number>): { org: Organization; depth: number; hasChildren: boolean }[] {
  const ids = new Set(orgs.map((o) => o.id))
  const byParent = new Map<number, Organization[]>()
  const roots: Organization[] = []
  for (const o of orgs) {
    if (o.parent_id != null && ids.has(o.parent_id)) {
      if (!byParent.has(o.parent_id)) byParent.set(o.parent_id, [])
      byParent.get(o.parent_id)!.push(o)
    } else {
      roots.push(o)
    }
  }
  const result: { org: Organization; depth: number; hasChildren: boolean }[] = []
  const visit = (list: Organization[], depth: number) => {
    for (const o of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
      const children = byParent.get(o.id)
      result.push({ org: o, depth, hasChildren: !!children?.length })
      if (children && !collapsed.has(o.id)) visit(children, depth + 1)
    }
  }
  visit(roots, 0)
  return result
}

export function OrganizationsTab() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [search, setSearch] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const q = search.trim().toLowerCase()
  const isFiltering = q.length > 0 || onlyActive

  // При активном поиске/фильтре дерево не даёт ничего полезного — часть
  // предков может не подходить под запрос, поэтому просто плоский список.
  const rows = useMemo(() => {
    if (!isFiltering) return buildOrgTree(orgs, collapsed)
    return orgs
      .filter((o) => (!onlyActive || o.is_active) && (!q || o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q) || (o.inn ?? '').includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((org) => ({ org, depth: 0, hasChildren: false }))
  }, [orgs, isFiltering, onlyActive, q, collapsed])

  const activeCount = orgs.filter((o) => o.is_active).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" /> Учреждения
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orgs.length} всего · {activeCount} активных
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Учреждение
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию, slug или ИНН..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyActive((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-3.5 rounded-lg border text-sm font-medium transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            onlyActive ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', onlyActive ? 'bg-primary' : 'bg-muted-foreground/40')} />
          Только активные
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{orgs.length === 0 ? 'Учреждения не найдены' : 'Ничего не найдено по заданным условиям'}</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {rows.map(({ org, depth, hasChildren }) => (
            <OrgRow
              key={org.id}
              org={org}
              depth={depth}
              hasChildren={hasChildren}
              collapsed={collapsed.has(org.id)}
              onToggleCollapse={() => toggleCollapse(org.id)}
              onClick={() => setSelectedOrg(org)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchOrgs() }}
        />
      )}

      {selectedOrg && (
        <OrganizationDetailModal
          org={selectedOrg}
          orgs={orgs}
          onClose={() => setSelectedOrg(null)}
          onUpdated={(updated) => {
            setOrgs((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o))
            setSelectedOrg((prev) => prev ? { ...prev, ...updated } : prev)
          }}
        />
      )}
    </div>
  )
}

function OrgRow({ org, depth, hasChildren, collapsed, onToggleCollapse, onClick }: {
  org: Organization
  depth: number
  hasChildren: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onClick: () => void
}) {
  const isRoot = depth === 0
  const headName = (org.head_first_name || org.head_last_name)
    ? personName(org.head_last_name, org.head_first_name, org.head_middle_name)
    : null

  return (
    <button
      onClick={onClick}
      style={depth > 0 ? { paddingLeft: `${12 + depth * 28}px` } : undefined}
      className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-muted/40 hover:border-border/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {hasChildren ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleCollapse() }
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted-foreground/15 text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', collapsed && '-rotate-90')} />
        </span>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      {!isRoot && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />}
      <div className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
        isRoot ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white' : 'bg-muted text-muted-foreground'
      )}>
        {isRoot ? <Building2 className="h-4 w-4" /> : <Building2 className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('truncate', isRoot ? 'font-semibold text-[15px]' : 'font-medium text-sm')}>{org.name}</span>
          {org.head_id != null && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
          <Badge variant={org.is_active ? 'success' : 'destructive'} className="text-[10px] px-1.5 py-0 shrink-0">
            {org.is_active ? 'Активна' : 'Неактивна'}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[11px] text-muted-foreground">
          <span className="font-mono">{org.slug}</span>
          {org.inn && <span>· ИНН {org.inn}</span>}
          {headName && <span className="truncate">· {headName}</span>}
        </div>
      </div>
      {org.member_count !== undefined && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Users className="h-3.5 w-3.5" /> {org.member_count}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function CreateOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [inn, setInn] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 border border-border flex max-h-[85vh] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h3 className="font-semibold text-lg flex items-center gap-2"><Building2 className="h-5 w-5" /> Новое учреждение</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain">
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
  org, orgs, onClose, onUpdated,
}: {
  org: Organization
  orgs: Organization[]
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
    { id: 'members', name: 'Работники', icon: Users },
    { id: 'modules', name: 'Модули', icon: Boxes },
    { id: 'settings', name: 'Настройки', icon: SettingsIcon },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg truncate">{org.name}</h3>
                <Badge variant={org.is_active ? 'success' : 'destructive'} className="text-[10px] px-1.5 py-0 shrink-0">
                  {org.is_active ? 'Активна' : 'Неактивна'}
                </Badge>
              </div>
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

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-5">
          <div key={activeDetailTab} className="animate-fade-in">
            {activeDetailTab === 'info' && <InfoTab org={org} orgs={orgs} onToggleActive={handleToggleActive} onUpdated={onUpdated} />}
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

function InfoTab({ org, orgs, onToggleActive, onUpdated }: { org: Organization; orgs: Organization[]; onToggleActive: () => void; onUpdated: (updated: Partial<Organization>) => void }) {
  const [stats, setStats] = useState<{ members: number; departments: number; modulesEnabled: number } | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [savingField, setSavingField] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editName, setEditName] = useState(org.name)

  useEffect(() => { setEditName(org.name) }, [org.id, org.name])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [membersRes, deptsRes, modulesRes] = await Promise.all([
          fetchWithRetry(`${API_BASE_URL}/organizations/${org.id}/members`, { headers: getAuthHeaders() }),
          fetchWithRetry(`${API_BASE_URL}/departments`, { headers: { ...getAuthHeaders(), 'X-Organization-Id': String(org.id) } }),
          fetchWithRetry(`${API_BASE_URL}/modules`, { headers: { ...getAuthHeaders(), 'X-Organization-Id': String(org.id) } }),
        ])
        const membersData = membersRes.ok ? await membersRes.json() : []
        const depts = deptsRes.ok ? await deptsRes.json() : []
        const modules = modulesRes.ok ? await modulesRes.json() : { enabled: [] }
        setMembers(Array.isArray(membersData) ? membersData : [])
        setStats({
          members: Array.isArray(membersData) ? membersData.length : 0,
          departments: Array.isArray(depts) ? depts.length : 0,
          modulesEnabled: modules.enabled?.length ?? 0,
        })
      } catch {}
    }
    fetchStats()
  }, [org.id])

  const saveOrgField = async (field: 'head_id' | 'parent_id', value: number | null) => {
    setSavingField(true)
    setSaveError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/organizations/${org.id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        const head = field === 'head_id' && value !== null ? members.find((m) => m.id === value) : undefined
        const parent = field === 'parent_id' && value !== null ? orgs.find((o) => o.id === value) : undefined
        onUpdated({
          [field]: value,
          ...(field === 'head_id'
            ? { head_id: value, head_first_name: head?.first_name ?? null, head_last_name: head?.last_name ?? null, head_middle_name: head?.middle_name ?? null }
            : { parent_id: value, parent_name: parent?.name ?? null }),
        } as Partial<Organization>)
      } else {
        const data = await res.json()
        setSaveError(data.error || 'Ошибка')
      }
    } catch (err) { setSaveError(getErrorMessage(err)) }
    finally { setSavingField(false) }
  }

  const saveName = async () => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === org.name) return
    setSavingField(true)
    setSaveError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/organizations/${org.id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        onUpdated({ name: trimmed })
      } else {
        const data = await res.json()
        setSaveError(data.error || 'Ошибка')
      }
    } catch (err) { setSaveError(getErrorMessage(err)) }
    finally { setSavingField(false) }
  }

  const rows: { label: string; value: string | null }[] = [
    { label: 'Slug', value: org.slug },
    { label: 'ИНН', value: org.inn },
    { label: 'Адрес', value: org.address },
    { label: 'Дата создания', value: formatDateTime(org.created_at) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs">Работники</span>
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

      {saveError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {saveError}
        </div>
      )}

      <div className="rounded-xl border border-border/50 divide-y divide-border/40">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-sm text-muted-foreground shrink-0">Наименование учреждения</span>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Наименование учреждения"
            className="h-8 max-w-[60%] text-sm"
            disabled={savingField}
          />
        </div>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className={cn('text-sm font-medium', row.label === 'Slug' || row.label === 'ИНН' ? 'font-mono' : '')}>
              {row.value || '—'}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SettingsIcon className="h-4 w-4 text-muted-foreground" />
          Руководство и иерархия
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Руководитель учреждения</label>
          <select
            value={org.head_id ?? ''}
            disabled={savingField}
            onChange={(e) => saveOrgField('head_id', e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          >
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.last_name} {m.first_name} {m.middle_name || ''}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Вышестоящая организация</label>
          <select
            value={org.parent_id ?? ''}
            disabled={savingField}
            onChange={(e) => saveOrgField('parent_id', e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          >
            <option value="">—</option>
            {orgs.filter((o) => o.id !== org.id).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-between items-center gap-2">
        <Button variant={org.is_active ? 'outline' : 'default'} onClick={onToggleActive}>
          {org.is_active ? 'Деактивировать' : 'Активировать'}
        </Button>
        <Button onClick={saveName} disabled={savingField || !editName.trim() || editName.trim() === org.name}>
          {savingField ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {savingField ? 'Сохранение...' : 'Сохранить'}
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
      <p className="text-xs text-muted-foreground mb-3">Нажмите на отдел, чтобы посмотреть работников</p>
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
            {dept.manager_name && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Рук: {dept.manager_name}
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

  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true)
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/organizations/${orgId}/members`, { headers: getAuthHeaders() })
        if (res.ok) setMembers(await res.json())
      } catch {}
      finally { setLoading(false) }
    }
    fetchMembers()
  }, [orgId])

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
            Все работники
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
          <p>Работников нет</p>
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
                <option value="employee">Работник</option>
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
