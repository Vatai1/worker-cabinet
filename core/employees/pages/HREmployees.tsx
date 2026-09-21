import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  Users, Search, RotateCcw, X, Loader2, ChevronUp, ChevronDown, ArrowUpDown,
  User as UserIcon, Building2, Tag, Wallet,
} from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import { Switch } from '@/shared/components/ui/Switch'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { Avatar, AvatarImage, AvatarFallback } from '@/shared/components/ui/Avatar'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { useOrgStore } from '@/shared/store/orgStore'
import { apiGet, apiPut, apiPost, apiPatch } from '@/shared/lib/apiClient'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { getErrorMessage, personName } from '@/shared/lib/utils'

interface EmployeeTag {
  id: number
  name: string
}

interface EmployeeRow {
  id: number
  email: string
  first_name: string
  last_name: string
  middle_name: string | null
  position: string | null
  department_id: number | null
  department_name: string | null
  phone: string | null
  hire_date: string | null
  status: string
  role: string
  manager_id: number | null
  manager_name: string | null
  avatar: string | null
  office: string | null
  cabinet: string | null
  org_role: 'employee' | 'manager' | 'hr' | 'admin' | null
  org_is_active: boolean | null
  skills: string[]
  tags: EmployeeTag[]
  total_days?: number | null
  used_days?: number | null
  reserved_days?: number | null
  available_days?: number | null
}

interface SearchResponse {
  data: EmployeeRow[]
  total: number
  page: number
  limit: number
}

interface Department {
  id: number
  name: string
}

const ORG_ROLES: { value: EmployeeRow['org_role'] & string; label: string }[] = [
  { value: 'employee', label: 'Работник' },
  { value: 'manager', label: 'Руководитель' },
  { value: 'hr', label: 'HR' },
  { value: 'admin', label: 'Администратор' },
]

const ORG_ROLE_LABEL: Record<string, string> = Object.fromEntries(ORG_ROLES.map((r) => [r.value, r.label]))

const ORG_ROLE_BADGE: Record<string, 'default' | 'secondary' | 'warning' | 'success'> = {
  employee: 'secondary',
  manager: 'default',
  hr: 'warning',
  admin: 'success',
}

type SortKey = 'name' | 'position' | 'department'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

