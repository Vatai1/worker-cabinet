import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  Users, Search, RotateCcw, X, Loader2, ChevronUp, ChevronDown, ArrowUpDown,
  User as UserIcon, Building2, Tag, Wallet, Lock, ShieldCheck, Globe, Unlock, Star, Trash2,
  ChevronRight, Plane, Server, KeyRound, Download,
} from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { FilterHeader, TableEmptyRow } from '@/shared/components/ui/DataTable'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import { Switch } from '@/shared/components/ui/Switch'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { type CheckListItem } from '@/shared/components/ui/SearchableCheckList'
import { Avatar, AvatarImage, AvatarFallback } from '@/shared/components/ui/Avatar'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { useOrgStore } from '@/shared/store/orgStore'
import { apiGet, apiPut, apiPost, apiPatch, apiDelete } from '@/shared/lib/apiClient'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { cn, getErrorMessage, personName } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { LeaveAdjustmentsSection } from '@/modules/vacation/components/LeaveAdjustmentsSection'
import { NameGenitiveForm, type NameGenitiveInfo, type PersonName } from '@/shared/components/NameGenitive'

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

const SYSTEM_ROLE_LABELS: Record<string, string> = {
  employee: 'Работник',
  manager: 'Руководитель',
  hr: 'HR-менеджер',
  admin: 'Администратор',
  superadmin: 'Суперадминистратор',
  director: 'Директор',
  onboarding: 'Онбординг',
}

interface SystemRole {
  id: number
  name: string
}

interface OrgMembership {
  id: number
  name: string
  org_role: string
  department_name: string | null
  is_primary: boolean
  is_active: boolean
}

const ACCOUNT_STATUS_LABELS: Record<string, string> = { active: 'активен', inactive: 'деактивирован', on_leave: 'в отпуске' }

const STATUS_FILTER_OPTIONS: CheckListItem[] = [
  { id: 'active', label: 'Активен' },
  { id: 'inactive', label: 'Отключён' },
]

type SortKey = 'name' | 'position' | 'department'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

interface TechnicalInfo {
  id: number
  email: string
  keycloak_guid: string | null
  created_at: string | null
  updated_at: string | null
  last_seen_at: string | null
  locked_until: string | null
  failed_login_count: number | null
  logins_count: number
  last_login: { at: string; ip: string | null; method: string | null } | null
  keycloak_login: {
    at: string
    claims: Record<string, unknown>
    applied: { userCreated?: boolean; organizations?: { slug: string; name: string; role: string }[]; department?: string | null; orgSource?: string } | null
  } | null
}

type EmployeeModalTab = 'main' | 'vacation' | 'service'

interface TravelState {
  hire_date: string | null
  last_used_date: string | null
  next_available_date: string | null
  pending: boolean
}

const addYears = (date: string, years: number) => {
  const d = new Date(`${date}T00:00:00`)
  d.setFullYear(d.getFullYear() + years)
  return d
}

const formatDay = (d: Date) => d.toLocaleDateString('ru-RU')

function workingYear(hireDate: string | null) {
  if (!hireDate) return null
  const today = new Date()
  let start = new Date(`${hireDate.slice(0, 10)}T00:00:00`)
  start.setFullYear(today.getFullYear())
  if (start > today) start.setFullYear(today.getFullYear() - 1)
  if (start < new Date(`${hireDate.slice(0, 10)}T00:00:00`)) start = new Date(`${hireDate.slice(0, 10)}T00:00:00`)
  const end = new Date(start)
  end.setFullYear(end.getFullYear() + 1)
  end.setDate(end.getDate() - 1)
  return { start, end }
}

const EMPLOYEE_MODAL_TABS: { id: EmployeeModalTab; label: string; icon: typeof UserIcon }[] = [
  { id: 'main', label: 'Основная информация', icon: UserIcon },
  { id: 'vacation', label: 'Отпуск', icon: Plane },
  { id: 'service', label: 'Служебная информация', icon: Server },
]

const LOGIN_METHOD_LABELS: Record<string, string> = { keycloak: 'Keycloak', password: 'пароль' }
const ORG_SOURCE_LABELS: Record<string, string> = { groups: 'группы Keycloak', company: 'атрибут company', default: 'организация по умолчанию' }

const formatDateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function InfoRow({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 break-all', mono && 'font-mono text-xs')}>{children}</span>
    </div>
  )
}

