import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { apiGet, apiPost, fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn, personName } from '@/shared/lib/utils'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { API_BASE_URL } from '@/shared/lib/api'
import { Button } from '@/shared/components/ui/Button'
import { toast } from 'sonner'
import {
  Building2, UserX, Plus, Trash2, Settings2, X,
  AlertTriangle, Loader2, Search, Ban, Network,
} from 'lucide-react'
import {
  CountBadge, FilterHeader, RowAction, TableCard, TableEmpty, TableEmptyRow, TableFrame, TableHeadRow, TableSearch, TableSkeleton, TD, TH, TR,
  filterOptionsOf, matchesFilter, useTableSort,
} from '@/shared/components/ui/DataTable'
import { EntityModal, ModalError } from '@/shared/components/ui/EntityModal'
import { DeleteDepartmentDialog, DepartmentSettings, type Dept } from '@/core/admin/components/DepartmentSettings'

const NO_MANAGER = 'Не назначен'
const TOP_LEVEL = 'Верхний уровень'
const FLAG_OPTIONS = [
  { id: 'blocked', label: 'Отпуска закрыты' },
  { id: 'hierarchy', label: 'На схеме «Иерархия»' },
  { id: 'no_manager', label: 'Без руководителя' },
]
const COUNT_OPTIONS = [
  { id: 'with', label: 'Есть работники' },
  { id: 'without', label: 'Без работников' },
]

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few
  return many
}