async function deleteSkillByName(userId: number, skill: string) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/skills`, {
    method: 'DELETE',
    headers: getAuthHeadersWithContentType(),
    body: JSON.stringify({ skill }),
    credentials: 'include',
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Ошибка' }))
    throw new Error(data.error || 'Ошибка')
  }
}

function EmployeeSettingsModal({
  employee,
  positions,
  departments,
  allTags,
  year,
  currentOrgId,
  onClose,
  onUpdated,
}: {
  employee: EmployeeRow
  positions: string[]
  departments: Department[]
  allTags: EmployeeTag[]
  year: number
  currentOrgId: number | null
  onClose: () => void
  onUpdated: (id: number, patch: Partial<EmployeeRow>) => void
}) {
  useModalOpen(true)

  // Profile section
  const [firstName, setFirstName] = useState(employee.first_name)
  const [lastName, setLastName] = useState(employee.last_name)
  const [middleName, setMiddleName] = useState(employee.middle_name || '')
  const [position, setPosition] = useState(employee.position || '')
  const [phone, setPhone] = useState(employee.phone || '')
  const [office, setOffice] = useState(employee.office || '')
  const [cabinet, setCabinet] = useState(employee.cabinet || '')
  const [hireDate, setHireDate] = useState(employee.hire_date ? employee.hire_date.slice(0, 10) : '')
  const [managerId, setManagerId] = useState(employee.manager_id ? String(employee.manager_id) : '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [managerCandidates, setManagerCandidates] = useState<EmployeeRow[]>([])

  // Organization section
  const [orgRole, setOrgRole] = useState<string>(employee.org_role || 'employee')
  const [departmentId, setDepartmentId] = useState(employee.department_id ? String(employee.department_id) : '')
  const [isActive, setIsActive] = useState(employee.org_is_active !== false)
  const [savingOrg, setSavingOrg] = useState(false)

  // Tags section
  const [checkedTagIds, setCheckedTagIds] = useState<Set<number>>(new Set(employee.tags.map((t) => t.id)))
  const [pendingTagId, setPendingTagId] = useState<number | null>(null)

  // Balance section
  const [balanceYear, setBalanceYear] = useState(year)
  const [totalDays, setTotalDays] = useState(String(employee.total_days ?? 28))
  const [usedDays, setUsedDays] = useState(employee.used_days ?? null)
  const [reservedDays, setReservedDays] = useState(employee.reserved_days ?? null)
  const [availableDays, setAvailableDays] = useState(employee.available_days ?? null)
  const [savingBalance, setSavingBalance] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)

  useEffect(() => {
    apiGet<EmployeeRow[]>('/users/search')
      .then((rows) => setManagerCandidates(rows.filter((u) => u.id !== employee.id)))
      .catch(() => setManagerCandidates([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (balanceYear === year) {
      setTotalDays(String(employee.total_days ?? 28))
      setUsedDays(employee.used_days ?? null)
      setReservedDays(employee.reserved_days ?? null)
      setAvailableDays(employee.available_days ?? null)
      return
    }
    if (!employee.department_id) return
    setBalanceLoading(true)
    apiGet<{ user_id: number; total_days: number; used_days: number; available_days: number }[]>(
      `/vacation/balances?departmentId=${employee.department_id}&year=${balanceYear}`
    )
      .then((rows) => {
        const row = rows.find((r) => r.user_id === employee.id)
        setTotalDays(String(row?.total_days ?? 28))
        setUsedDays(row?.used_days ?? null)
        setAvailableDays(row?.available_days ?? null)
        setReservedDays(null)
      })
      .catch(() => {})
      .finally(() => setBalanceLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceYear])

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await apiPut(`/users/${employee.id}`, {
        first_name: firstName,
        last_name: lastName,
        middle_name: middleName,
        position,
        phone,
        office,
        cabinet,
        hire_date: hireDate || null,
        manager_id: managerId ? Number(managerId) : null,
      })
      const manager = managerCandidates.find((m) => String(m.id) === managerId)
      onUpdated(employee.id, {
        first_name: firstName,
        last_name: lastName,
        middle_name: middleName,
        position,
        phone,
        office,
        cabinet,
        hire_date: hireDate || null,
        manager_id: managerId ? Number(managerId) : null,
        manager_name: manager ? personName(manager.last_name, manager.first_name, manager.middle_name) : null,
      })
      toast.success('Профиль обновлён')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }

  const saveOrganization = async () => {
    if (!currentOrgId) return
    setSavingOrg(true)
    try {
      await apiPut(`/organizations/${currentOrgId}/members/${employee.id}`, {
        org_role: orgRole,
        department_id: departmentId ? Number(departmentId) : null,
        is_active: isActive,
      })
      const dept = departments.find((d) => String(d.id) === departmentId)
      onUpdated(employee.id, {
        org_role: orgRole as EmployeeRow['org_role'],
        department_id: departmentId ? Number(departmentId) : null,
        department_name: dept?.name ?? null,
        org_is_active: isActive,
      })
      toast.success('Организационные данные обновлены')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingOrg(false)
    }
  }

  const toggleTag = async (tag: EmployeeTag) => {
    const wasChecked = checkedTagIds.has(tag.id)
    const next = new Set(checkedTagIds)
    if (wasChecked) next.delete(tag.id)
    else next.add(tag.id)
    setCheckedTagIds(next)
    setPendingTagId(tag.id)
    try {
      if (wasChecked) {
        await deleteSkillByName(employee.id, tag.name)
      } else {
        await apiPost(`/users/${employee.id}/skills`, { skill: tag.name })
      }
      const nextTags = allTags.filter((t) => next.has(t.id))
      onUpdated(employee.id, { tags: nextTags, skills: nextTags.map((t) => t.name) })
      toast.success(wasChecked ? `Тег «${tag.name}» снят` : `Тег «${tag.name}» назначен`)
    } catch (err) {
      const reverted = new Set(next)
      if (wasChecked) reverted.add(tag.id)
      else reverted.delete(tag.id)
      setCheckedTagIds(reverted)
      toast.error(getErrorMessage(err))
    } finally {
      setPendingTagId(null)
    }
  }

  const saveBalance = async () => {
    const days = Number(totalDays)
    if (Number.isNaN(days) || days < 0) {
      toast.error('Некорректное число дней')
      return
    }
    setSavingBalance(true)
    try {
      await apiPatch(`/vacation/balances/${employee.id}`, { year: balanceYear, total_days: days })
      if (balanceYear === year) {
        onUpdated(employee.id, { total_days: days, available_days: days - (usedDays ?? 0) - (reservedDays ?? 0) })
      }
      toast.success('Баланс отпуска обновлён')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingBalance(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <Card className="relative flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden p-0 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight truncate">{personName(lastName, firstName, middleName)}</h2>
              <p className="text-xs text-muted-foreground truncate">{employee.email}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-5 space-y-6">
          {/* Profile */}
          <section>
            <p className="flex items-center gap-2 text-sm font-semibold mb-3">
              <UserIcon className="h-4 w-4 text-muted-foreground" /> Профиль
            </p>
            <div className="grid grid-cols-3 gap-2.5 mb-2.5">
              <Input placeholder="Фамилия" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Имя" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Отчество" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Должность</label>
                <SelectDropdown
                  options={[{ value: '', label: 'Не указана' }, ...positions.map((p) => ({ value: p, label: p }))]}
                  value={position}
                  onChange={setPosition}
                  className="w-full min-w-0"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Руководитель</label>
                <SelectDropdown
                  options={[{ value: '', label: 'Без руководителя' }, ...managerCandidates.map((m) => ({ value: String(m.id), label: personName(m.last_name, m.first_name, m.middle_name) }))]}
                  value={managerId}
                  onChange={setManagerId}
                  className="w-full min-w-0"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5 mb-3">
              <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Офис" value={office} onChange={(e) => setOffice(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Кабинет" value={cabinet} onChange={(e) => setCabinet(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-muted-foreground">Дата найма</label>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className="h-9 w-48 text-sm" />
            </div>
            <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Сохранить профиль
            </Button>
          </section>

          {/* Organization */}
          <section className="pt-5 border-t border-border">
            <p className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Building2 className="h-4 w-4 text-muted-foreground" /> Организация
            </p>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Роль</label>
                <SelectDropdown options={ORG_ROLES} value={orgRole} onChange={setOrgRole} className="w-full min-w-0" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Отдел</label>
                <SelectDropdown
                  options={[{ value: '', label: 'Без отдела' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]}
                  value={departmentId}
                  onChange={setDepartmentId}
                  className="w-full min-w-0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2.5 mb-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <span className="text-sm">{isActive ? 'Активен в организации' : 'Отключён'}</span>
            </div>
            <Button size="sm" onClick={saveOrganization} disabled={savingOrg || !currentOrgId}>
              {savingOrg && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Сохранить организацию
            </Button>
          </section>

          {/* Tags */}
          <section className="pt-5 border-t border-border">
            <p className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Tag className="h-4 w-4 text-muted-foreground" /> Теги
            </p>
            {allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground">В организации ещё нет тегов</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2 space-y-0.5">
                {allTags.map((tag) => {
                  const checked = checkedTagIds.has(tag.id)
                  return (
                    <label key={tag.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pendingTagId === tag.id}
                        onChange={() => toggleTag(tag)}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      <span className="flex-1">{tag.name}</span>
                      {pendingTagId === tag.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </label>
                  )
                })}
              </div>
            )}
          </section>

          {/* Balance */}
          <section className="pt-5 border-t border-border">
            <p className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Wallet className="h-4 w-4 text-muted-foreground" /> Баланс отпусков
            </p>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Год</label>
                <SelectDropdown
                  options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
                  value={String(balanceYear)}
                  onChange={(v) => setBalanceYear(Number(v))}
                  className="w-full min-w-0"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Всего дней</label>
                <Input
                  type="number"
                  min={0}
                  value={totalDays}
                  onChange={(e) => setTotalDays(e.target.value)}
                  disabled={balanceLoading}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {balanceLoading
                ? 'Загрузка…'
                : `Использовано: ${usedDays ?? '—'} · Зарезервировано: ${reservedDays ?? '—'} · Доступно: ${availableDays ?? '—'}`}
            </p>
            <Button size="sm" onClick={saveBalance} disabled={savingBalance || balanceLoading}>
              {savingBalance && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Сохранить баланс
            </Button>
          </section>
        </div>
      </Card>
    </div>,
    document.body
  )
}

export function HREmployees() {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [orgRole, setOrgRole] = useState('')
  const [tagId, setTagId] = useState('')
  const [year, setYear] = useState(CURRENT_YEAR)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const [departments, setDepartments] = useState<Department[]>([])
  const [allTags, setAllTags] = useState<EmployeeTag[]>([])
  const [positions, setPositions] = useState<string[]>([])

  const [selected, setSelected] = useState<EmployeeRow | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    apiGet<Department[]>('/dictionaries/departments').then(setDepartments).catch(() => setDepartments([]))
    apiGet<{ id: number; name: string }[]>('/dictionaries/skills').then((rows) => setAllTags(rows.map((r) => ({ id: r.id, name: r.name })))).catch(() => setAllTags([]))
    apiGet<{ name: string }[]>('/dictionaries/positions').then((rows) => setPositions(rows.map((r) => r.name))).catch(() => setPositions([]))
  }, [currentOrgId])

  const fetchEmployees = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (departmentId) params.set('departmentId', departmentId)
    if (orgRole) params.set('orgRole', orgRole)
    if (tagId) params.set('tagId', tagId)
    params.set('year', String(year))
    params.set('page', String(page))
    params.set('limit', String(limit))
    apiGet<SearchResponse>(`/users/search?${params}`)
      .then((res) => { setRows(res.data); setTotal(res.total) })
      .catch(() => { setRows([]); setTotal(0) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchEmployees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, departmentId, orgRole, tagId, year, page, currentOrgId])

  const resetFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setDepartmentId('')
    setOrgRole('')
    setTagId('')
    setYear(CURRENT_YEAR)
    setPage(1)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    const dir = sortDir === 'asc' ? 1 : -1
    const keyFn = (r: EmployeeRow) => {
      if (sortKey === 'name') return personName(r.last_name, r.first_name, r.middle_name)
      if (sortKey === 'position') return r.position || ''
      return r.department_name || ''
    }
    return [...rows].sort((a, b) => keyFn(a).localeCompare(keyFn(b), 'ru') * dir)
  }, [rows, sortKey, sortDir])

  const handleUpdated = (id: number, patch: Partial<EmployeeRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const SortIcon = ({ active }: { active: boolean }) =>
    active ? (sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />

  return (
    <Card>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
            <Users className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Сотрудники</h2>
            <p className="text-xs text-muted-foreground">Профили, роли, теги, балансы отпусков</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени, должности, тегу…"
              className="h-9 w-full rounded-[10px] border border-border bg-card pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <SelectDropdown
            options={[{ value: '', label: 'Все отделы' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]}
            value={departmentId}
            onChange={(v) => { setDepartmentId(v); setPage(1) }}
          />
          <SelectDropdown
            options={[{ value: '', label: 'Все роли' }, ...ORG_ROLES]}
            value={orgRole}
            onChange={(v) => { setOrgRole(v); setPage(1) }}
          />
          <SelectDropdown
            options={[{ value: '', label: 'Все теги' }, ...allTags.map((t) => ({ value: String(t.id), label: t.name }))]}
            value={tagId}
            onChange={(v) => { setTagId(v); setPage(1) }}
          />
          <SelectDropdown
            options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
            value={String(year)}
            onChange={(v) => { setYear(Number(v)); setPage(1) }}
          />
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-[15px] py-[9px] text-[13px] font-semibold text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
          >
            <RotateCcw className="h-[14px] w-[14px]" />
            Сбросить
          </button>
        </div>

        {loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">Никого не нашли</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">
                    <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-foreground">
                      Сотрудник <SortIcon active={sortKey === 'name'} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <button type="button" onClick={() => toggleSort('position')} className="inline-flex items-center gap-1 hover:text-foreground">
                      Должность <SortIcon active={sortKey === 'position'} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <button type="button" onClick={() => toggleSort('department')} className="inline-flex items-center gap-1 hover:text-foreground">
                      Отдел <SortIcon active={sortKey === 'department'} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 font-medium">Роль</th>
                  <th className="px-4 py-2.5 font-medium">Теги</th>
                  <th className="px-4 py-2.5 font-medium">Баланс</th>
                  <th className="px-4 py-2.5 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={r.avatar || generateAvatarUrl(String(r.id))} alt="" />
                          <AvatarFallback className="text-xs">{r.first_name?.[0]}{r.last_name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{personName(r.last_name, r.first_name, r.middle_name)}</p>
                          <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px]">{r.position || '—'}</td>
                    <td className="px-4 py-2.5 text-[13px]">{r.department_name || '—'}</td>
                    <td className="px-4 py-2.5">
                      {r.org_role ? (
                        <Badge variant={ORG_ROLE_BADGE[r.org_role]}>{ORG_ROLE_LABEL[r.org_role]}</Badge>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {r.tags.slice(0, 3).map((t) => (
                          <Badge key={t.id} variant="outline" className="text-[10px]">{t.name}</Badge>
                        ))}
                        {r.tags.length > 3 && <Badge variant="outline" className="text-[10px]">+{r.tags.length - 3}</Badge>}
                        {r.tags.length === 0 && <span className="text-xs text-muted-foreground/60">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] tabular-nums">
                      {r.available_days ?? '—'} / {r.total_days ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={r.org_is_active === false ? 'destructive' : 'success'}>
                        {r.org_is_active === false ? 'Отключён' : 'Активен'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Назад</Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages} · {total} сотрудников</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Вперёд</Button>
          </div>
        )}
      </div>

      {selected && (
        <EmployeeSettingsModal
          employee={selected}
          positions={positions}
          departments={departments}
          allTags={allTags}
          year={year}
          currentOrgId={currentOrgId}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </Card>
  )
}