function TechnicalInfoSection({ userId }: { userId: number }) {
  const [info, setInfo] = useState<TechnicalInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<TechnicalInfo>(`/users/${userId}/technical`).then(setInfo).catch((err) => setError(getErrorMessage(err)))
  }, [userId])

  if (error) return <p className="text-xs text-destructive">{error}</p>
  if (!info) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>

  const kc = info.keycloak_login
  const locked = info.locked_until && new Date(info.locked_until) > new Date()
  return (
    <div className="space-y-5">
      <section>
        <p className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Server className="h-4 w-4 text-muted-foreground" /> Учётная запись
        </p>
        <div className="divide-y divide-border/60 rounded-xl border border-border/60">
          <InfoRow label="ID" mono>{info.id}</InfoRow>
          <InfoRow label="Email" mono>{info.email}</InfoRow>
          <InfoRow label="Keycloak ID" mono>{info.keycloak_guid || <span className="font-sans text-muted-foreground">не привязан</span>}</InfoRow>
          <InfoRow label="Создан">{formatDateTime(info.created_at)}</InfoRow>
          <InfoRow label="Изменён">{formatDateTime(info.updated_at)}</InfoRow>
          <InfoRow label="Последняя активность">{formatDateTime(info.last_seen_at)}</InfoRow>
          <InfoRow label="Последний вход">
            {info.last_login
              ? <>{formatDateTime(info.last_login.at)} · {LOGIN_METHOD_LABELS[info.last_login.method ?? ''] || info.last_login.method || '—'}{info.last_login.ip && <span className="text-muted-foreground"> · {info.last_login.ip}</span>}</>
              : '—'}
          </InfoRow>
          <InfoRow label="Всего входов">{info.logins_count}</InfoRow>
          <InfoRow label="Неудачных попыток">
            {info.failed_login_count ?? 0}
            {locked && <span className="ml-2 text-destructive">заблокирован до {formatDateTime(info.locked_until)}</span>}
          </InfoRow>
        </div>
      </section>

      <section>
        <p className="flex items-center gap-2 text-sm font-semibold mb-3">
          <KeyRound className="h-4 w-4 text-muted-foreground" /> Данные из Keycloak
        </p>
        {!kc ? (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">Работник ещё не входил через Keycloak</p>
        ) : (
          <div className="space-y-3">
            <div className="divide-y divide-border/60 rounded-xl border border-border/60">
              <InfoRow label="Последний вход через KC">{formatDateTime(kc.at)}</InfoRow>
              {kc.applied?.orgSource && <InfoRow label="Организация определена по">{ORG_SOURCE_LABELS[kc.applied.orgSource] || kc.applied.orgSource}</InfoRow>}
              {kc.applied?.organizations && (
                <InfoRow label="Организации">
                  {kc.applied.organizations.length ? kc.applied.organizations.map((o) => `${o.name} (${o.role})`).join(', ') : '—'}
                </InfoRow>
              )}
              {kc.applied && <InfoRow label="Отдел">{kc.applied.department || '—'}</InfoRow>}
              {kc.applied?.userCreated && <InfoRow label="Создан при входе">да</InfoRow>}
            </div>
            <details className="group rounded-xl border border-border/60">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                Атрибуты токена ({Object.keys(kc.claims).length})
              </summary>
              <div className="divide-y divide-border/60 border-t border-border/60">
                {Object.entries(kc.claims).map(([key, value]) => (
                  <InfoRow key={key} label={key} mono>{typeof value === 'string' ? value : JSON.stringify(value)}</InfoRow>
                ))}
              </div>
            </details>
          </div>
        )}
      </section>
    </div>
  )
}