export function DepartmentsTab() {
  const [departments, setDepartments] = useState<Dept[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const sort = useTableSort<'name' | 'manager' | 'parent' | 'count'>('name')
  const [fFlags, setFFlags] = useState<string[]>([])
  const [fManagers, setFManagers] = useState<string[]>([])
  const [fParents, setFParents] = useState<string[]>([])
  const [fCount, setFCount] = useState<string[]>([])

  const [creating, setCreating] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formManagerId, setFormManagerId] = useState<number | null>(null)
  const [formManagerName, setFormManagerName] = useState('')
  const [formParentId, setFormParentId] = useState<number | null>(null)
  const [pickerFor, setPickerFor] = useState<'create' | 'settings' | null>(null)
  const [pickedManager, setPickedManager] = useState<{ id: number | null; name: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const [settingsId, setSettingsId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const settingsDept = departments.find((d) => d.id === settingsId) ?? null
  const deletingDept = departments.find((d) => d.id === deletingId) ?? null

  useModalOpen(creating)

  useEffect(() => { fetchDepartments() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (pickerFor) setPickerFor(null)
      else if (deletingId !== null) setDeletingId(null)
      else if (settingsId !== null) setSettingsId(null)
      else closeCreate()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pickerFor, deletingId, settingsId])

  const fetchDepartments = async () => {
    try {
      setDepartments(await apiGet<Dept[]>('/dictionaries/departments'))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setCreating(true)
    setFormName('')
    setFormDescription('')
    setFormManagerId(null)
    setFormManagerName('')
    setFormParentId(null)
    setError(null)
  }

  const closeCreate = () => {
    setCreating(false)
    setPickerFor(null)
  }

  const openSettings = (dept: Dept) => {
    setPickedManager(null)
    setSettingsId(dept.id)
  }

  const submitCreate = async () => {
    const name = formName.trim()
    if (!name) { setError('Название обязательно'); return }
    setSaving(true)
    try {
      await apiPost('/dictionaries/departments', {
        name, description: formDescription, manager_id: formManagerId, parent_id: formParentId,
      })
      toast.success(`«${name}» добавлен`)
      closeCreate()
      fetchDepartments()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const pickUser = (userId: number, userName: string) => {
    if (pickerFor === 'settings') setPickedManager({ id: userId, name: userName })
    else {
      setFormManagerId(userId)
      setFormManagerName(userName)
    }
    setPickerFor(null)
  }

  const stats = useMemo(() => {
    const total = departments.length
    const people = departments.reduce((s, d) => s + d.employee_count, 0)
    const managers = departments.filter(d => d.manager_name).length
    return { total, people, managers }
  }, [departments])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return departments.filter(d =>
      (!q || `${d.name} ${d.manager_name || ''}`.toLowerCase().includes(q)) &&
      matchesFilter(fFlags, [d.vacation_requests_blocked ? 'blocked' : '', d.on_hierarchy ? 'hierarchy' : '', !d.manager_name ? 'no_manager' : ''].filter(Boolean)) &&
      matchesFilter(fManagers, d.manager_name || NO_MANAGER) &&
      matchesFilter(fParents, d.parent_name || d.parent_user_name || TOP_LEVEL) &&
      matchesFilter(fCount, d.employee_count > 0 ? 'with' : 'without'))
  }, [departments, search, fFlags, fManagers, fParents, fCount])
  const managerOptions = useMemo(() => [{ id: NO_MANAGER, label: NO_MANAGER }, ...filterOptionsOf(departments.flatMap(d => (d.manager_name ? [d.manager_name] : [])))], [departments])
  const parentOptions = useMemo(() => [{ id: TOP_LEVEL, label: TOP_LEVEL }, ...filterOptionsOf(departments.flatMap(d => (d.parent_name || d.parent_user_name ? [d.parent_name || d.parent_user_name || ''] : [])))], [departments])
  const visible = sort.sorted(filtered, (d, k) => (
    k === 'count' ? d.employee_count
      : k === 'manager' ? d.manager_name || '\uffff'
      : k === 'parent' ? d.parent_name || d.parent_user_name || '\uffff'
      : d.name
  ))

  return (
    <TableCard
      icon={Building2}
      title="Отделы"
      subtitle={`Структура организации · ${stats.total} ${pluralRu(stats.total, 'отдел', 'отдела', 'отделов')}, ${stats.people} ${pluralRu(stats.people, 'работник', 'работника', 'работников')}, ${stats.managers} ${pluralRu(stats.managers, 'руководитель', 'руководителя', 'руководителей')}`}
    >
      {error && !creating && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <TableSearch value={search} onChange={setSearch} placeholder="Поиск отдела или руководителя…" />
        {(search.trim() || fFlags.length + fManagers.length + fParents.length + fCount.length > 0) && (
          <span className="whitespace-nowrap text-xs text-muted-foreground">Найдено {visible.length} из {departments.length}</span>
        )}
        <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3.5 w-3.5" /> Новый отдел</Button>
      </div>
      <p className="text-xs text-muted-foreground">Нажмите на отдел, чтобы изменить состав, руководителя, запрет отпусков и видимость</p>

      {loading ? <TableSkeleton /> : departments.length === 0 ? (
        <TableEmpty icon={Building2} title="Нет отделов" hint="Создайте первый отдел" />
      ) : (
        <TableFrame>
          <thead>
            <TableHeadRow>
              <th className={TH}>
                <FilterHeader label="Отдел" sortActive={sort.key === 'name'} sortDir={sort.dir} onSort={() => sort.toggle('name')}
                  filterOptions={FLAG_OPTIONS} selected={fFlags} onFilterChange={setFFlags} />
              </th>
              <th className={TH}>
                <FilterHeader label="Руководитель" sortActive={sort.key === 'manager'} sortDir={sort.dir} onSort={() => sort.toggle('manager')}
                  filterOptions={managerOptions} selected={fManagers} onFilterChange={setFManagers} searchPlaceholder="Поиск руководителя…" />
              </th>
              <th className={TH}>
                <FilterHeader label="Входит в" sortActive={sort.key === 'parent'} sortDir={sort.dir} onSort={() => sort.toggle('parent')}
                  filterOptions={parentOptions} selected={fParents} onFilterChange={setFParents} searchPlaceholder="Поиск подразделения…" />
              </th>
              <th className={cn(TH, 'w-36')}>
                <FilterHeader label="Работников" sortActive={sort.key === 'count'} sortDir={sort.dir} onSort={() => sort.toggle('count')}
                  filterOptions={COUNT_OPTIONS} selected={fCount} onFilterChange={setFCount} />
              </th>
              <th className={cn(TH, 'w-20')} />
            </TableHeadRow>
          </thead>
          <tbody>
            {visible.length === 0 && <TableEmptyRow colSpan={5} icon={Building2} title="Отделы не найдены" />}
            {visible.map((d) => (
              <tr key={d.id} onClick={() => openSettings(d)} className={cn(TR, 'group cursor-pointer')}>
                <td className={TD}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium [overflow-wrap:anywhere]">{d.name}</span>
                    {d.vacation_requests_blocked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                        <Ban className="h-2.5 w-2.5" /> отпуска закрыты
                      </span>
                    )}
                    {d.on_hierarchy && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Network className="h-2.5 w-2.5" /> на схеме
                      </span>
                    )}
                  </div>
                </td>
                <td className={TD}>
                  {d.manager_name ? (
                    <div className="min-w-0">
                      <p className="truncate">{d.manager_name}</p>
                      {d.manager_position && <p className="truncate text-xs text-muted-foreground">{d.manager_position}</p>}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground/70"><UserX className="h-3.5 w-3.5" /> не назначен</span>
                  )}
                </td>
                <td className={cn(TD, 'text-muted-foreground')}>{d.parent_name || d.parent_user_name || '—'}</td>
                <td className={TD}><CountBadge count={d.employee_count} /></td>
                <td className={TD}>
                  <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <RowAction icon={Settings2} label="Настроить" onClick={() => openSettings(d)} />
                    <RowAction icon={Trash2} label="Удалить" danger onClick={() => setDeletingId(d.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      {creating && (
        <EntityModal
          icon={Building2}
          title="Новый отдел"
          busy={saving}
          locked={pickerFor !== null}
          canSave={!!formName.trim()}
          saveLabel="Добавить"
          onSave={submitCreate}
          onClose={closeCreate}
        >
          <div className="space-y-3.5">
            <ModalError error={error} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-muted-foreground">Название</span>
            <input
              autoFocus
              value={formName}
              onChange={e => setFormName(e.target.value)}
              maxLength={120}
              placeholder="Например, Отдел исследований"
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-muted-foreground">Описание</span>
            <textarea
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              rows={2}
              maxLength={1000}
              className="resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-muted-foreground">Руководитель</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPickerFor('create')}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40"
              >
                <span className={formManagerName ? 'text-foreground' : 'text-muted-foreground'}>
                  {formManagerName || 'Не назначен'}
                </span>
              </button>
              {formManagerId != null && (
                <button
                  type="button"
                  onClick={() => { setFormManagerId(null); setFormManagerName('') }}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Снять руководителя"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-muted-foreground">Входит в подразделение</span>
            <select
              value={formParentId ?? ''}
              onChange={e => setFormParentId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
            >
              <option value="">—</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          <p className="text-xs text-muted-foreground">Состав, запрет отпусков и видимость настраиваются после создания — кликните по отделу в списке</p>
          </div>
        </EntityModal>
      )}

      {settingsDept && (
        <DepartmentSettings
          key={settingsDept.id}
          dept={settingsDept}
          departments={departments}
          onClose={() => setSettingsId(null)}
          onChanged={fetchDepartments}
          onPickManager={() => setPickerFor('settings')}
          pickedManager={pickedManager}
          onDelete={() => setDeletingId(settingsDept.id)}
        />
      )}

      {deletingDept && (
        <DeleteDepartmentDialog
          dept={deletingDept}
          departments={departments}
          onClose={() => setDeletingId(null)}
          onDeleted={() => {
            setDeletingId(null)
            if (settingsId === deletingDept.id) setSettingsId(null)
            fetchDepartments()
          }}
        />
      )}

      {pickerFor && (
        <UserPickerModal onSelect={pickUser} onClose={() => setPickerFor(null)} />
      )}
    </TableCard>
  )
}

function UserPickerModal({ onSelect, onClose }: { onSelect: (id: number, name: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<{ id: number; first_name: string; last_name: string; middle_name?: string | null; email: string; position: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true)
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/users?limit=1000`, { headers: getAuthHeaders() })
        if (res.ok) {
          const data = await res.json()
          setUsers(data.users || data || [])
        }
      } catch {} finally { setLoading(false) }
    }
    fetchUsers()
  }, [])

  const filtered = users.filter(u => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return `${personName(u.last_name, u.first_name, u.middle_name)} ${u.email} ${u.position || ''}`.toLowerCase().includes(q)
  })

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col overflow-hidden border border-border" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Выбор работника</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Поиск по имени, email, должности..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search ? 'Ничего не найдено' : 'Нет работников'}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(u => {
                const fullName = personName(u.last_name, u.first_name, u.middle_name)
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
    </div>,
    document.body,
  )
}
