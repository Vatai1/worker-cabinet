import { useState, useEffect, useMemo } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn, personName } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { API_BASE_URL } from '@/shared/lib/api'
import { useOrgStore } from '@/shared/store/orgStore'
import { Button } from '@/shared/components/ui/Button'
import { toast } from 'sonner'
import {
  Building2, Users, UserX, Plus, Trash2, Pencil, X,
  AlertTriangle, Loader2, Search, MoreVertical,
} from 'lucide-react'

interface Dept {
  id: number
  name: string
  manager_id: number | null
  manager_name: string | null
  manager_position: string | null
  employee_count: string
  vacation_requests_blocked: boolean
  description: string | null
  parent_id: number | null
  parent_name: string | null
}

type SortKey = 'name' | 'count'

const hueFromString = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % 360
}

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few
  return many
}

export function DepartmentsTab() {
  const orgHeaders = (): Record<string, string> => {
    const orgId = useOrgStore.getState().currentOrgId
    return orgId != null ? { 'X-Organization-Id': String(orgId) } : {}
  }

  const [departments, setDepartments] = useState<Dept[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formManagerId, setFormManagerId] = useState<number | null>(null)
  const [formManagerName, setFormManagerName] = useState('')
  const [formParentId, setFormParentId] = useState<number | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  useModalOpen(modalMode !== null)

  useEffect(() => { fetchDepartments() }, [])

  useEffect(() => {
    if (openMenuId === null) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpenMenuId(null)
      if (showPicker) setShowPicker(false)
      else closeModal()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showPicker])

  const fetchDepartments = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      if (res.ok) setDepartments(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const descendantsOf = (rootId: number) => {
    const children = new Map<number, number[]>()
    for (const d of departments) {
      if (d.parent_id !== null) {
        children.set(d.parent_id, [...(children.get(d.parent_id) || []), d.id])
      }
    }
    const result = new Set<number>()
    const stack = [rootId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const child of children.get(cur) || []) {
        if (!result.has(child)) { result.add(child); stack.push(child) }
      }
    }
    return result
  }

  const openCreate = () => {
    setModalMode('create')
    setEditingId(null)
    setFormName('')
    setFormManagerId(null)
    setFormManagerName('')
    setFormParentId(null)
    setError(null)
  }

  const openEdit = (dept: Dept) => {
    setModalMode('edit')
    setEditingId(dept.id)
    setFormName(dept.name)
    setFormManagerId(dept.manager_id)
    setFormManagerName(dept.manager_name || '')
    setFormParentId(dept.parent_id)
    setError(null)
  }

  const closeModal = () => {
    setModalMode(null)
    setEditingId(null)
    setShowPicker(false)
  }

  const submitForm = async () => {
    const name = formName.trim()
    if (!name) { setError('Название обязательно'); return }
    setSaving(true)
    try {
      if (modalMode === 'edit' && editingId != null) {
        const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/departments/${editingId}`, {
          method: 'PUT', headers: { ...getAuthHeadersWithContentType(), ...orgHeaders() },
          body: JSON.stringify({ name, parent_id: formParentId, manager_id: formManagerId ?? null }),
        })
        if (res.ok) {
          toast.success(`«${name}» — изменения сохранены`)
          closeModal()
          fetchDepartments()
        } else {
          const data = await res.json()
          setError(data.error || 'Ошибка')
        }
      } else {
        const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/departments`, {
          method: 'POST', headers: { ...getAuthHeadersWithContentType(), ...orgHeaders() },
          body: JSON.stringify({ name, manager_id: formManagerId, parent_id: formParentId }),
        })
        if (res.ok) {
          toast.success(`«${name}» добавлен`)
          closeModal()
          fetchDepartments()
        } else {
          const data = await res.json()
          setError(data.error || 'Ошибка')
        }
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const removeDept = async (dept: Dept) => {
    const confirmed = await confirmDialog({
      title: 'Удалить отдел',
      message: `Удалить отдел «${dept.name}»? Работники будут отвязаны от отдела.`,
      confirmText: 'Удалить',
      variant: 'danger',
    })
    if (!confirmed) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/departments/${dept.id}`, {
        method: 'DELETE', headers: { ...getAuthHeaders(), ...orgHeaders() },
      })
      if (res.ok) {
        toast.success(`«${dept.name}» удалён`)
        fetchDepartments()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Не удалось удалить отдел')
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const pickUser = (userId: number, userName: string) => {
    setFormManagerId(userId)
    setFormManagerName(userName)
    setShowPicker(false)
  }

  const stats = useMemo(() => {
    const total = departments.length
    const people = departments.reduce((s, d) => s + (Number(d.employee_count) || 0), 0)
    const managers = departments.filter(d => d.manager_name).length
    return { total, people, managers }
  }, [departments])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? departments.filter(d => `${d.name} ${d.manager_name || ''}`.toLowerCase().includes(q))
      : [...departments]
    list.sort((a, b) => sort === 'name'
      ? a.name.localeCompare(b.name, 'ru')
      : (Number(b.employee_count) || 0) - (Number(a.employee_count) || 0) || a.name.localeCompare(b.name, 'ru'))
    return list
  }, [departments, search, sort])

  const excludedParents = editingId != null
    ? new Set([editingId, ...descendantsOf(editingId)])
    : new Set<number>()

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      {error && !modalMode && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        {[
          { b: stats.total, label: pluralRu(stats.total, 'отдел', 'отдела', 'отделов') },
          { b: stats.people, label: pluralRu(stats.people, 'работник', 'работника', 'работников') },
          { b: stats.managers, label: pluralRu(stats.managers, 'руководитель', 'руководителя', 'руководителей') },
        ].map((s, i) => (
          <div key={i} className="flex min-w-[120px] flex-col gap-0.5 rounded-xl border border-border bg-card px-4 py-2.5">
            <b className="text-lg font-bold leading-tight">{s.b}</b>
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск отдела или руководителя…"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        >
          <option value="name">По алфавиту</option>
          <option value="count">По количеству работников</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            Показано {visible.length} из {departments.length}
          </span>
          <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> Новый отдел</Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <b className="mb-1 block text-[15px] text-foreground">
            {departments.length === 0 ? 'Нет отделов' : 'Отделы не найдены'}
          </b>
          {departments.length === 0 ? 'Создайте первый отдел' : 'Измените запрос или создайте новый отдел'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {visible.map((d) => {
            const hue = hueFromString(d.name)
            const count = Number(d.employee_count) || 0
            return (
              <article
                key={d.id}
                className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-muted-foreground/30"
              >
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                  style={{ background: `hsl(${hue} 80% 94%)`, color: `hsl(${hue} 55% 38%)` }}
                >
                  <Building2 className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14.5px] font-semibold leading-snug [overflow-wrap:anywhere]">{d.name}</h3>
                    {d.parent_name && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        в составе: {d.parent_name}
                      </span>
                    )}
                  </div>
                  {d.manager_name ? (
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium text-foreground/80">{d.manager_name}</span>
                      {d.manager_position && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="truncate">{d.manager_position}</span>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground/70">
                      <UserX className="h-3.5 w-3.5 shrink-0" /> Руководитель не назначен
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
                    count === 0 ? 'bg-muted text-muted-foreground/60' : 'bg-primary/10 text-primary',
                  )}>
                    <Users className="h-3 w-3" /> {count} чел.
                  </span>

                  <div className="relative">
                    <button
                      aria-haspopup="true"
                      aria-expanded={openMenuId === d.id}
                      aria-label={`Действия: ${d.name}`}
                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === d.id ? null : d.id) }}
                      className={cn(
                        'grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        openMenuId === d.id && 'bg-muted text-foreground',
                      )}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === d.id && (
                      <div
                        role="menu"
                        onClick={e => e.stopPropagation()}
                        className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
                      >
                        <button
                          role="menuitem"
                          onClick={() => { setOpenMenuId(null); openEdit(d) }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium hover:bg-muted"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Редактировать
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => { setOpenMenuId(null); removeDept(d) }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {modalMode && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-5"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modalMode === 'edit' ? 'Редактировать отдел' : 'Новый отдел'}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[85vh] overflow-y-auto scrollbar-thin overscroll-contain"
          >
            <h3 className="mb-4 text-base font-bold">
              {modalMode === 'edit' ? 'Редактировать отдел' : 'Новый отдел'}
            </h3>

            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-[13px] text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <form
              onSubmit={e => { e.preventDefault(); submitForm() }}
              className="space-y-3.5"
            >
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

              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">Руководитель</span>
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className={formManagerName ? 'text-foreground' : 'text-muted-foreground'}>
                    {formManagerName || 'Не назначен'}
                  </span>
                  {formManagerId != null && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setFormManagerId(null); setFormManagerName('') }}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </button>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">Подразделение (родитель)</span>
                <select
                  value={formParentId ?? ''}
                  onChange={e => setFormParentId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
                >
                  <option value="">—</option>
                  {departments.filter(d => !excludedParents.has(d.id)).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2.5 pt-1">
                <Button type="button" variant="outline" onClick={closeModal}>Отмена</Button>
                <Button type="submit" disabled={!formName.trim() || saving}>
                  {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {modalMode === 'edit' ? 'Сохранить' : 'Добавить'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPicker && (
        <UserPickerModal onSelect={pickUser} onClose={() => setShowPicker(false)} />
      )}
    </div>
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
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
    </div>
  )
}