function ManagerPicker({ excludeId, value, label, onChange }: {
  excludeId: number
  value: string
  label: string
  onChange: (id: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<EmployeeRow[] | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: '1', limit: '10' })
      if (q.trim()) params.set('q', q.trim())
      apiGet<SearchResponse>(`/users/search?${params}`)
        .then((res) => setResults(res.data.filter((u) => u.id !== excludeId)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [q, open, excludeId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const pick = (id: string, name: string) => {
    onChange(id, name)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm"
      >
        <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? label : 'Без руководителя'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по ФИО или должности…" className="h-8 text-sm" />
          </div>
          <div className="max-h-56 overflow-y-auto scrollbar-thin p-1">
            {value && (
              <button type="button" onClick={() => pick('', '')} className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted">
                Без руководителя
              </button>
            )}
            {results === null ? (
              <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : results.length === 0 ? (
              <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">Ничего не найдено</p>
            ) : results.map((u) => {
              const name = personName(u.last_name, u.first_name, u.middle_name)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pick(String(u.id), name)}
                  className={cn('w-full rounded-md px-2.5 py-1.5 text-left hover:bg-muted', String(u.id) === value && 'bg-primary/10')}
                >
                  <p className="truncate text-sm">{name}</p>
                  {u.position && <p className="truncate text-[11px] text-muted-foreground">{u.position}</p>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

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
  adminMode,
  isGlobalMode,
  systemRoles,
  onClose,
  onUpdated,
}: {
  employee: EmployeeRow
  positions: string[]
  departments: Department[]
  allTags: EmployeeTag[]
  year: number
  currentOrgId: number | null
  adminMode?: boolean
  isGlobalMode?: boolean
  systemRoles: SystemRole[]
  onClose: () => void
  onUpdated: (id: number, patch: Partial<EmployeeRow>) => void
}) {
  useModalOpen(true)
  const [tab, setTab] = useState<EmployeeModalTab>('main')
  const requestCloseRef = useRef<() => void>(onClose)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
  const [managerName, setManagerName] = useState(employee.manager_name || '')
  const [genitiveInfo, setGenitiveInfo] = useState<NameGenitiveInfo | null>(null)
  const [genitive, setGenitive] = useState<PersonName | null>(null)
  const [genitiveAction, setGenitiveAction] = useState<'none' | 'save' | 'reset'>('none')
  const genitiveActionRef = useRef(genitiveAction)
  genitiveActionRef.current = genitiveAction

  useEffect(() => {
    apiGet<NameGenitiveInfo>(`/users/${employee.id}/name-genitive`)
      .then((info) => {
        setGenitiveInfo(info)
        setGenitive(info.genitive)
      })
      .catch(() => setGenitiveInfo(null))
  }, [employee.id])

  useEffect(() => {
    if (!genitiveInfo) return
    const { nominative } = genitiveInfo
    if (nominative.lastName === lastName.trim() && nominative.firstName === firstName.trim() && nominative.middleName === middleName.trim()) return
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ lastName: lastName.trim(), firstName: firstName.trim(), middleName: middleName.trim() })
      apiGet<NameGenitiveInfo>(`/users/${employee.id}/name-genitive?${params}`)
        .then((info) => {
          setGenitiveInfo((prev) => (prev ? { ...prev, nominative: info.nominative, suggestion: info.suggestion } : prev))
          if (genitiveActionRef.current !== 'save' && (genitiveActionRef.current === 'reset' || !info.saved)) setGenitive(info.suggestion)
        })
        .catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
  }, [lastName, firstName, middleName, genitiveInfo, employee.id])

  // Organization section
  const [orgRole, setOrgRole] = useState<string>(employee.org_role || 'employee')
  const [departmentId, setDepartmentId] = useState(employee.department_id ? String(employee.department_id) : '')
  const [isActive, setIsActive] = useState(employee.org_is_active !== false)

  // Common save (profile + organization + balance)
  const [savingAll, setSavingAll] = useState(false)

  // Tags section
  const [checkedTagIds, setCheckedTagIds] = useState<Set<number>>(new Set(employee.tags.map((t) => t.id)))
  const [pendingTagId, setPendingTagId] = useState<number | null>(null)

  // Balance section
  const [balanceYear, setBalanceYear] = useState(year)
  const [totalDays, setTotalDays] = useState(String(employee.total_days ?? 28))
  const [usedDays, setUsedDays] = useState(employee.used_days ?? null)
  const [reservedDays, setReservedDays] = useState(employee.reserved_days ?? null)
  const [availableDays, setAvailableDays] = useState(employee.available_days ?? null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceBaseline, setBalanceBaseline] = useState(String(employee.total_days ?? 28))

  // Travel section
  const [travel, setTravel] = useState<TravelState | null>(null)
  const [travelLastUsed, setTravelLastUsed] = useState('')
  const [travelNext, setTravelNext] = useState('')

  useEffect(() => {
    if (!currentOrgId) return
    apiGet<TravelState>(`/vacation/travel/${employee.id}`)
      .then((t) => {
        setTravel(t)
        setTravelLastUsed(t.last_used_date?.slice(0, 10) ?? '')
        setTravelNext(t.next_available_date?.slice(0, 10) ?? '')
      })
      .catch(() => setTravel(null))
  }, [employee.id, currentOrgId])

  // Account section (admin only): global status + system role + password reset
  const [status, setStatus] = useState(employee.status)
  const [savingStatus, setSavingStatus] = useState(false)
  const [systemRole, setSystemRole] = useState(employee.role)
  const [savingRole, setSavingRole] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  // Organizations section (admin + global only): cross-org membership management
  const [memberships, setMemberships] = useState<OrgMembership[]>([])
  const [allOrgs, setAllOrgs] = useState<{ id: number; name: string }[]>([])
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [addOrgId, setAddOrgId] = useState('')
  const [addOrgRole, setAddOrgRole] = useState('employee')
  const [orgBusy, setOrgBusy] = useState(false)

  useEffect(() => {
    if (balanceYear === year) {
      setTotalDays(String(employee.total_days ?? 28))
      setBalanceBaseline(String(employee.total_days ?? 28))
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
        setBalanceBaseline(String(row?.total_days ?? 28))
        setUsedDays(row?.used_days ?? null)
        setAvailableDays(row?.available_days ?? null)
        setReservedDays(null)
      })
      .catch(() => {})
      .finally(() => setBalanceLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceYear])

  const loadMemberships = async () => {
    setOrgsLoading(true)
    try {
      const [user, orgs] = await Promise.all([
        apiGet<{ organizations: OrgMembership[] }>(`/users/${employee.id}`),
        apiGet<{ id: number; name: string }[]>('/organizations'),
      ])
      setMemberships(user.organizations || [])
      setAllOrgs(orgs)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setOrgsLoading(false)
    }
  }

  useEffect(() => {
    if (adminMode && isGlobalMode) loadMemberships()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminMode, isGlobalMode])

  const [baseline, setBaseline] = useState(() => ({
    firstName: employee.first_name,
    lastName: employee.last_name,
    middleName: employee.middle_name || '',
    position: employee.position || '',
    phone: employee.phone || '',
    office: employee.office || '',
    cabinet: employee.cabinet || '',
    hireDate: employee.hire_date ? employee.hire_date.slice(0, 10) : '',
    managerId: employee.manager_id ? String(employee.manager_id) : '',
    departmentId: employee.department_id ? String(employee.department_id) : '',
    orgRole: (employee.org_role || 'employee') as string,
    isActive: employee.org_is_active !== false,
  }))

  const profileDirty = firstName !== baseline.firstName || lastName !== baseline.lastName || middleName !== baseline.middleName
    || position !== baseline.position || phone !== baseline.phone || office !== baseline.office || cabinet !== baseline.cabinet
    || hireDate !== baseline.hireDate || managerId !== baseline.managerId || departmentId !== baseline.departmentId
  const orgDirty = !!currentOrgId && (orgRole !== baseline.orgRole || departmentId !== baseline.departmentId || isActive !== baseline.isActive)
  const balanceDirty = !balanceLoading && totalDays !== balanceBaseline
  const travelDirty = !!travel && (travelLastUsed !== (travel.last_used_date?.slice(0, 10) ?? '') || travelNext !== (travel.next_available_date?.slice(0, 10) ?? ''))
  const genitiveDirty = genitiveAction !== 'none'
  const isDirty = profileDirty || orgDirty || balanceDirty || travelDirty || genitiveDirty

  const requestClose = async () => {
    if (savingAll) return
    if (isDirty && !(await confirmDialog({
      title: 'Несохранённые изменения',
      message: 'В карточке есть несохранённые изменения. Закрыть без сохранения?',
      confirmText: 'Закрыть',
      variant: 'danger',
    }))) return
    onClose()
  }
  requestCloseRef.current = requestClose

  const saveAll = async () => {
    const days = Number(totalDays)
    if (balanceDirty && (totalDays.trim() === '' || Number.isNaN(days) || days < 0)) {
      toast.error('Некорректное число дней в балансе отпуска')
      return
    }
    if (travelLastUsed && travelNext && travelNext < travelLastUsed) {
      toast.error('Дата доступности проезда не может быть раньше последнего использования')
      return
    }
    if (genitiveAction === 'save' && genitive && (!genitive.lastName.trim() || !genitive.firstName.trim())) {
      toast.error('Укажите фамилию и имя в родительном падеже')
      return
    }
    if (!isDirty) {
      toast('Изменений нет')
      return
    }

    const tasks: { label: string; run: () => Promise<unknown>; done: () => void }[] = []
    if (profileDirty) {
      tasks.push({
        label: 'Профиль',
        run: () => apiPut(`/users/${employee.id}`, {
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          position,
          phone,
          office,
          cabinet,
          hire_date: hireDate || null,
          manager_id: managerId ? Number(managerId) : null,
          department_id: departmentId ? Number(departmentId) : null,
        }),
        done: () => {
          setBaseline((b) => ({ ...b, firstName, lastName, middleName, position, phone, office, cabinet, hireDate, managerId, departmentId }))
          const dept = departments.find((d) => String(d.id) === departmentId)
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
            manager_name: managerId ? managerName : null,
            department_id: departmentId ? Number(departmentId) : null,
            department_name: dept?.name ?? null,
          })
        },
      })
    }
    if (orgDirty) {
      tasks.push({
        label: 'Организация',
        run: () => apiPut(`/organizations/${currentOrgId}/members/${employee.id}`, {
          org_role: orgRole,
          department_id: departmentId ? Number(departmentId) : null,
          is_active: isActive,
        }),
        done: () => {
          setBaseline((b) => ({ ...b, orgRole, departmentId, isActive }))
          onUpdated(employee.id, { org_role: orgRole as EmployeeRow['org_role'], org_is_active: isActive })
        },
      })
    }
    if (balanceDirty) {
      tasks.push({
        label: 'Баланс отпуска',
        run: () => apiPatch(`/vacation/balances/${employee.id}`, { year: balanceYear, total_days: days }),
        done: () => {
          setBalanceBaseline(totalDays)
          if (balanceYear === year) onUpdated(employee.id, { total_days: days, available_days: days - (usedDays ?? 0) - (reservedDays ?? 0) })
        },
      })
    }
    if (travelDirty) {
      let saved: TravelState | null = null
      tasks.push({
        label: 'Проезд',
        run: async () => { saved = await apiPut<TravelState>(`/vacation/travel/${employee.id}`, { last_used_date: travelLastUsed || null, next_available_date: travelNext || null }) },
        done: () => {
          if (!saved) return
          setTravel(saved)
          setTravelLastUsed(saved.last_used_date?.slice(0, 10) ?? '')
          setTravelNext(saved.next_available_date?.slice(0, 10) ?? '')
        },
      })
    }
    if (genitiveDirty) {
      tasks.push({
        label: 'Склонение ФИО',
        run: () => apiPut(`/users/${employee.id}/name-genitive`, genitiveAction === 'reset' ? { reset: true } : genitive),
        done: () => {
          if (genitiveInfo && genitive) setGenitiveInfo({ ...genitiveInfo, saved: genitiveAction === 'save', genitive })
          setGenitiveAction('none')
        },
      })
    }

    setSavingAll(true)
    try {
      const results = await Promise.allSettled(tasks.map((t) => t.run()))
      const failed: string[] = []
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') tasks[i].done()
        else failed.push(`${tasks[i].label}: ${getErrorMessage(r.reason)}`)
      })
      if (failed.length === 0) toast.success('Сохранено')
      else if (failed.length === tasks.length) toast.error(`Не сохранено. ${failed.join('; ')}`, { duration: 10000 })
      else toast.warning(`Сохранено частично. Не сохранено — ${failed.join('; ')}`, { duration: 10000 })
    } finally {
      setSavingAll(false)
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

  const toggleStatus = async () => {
    const nextStatus = status === 'active' ? 'inactive' : 'active'
    const confirmed = await confirmDialog({
      title: nextStatus === 'active' ? 'Активировать' : 'Деактивировать',
      message: `${nextStatus === 'active' ? 'Активировать' : 'Деактивировать'} ${personName(lastName, firstName, middleName)}?`,
      confirmText: nextStatus === 'active' ? 'Активировать' : 'Деактивировать',
      variant: nextStatus === 'inactive' ? 'danger' : 'default',
    })
    if (!confirmed) return
    setSavingStatus(true)
    try {
      await apiPut(`/admin/users/${employee.id}/status`, { status: nextStatus })
      setStatus(nextStatus)
      onUpdated(employee.id, { status: nextStatus })
      toast.success('Статус обновлён')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingStatus(false)
    }
  }

  const saveSystemRole = async () => {
    setSavingRole(true)
    try {
      await apiPut(`/admin/users/${employee.id}/role`, { role: systemRole })
      onUpdated(employee.id, { role: systemRole })
      toast.success('Роль обновлена')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingRole(false)
    }
  }

  const resetPassword = async () => {
    if (newPassword.length < 6) {
      toast.error('Пароль должен быть не менее 6 символов')
      return
    }
    const confirmed = await confirmDialog({
      title: 'Сбросить пароль',
      message: `Установить новый пароль для ${personName(lastName, firstName, middleName)}?`,
      confirmText: 'Сбросить',
      variant: 'danger',
    })
    if (!confirmed) return
    setResettingPassword(true)
    try {
      await apiPost(`/admin/users/${employee.id}/reset-password`, { newPassword })
      setNewPassword('')
      toast.success('Пароль сброшен')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setResettingPassword(false)
    }
  }

  const addMembership = async () => {
    if (!addOrgId) return
    setOrgBusy(true)
    try {
      await apiPost(`/organizations/${addOrgId}/members`, { email: employee.email, org_role: addOrgRole })
      setAddOrgId('')
      setAddOrgRole('employee')
      await loadMemberships()
      toast.success('Добавлен в организацию')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setOrgBusy(false)
    }
  }

  const removeMembership = async (org: OrgMembership) => {
    const confirmed = await confirmDialog({
      title: 'Исключить из организации',
      message: `Исключить ${personName(lastName, firstName, middleName)} из «${org.name}»?`,
      confirmText: 'Исключить',
      variant: 'danger',
    })
    if (!confirmed) return
    setOrgBusy(true)
    try {
      await apiDelete(`/organizations/${org.id}/members/${employee.id}`)
      await loadMemberships()
      toast.success('Исключён из организации')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setOrgBusy(false)
    }
  }

  const makePrimary = async (org: OrgMembership) => {
    setOrgBusy(true)
    try {
      await apiPatch(`/users/${employee.id}/primary-org`, { orgId: org.id })
      await loadMemberships()
      toast.success('Основная организация изменена')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setOrgBusy(false)
    }
  }

  const changeMembershipRole = async (org: OrgMembership, newOrgRole: string) => {
    setOrgBusy(true)
    try {
      await apiPut(`/organizations/${org.id}/members/${employee.id}`, { org_role: newOrgRole })
      await loadMemberships()
    } catch (err) {
      toast.error(getErrorMessage(err))
      await loadMemberships()
    } finally {
      setOrgBusy(false)
    }
  }

  const workYear = workingYear(hireDate || null)
  const travelStatus = !travel
    ? { label: '', tone: '' }
    : travel.pending
      ? { label: 'Заявка на согласовании', tone: 'border-amber-500/30 text-amber-600 dark:text-amber-400' }
      : travelNext && travelNext <= new Date().toLocaleDateString('sv-SE')
        ? { label: 'Доступен', tone: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' }
        : { label: travelNext ? `Недоступен до ${formatDay(addYears(travelNext, 0))}` : 'Недоступен', tone: 'border-border text-muted-foreground' }

  const availableOrgsToAdd = allOrgs.filter((o) => !memberships.some((m) => m.id === o.id))

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={requestClose} />
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
          <button type="button" onClick={requestClose} aria-label="Закрыть" className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-5" role="tablist">
          {EMPLOYEE_MODAL_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2.5 text-sm font-medium transition-colors',
                tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-5 space-y-6">
          {tab === 'main' && <>
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
            {genitiveInfo && genitive && (
              <details data-testid="employee-name-genitive" className="group mb-3 rounded-xl border border-border/60">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <span className="text-xs font-medium">Отображение в документах</span>
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                    от {[genitive.lastName, genitive.firstName, genitive.middleName].filter(Boolean).join(' ')} · {genitiveAction === 'reset' || (!genitiveInfo.saved && genitiveAction === 'none') ? 'автоматически' : 'задано вручную'}
                  </span>
                </summary>
                <div className="border-t border-border/60 p-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">Родительный падеж — «от кого» в заявлениях</p>
                    {(genitiveInfo.saved || genitiveAction === 'save') && genitiveAction !== 'reset' && (
                      <button
                        type="button"
                        onClick={() => {
                          setGenitive(genitiveInfo.suggestion)
                          setGenitiveAction(genitiveInfo.saved ? 'reset' : 'none')
                        }}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Вернуть автоматическое
                      </button>
                    )}
                  </div>
                  <NameGenitiveForm
                    nominative={genitiveInfo.nominative}
                    value={genitive}
                    onChange={(v) => {
                      setGenitive(v)
                      setGenitiveAction('save')
                    }}
                  />
                </div>
              </details>
            )}
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
                <ManagerPicker
                  excludeId={employee.id}
                  value={managerId}
                  label={managerName}
                  onChange={(id, name) => { setManagerId(id); setManagerName(name) }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5 mb-3">
              <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Офис" value={office} onChange={(e) => setOffice(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Кабинет" value={cabinet} onChange={(e) => setCabinet(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Дата найма</label>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className="h-9 w-48 text-sm" />
            </div>
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
            <div className="flex items-center gap-2.5">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <span className="text-sm">{isActive ? 'Активен в организации' : 'Отключён'}</span>
            </div>
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

          </>}

          {tab === 'vacation' && <>
          {/* Balance */}
          <section>
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
            <p className="text-xs text-muted-foreground">
              {balanceLoading
                ? 'Загрузка…'
                : `Использовано: ${usedDays ?? '—'} · Зарезервировано: ${reservedDays ?? '—'} · Доступно: ${availableDays ?? '—'}`}
            </p>
            {workYear && (
              <p className="mt-1 text-xs text-muted-foreground">
                Текущий рабочий год: {formatDay(workYear.start)} — {formatDay(workYear.end)} (от даты найма)
              </p>
            )}
          </section>

          {travel && (
            <section className="pt-5 border-t border-border">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Plane className="h-4 w-4 text-muted-foreground" /> Проезд к месту отпуска
                </p>
                <Badge variant="outline" className={cn('text-[11px]', travelStatus.tone)}>{travelStatus.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Последнее использование</label>
                  <Input type="date" value={travelLastUsed} onChange={(e) => setTravelLastUsed(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Доступен с</label>
                  <Input type="date" value={travelNext} onChange={(e) => setTravelNext(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{travelNext ? `Период права: ${formatDay(addYears(travelNext, 0))} — ${formatDay(addYears(travelNext, 2))}` : 'Пусто — дата найма + 2 года'}</span>
                {hireDate && (
                  <button type="button" className="text-primary hover:underline" onClick={() => { setTravelLastUsed(''); setTravelNext(addYears(hireDate, 2).toLocaleDateString('sv-SE')) }}>
                    Сбросить к дате найма + 2 года
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Право на проезд — раз в 2 года. При согласовании заявки с проездом дата доступности сдвигается автоматически.</p>
            </section>
          )}

          {currentOrgId && (
            <LeaveAdjustmentsSection
              userId={employee.id}
              year={balanceYear}
              onVacationAdjusted={(days) => {
                setTotalDays((t) => String(Number(t) + days))
                setBalanceBaseline((b) => String(Number(b) + days))
                setAvailableDays((a) => (a ?? 0) + days)
              }}
            />
          )}

          </>}

          {tab === 'service' && <>
          <TechnicalInfoSection userId={employee.id} />

          {/* Account (admin only) */}
          {adminMode && (
            <section className="pt-5 border-t border-border">
              <p className="flex items-center gap-2 text-sm font-semibold mb-3">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Аккаунт
              </p>

              <div className="flex items-center gap-2 mb-3">
                <Button
                  size="sm"
                  variant={status === 'active' ? 'outline' : 'default'}
                  onClick={toggleStatus}
                  disabled={savingStatus}
                >
                  {savingStatus ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : status === 'active' ? (
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {status === 'active' ? 'Деактивировать' : 'Активировать'}
                </Button>
                <span className="text-xs text-muted-foreground">Текущий статус: {ACCOUNT_STATUS_LABELS[status] || status}</span>
              </div>

              <div className="mb-2">
                <label className="mb-1 block text-xs text-muted-foreground">Системная роль</label>
                <div className="flex items-center gap-2">
                  <SelectDropdown
                    options={systemRoles.map((r) => ({ value: r.name, label: SYSTEM_ROLE_LABELS[r.name] || r.name }))}
                    value={systemRole}
                    onChange={setSystemRole}
                    className="min-w-[200px]"
                  />
                  <Button size="sm" onClick={saveSystemRole} disabled={savingRole || systemRole === employee.role}>
                    {savingRole && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    Сохранить роль
                  </Button>
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs text-muted-foreground">Новый пароль</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    placeholder="Минимум 6 символов"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 text-sm max-w-xs"
                  />
                  <Button size="sm" variant="outline" onClick={resetPassword} disabled={resettingPassword || newPassword.length < 6}>
                    {resettingPassword && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                    Сбросить пароль
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* Organizations (admin + global only) */}
          {adminMode && isGlobalMode && (
            <section className="pt-5 border-t border-border">
              <p className="flex items-center gap-2 text-sm font-semibold mb-3">
                <Globe className="h-4 w-4 text-muted-foreground" /> Организации
              </p>
              {orgsLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-2 mb-3">
                  {memberships.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium flex items-center gap-1.5">
                          {m.name}
                          {m.is_primary && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                        </p>
                        {m.department_name && <p className="text-xs text-muted-foreground truncate">{m.department_name}</p>}
                      </div>
                      <SelectDropdown
                        options={ORG_ROLES}
                        value={m.org_role}
                        onChange={(v) => changeMembershipRole(m, v)}
                        className="min-w-[130px]"
                      />
                      {!m.is_primary && (
                        <Button size="sm" variant="ghost" onClick={() => makePrimary(m)} disabled={orgBusy} title="Сделать основной">
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeMembership(m)} disabled={orgBusy}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {memberships.length === 0 && <p className="text-xs text-muted-foreground">Не состоит ни в одной организации</p>}
                </div>
              )}
              {availableOrgsToAdd.length > 0 && (
                <div className="flex items-center gap-2">
                  <SelectDropdown
                    options={[{ value: '', label: 'Выберите организацию' }, ...availableOrgsToAdd.map((o) => ({ value: String(o.id), label: o.name }))]}
                    value={addOrgId}
                    onChange={setAddOrgId}
                    className="min-w-[200px] flex-1"
                  />
                  <SelectDropdown options={ORG_ROLES} value={addOrgRole} onChange={setAddOrgRole} className="min-w-[130px]" />
                  <Button size="sm" onClick={addMembership} disabled={!addOrgId || orgBusy}>
                    {orgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Добавить'}
                  </Button>
                </div>
              )}
            </section>
          )}
          </>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
          {isDirty && <span className="mr-auto self-center text-xs text-amber-600 dark:text-amber-400">Есть несохранённые изменения</span>}
          <Button variant="outline" onClick={requestClose} disabled={savingAll}>
            {tab === 'service' ? 'Закрыть' : 'Отмена'}
          </Button>
          {tab !== 'service' && (
            <Button onClick={saveAll} disabled={savingAll || !isDirty} className="gap-2">
              {savingAll && <Loader2 className="h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          )}
        </div>
      </Card>
    </div>,
    document.body
  )
}


export function HREmployees({ adminMode = false, isGlobalMode = false }: { adminMode?: boolean; isGlobalMode?: boolean } = {}) {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterDepartmentIds, setFilterDepartmentIds] = useState<string[]>([])
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterPositions, setFilterPositions] = useState<string[]>([])
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
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
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEmployeeId = searchParams.get('employee')
  const [exporting, setExporting] = useState(false)

  const openEmployee = useCallback((row: EmployeeRow | null) => {
    setSelected(row)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (row) next.set('employee', String(row.id))
      else next.delete('employee')
      return next
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    if (!linkedEmployeeId || selected?.id === Number(linkedEmployeeId)) return
    const params = new URLSearchParams({ userId: linkedEmployeeId, year: String(CURRENT_YEAR), page: '1', limit: '1', includeInactive: 'true' })
    apiGet<SearchResponse>(`/users/search?${params}`)
      .then((res) => {
        if (res.data[0]) setSelected(res.data[0])
        else {
          toast.error('Сотрудник не найден в этой организации')
          openEmployee(null)
        }
      })
      .catch(() => {})
  }, [linkedEmployeeId, currentOrgId, selected?.id, openEmployee])

  const [systemRoles, setSystemRoles] = useState<SystemRole[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [bulkRole, setBulkRole] = useState('')
  const [bulkDepartment, setBulkDepartment] = useState('')
  const [bulkPosition, setBulkPosition] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    apiGet<Department[]>('/dictionaries/departments').then(setDepartments).catch(() => setDepartments([]))
    apiGet<{ id: number; name: string }[]>('/dictionaries/skills').then((rows) => setAllTags(rows.map((r) => ({ id: r.id, name: r.name })))).catch(() => setAllTags([]))
    apiGet<{ name: string }[]>('/dictionaries/positions').then((rows) => setPositions(rows.map((r) => r.name))).catch(() => setPositions([]))
  }, [currentOrgId])

  useEffect(() => {
    apiGet<SystemRole[]>('/users/system-roles').then(setSystemRoles).catch(() => setSystemRoles([]))
  }, [])

  const buildFilterParams = () => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (filterDepartmentIds.length > 0) params.set('departmentId', filterDepartmentIds.join(','))
    if (filterTagIds.length > 0) params.set('tagId', filterTagIds.join(','))
    if (filterPositions.length > 0) params.set('position', filterPositions.join(','))
    if (filterStatuses.length > 0) {
      params.set('orgIsActive', filterStatuses.map((s) => (s === 'active' ? 'true' : 'false')).join(','))
    }
    params.set('year', String(year))
    return params
  }

  const fetchEmployees = () => {
    setLoading(true)
    const params = buildFilterParams()
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
  }, [debouncedSearch, filterDepartmentIds, filterTagIds, filterPositions, filterStatuses, year, page, currentOrgId])

  const exportExcel = async () => {
    setExporting(true)
    try {
      const params = buildFilterParams()
      params.set('format', 'xlsx')
      const res = await fetch(`${API_BASE_URL}/users/search?${params}`, { headers: getAuthHeaders(), credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Ошибка' }))
        throw new Error(data.error || 'Ошибка')
      }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `Сотрудники ${new Date().toLocaleDateString('ru-RU')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const resetFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setFilterDepartmentIds([])
    setFilterTagIds([])
    setFilterPositions([])
    setFilterStatuses([])
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

  const toggleRowSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.size === sortedRows.length ? new Set() : new Set(sortedRows.map((r) => r.id))))
  }

  const executeBulkAction = async () => {
    if (selectedIds.size === 0 || !bulkAction) return
    const ids = Array.from(selectedIds)
    const targetDepartment = departments.find((d) => String(d.id) === bulkDepartment)
    const actionText = bulkAction === 'setDepartment' && targetDepartment
      ? `Перевести ${ids.length} сотр. в отдел «${targetDepartment.name}»?`
      : bulkAction === 'setPosition'
        ? `Назначить ${ids.length} сотр. должность «${bulkPosition.trim()}»?`
        : `Применить к ${ids.length} сотрудникам?`
    const confirmed = await confirmDialog({
      title: 'Массовое действие',
      message: actionText,
      confirmText: 'Применить',
    })
    if (!confirmed) return
    setBulkBusy(true)
    try {
      if (bulkAction === 'activate' || bulkAction === 'deactivate') {
        await apiPut('/users/bulk-status', { userIds: ids, status: bulkAction === 'activate' ? 'active' : 'inactive' })
      } else if (bulkAction === 'setRole' && bulkRole) {
        await apiPut('/users/bulk-role', { userIds: ids, role: bulkRole })
      } else if (bulkAction === 'setDepartment' && bulkDepartment) {
        await apiPost(`/dictionaries/departments/${bulkDepartment}/members`, { userIds: ids })
      } else if (bulkAction === 'setPosition' && bulkPosition.trim()) {
        await apiPut('/users/bulk-position', { userIds: ids, position: bulkPosition.trim() })
        if (!positions.includes(bulkPosition.trim())) setPositions((prev) => [...prev, bulkPosition.trim()].sort((a, b) => a.localeCompare(b, 'ru')))
      }
      setSelectedIds(new Set())
      setBulkAction('')
      setBulkRole('')
      setBulkDepartment('')
      setBulkPosition('')
      fetchEmployees()
      toast.success('Изменения применены')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBulkBusy(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const departmentFilterOptions = useMemo(() => departments.map((d) => ({ id: String(d.id), label: d.name })), [departments])
  const tagFilterOptions = useMemo(() => allTags.map((t) => ({ id: String(t.id), label: t.name })), [allTags])
  const positionFilterOptions = useMemo(() => positions.map((p) => ({ id: p, label: p })), [positions])
  const hasColumnFilters = filterDepartmentIds.length + filterTagIds.length + filterPositions.length + filterStatuses.length > 0

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
          {(search.trim() !== '' || hasColumnFilters) && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-[15px] py-[9px] text-[13px] font-semibold text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
            >
              <RotateCcw className="h-[14px] w-[14px]" />
              Сбросить
            </button>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={exportExcel} disabled={exporting || total === 0} title="Выгрузить список с учётом фильтров">
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            Excel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Фильтры по должности, отделу, тегам и статусу — в заголовках столбцов таблицы</p>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <span className="text-sm font-medium">Выбрано: {selectedIds.size}</span>
            <SelectDropdown
              options={[
                { value: '', label: 'Действие…' },
                { value: 'activate', label: 'Активировать' },
                { value: 'deactivate', label: 'Деактивировать' },
                { value: 'setRole', label: 'Сменить роль' },
                { value: 'setDepartment', label: 'Перевести в отдел' },
                { value: 'setPosition', label: 'Сменить должность' },
              ]}
              value={bulkAction}
              onChange={setBulkAction}
            />
            {bulkAction === 'setDepartment' && (
              <SelectDropdown
                options={[
                  { value: '', label: 'Отдел…' },
                  ...[...departments].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((d) => ({ value: String(d.id), label: d.name })),
                ]}
                value={bulkDepartment}
                onChange={setBulkDepartment}
                className="min-w-[220px]"
              />
            )}
            {bulkAction === 'setPosition' && (
              <>
                <input
                  list="hr-bulk-positions"
                  value={bulkPosition}
                  onChange={(e) => setBulkPosition(e.target.value)}
                  placeholder="Должность — выберите или впишите"
                  maxLength={255}
                  className="h-9 min-w-[260px] flex-1 rounded-[10px] border border-border bg-card px-3 text-[13px] text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
                <datalist id="hr-bulk-positions">
                  {positions.map((p) => <option key={p} value={p} />)}
                </datalist>
              </>
            )}
            {bulkAction === 'setRole' && (
              <SelectDropdown
                options={[{ value: '', label: 'Роль…' }, ...systemRoles.map((r) => ({ value: r.name, label: SYSTEM_ROLE_LABELS[r.name] || r.name }))]}
                value={bulkRole}
                onChange={setBulkRole}
              />
            )}
            <Button
              size="sm"
              onClick={executeBulkAction}
              disabled={
                bulkBusy || !bulkAction ||
                (bulkAction === 'setRole' && !bulkRole) ||
                (bulkAction === 'setDepartment' && !bulkDepartment) ||
                (bulkAction === 'setPosition' && !bulkPosition.trim())
              }
            >
              {bulkBusy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Применить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setSelectedIds(new Set()); setBulkAction(''); setBulkRole(''); setBulkDepartment(''); setBulkPosition('') }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {loading && rows.length === 0 && !hasColumnFilters && !search.trim() ? (
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className={cn('overflow-x-auto rounded-xl border border-border transition-opacity', loading && 'opacity-60')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === sortedRows.length}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-foreground">
                      Сотрудник <SortIcon active={sortKey === 'name'} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <FilterHeader
                      label="Должность"
                      sortActive={sortKey === 'position'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('position')}
                      filterOptions={positionFilterOptions}
                      selected={filterPositions}
                      onFilterChange={(v) => { setFilterPositions(v); setPage(1) }}
                      searchPlaceholder="Поиск должности…"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <FilterHeader
                      label="Отдел"
                      sortActive={sortKey === 'department'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('department')}
                      filterOptions={departmentFilterOptions}
                      selected={filterDepartmentIds}
                      onFilterChange={(v) => { setFilterDepartmentIds(v); setPage(1) }}
                      searchPlaceholder="Поиск отдела…"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <FilterHeader
                      label="Теги"
                      filterOptions={tagFilterOptions}
                      selected={filterTagIds}
                      onFilterChange={(v) => { setFilterTagIds(v); setPage(1) }}
                      searchPlaceholder="Поиск тега…"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <FilterHeader
                      label="Статус"
                      filterOptions={STATUS_FILTER_OPTIONS}
                      selected={filterStatuses}
                      onFilterChange={(v) => { setFilterStatuses(v); setPage(1) }}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && <TableEmptyRow colSpan={6} icon={Users} title={loading ? 'Загрузка…' : 'Никого не нашли'} />}
                {sortedRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openEmployee(r)}
                    className="cursor-pointer border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleRowSelect(r.id)}
                          className="h-3.5 w-3.5 rounded border-border accent-primary"
                        />
                      </td>
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
                      <div className="flex flex-wrap items-center gap-1">
                        {r.tags.slice(0, 3).map((t) => (
                          <Badge key={t.id} variant="outline" className="text-[10px]">{t.name}</Badge>
                        ))}
                        {r.tags.length > 3 && <Badge variant="outline" className="text-[10px]">+{r.tags.length - 3}</Badge>}
                        {r.tags.length === 0 && <span className="text-xs text-muted-foreground/60">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={r.status === 'inactive' || r.org_is_active === false ? 'destructive' : 'success'}>
                        {r.status === 'inactive' ? 'Деактивирован' : r.org_is_active === false ? 'Отключён' : 'Активен'}
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
          adminMode={adminMode}
          isGlobalMode={isGlobalMode}
          systemRoles={systemRoles}
          onClose={() => openEmployee(null)}
          onUpdated={handleUpdated}
        />
      )}
    </Card>
  )
}
