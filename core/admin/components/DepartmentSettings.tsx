import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowRightLeft, Ban, Check, Eye, Info, Loader2, Network, Search, Settings2, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/lib/apiClient'
import { cn, getErrorMessage, personName } from '@/shared/lib/utils'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { Button } from '@/shared/components/ui/Button'
import { Switch } from '@/shared/components/ui/Switch'

export interface Dept {
  id: number
  name: string
  manager_id: number | null
  manager_name: string | null
  manager_position: string | null
  employee_count: number
  vacation_requests_blocked: boolean
  description: string | null
  parent_id: number | null
  parent_name: string | null
  parent_user_id: number | null
  parent_user_name: string | null
  vac_parent_sees_child: boolean
  vac_child_sees_parent: boolean
  vac_parent_approves: boolean
  emp_parent_sees_child: boolean
  emp_child_sees_parent: boolean
  on_hierarchy: boolean
}

export interface OrgUser {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  email: string
  position: string | null
  status?: string
  department_id?: number | null
  department_name?: string | null
}

interface Member {
  id: number
  first_name: string
  last_name: string
  middle_name: string | null
  position: string | null
  email: string
  status: string
  is_test: boolean
}

type Section = 'main' | 'members' | 'access'

const STATUS_LABELS: Record<string, string> = { on_leave: 'В отпуске', blocked: 'Заблокирован' }

const fieldClass = 'rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60'

export function descendantsOf(departments: Dept[], rootId: number) {
  const children = new Map<number, number[]>()
  for (const d of departments) {
    if (d.parent_id !== null) children.set(d.parent_id, [...(children.get(d.parent_id) || []), d.id])
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

function Initials({ first, last }: { first?: string | null; last?: string | null }) {
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-semibold text-primary">
      {first?.[0]}{last?.[0]}
    </div>
  )
}

function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

export function DepartmentSettings({
  dept, departments, onClose, onChanged, onPickManager, pickedManager, onDelete,
}: {
  dept: Dept
  departments: Dept[]
  onClose: () => void
  onChanged: () => void
  onPickManager: () => void
  pickedManager: { id: number | null; name: string } | null
  onDelete: () => void
}) {
  const [section, setSection] = useState<Section>('main')
  const [name, setName] = useState(dept.name)
  const [description, setDescription] = useState(dept.description || '')
  const [managerId, setManagerId] = useState<number | null>(dept.manager_id)
  const [managerName, setManagerName] = useState(dept.manager_name || '')
  const [parentId, setParentId] = useState<number | null>(dept.parent_id)
  const [blocked, setBlocked] = useState(dept.vacation_requests_blocked)
  const [vacParentSeesChild, setVacParentSeesChild] = useState(dept.vac_parent_sees_child)
  const [vacChildSeesParent, setVacChildSeesParent] = useState(dept.vac_child_sees_parent)
  const [vacParentApproves, setVacParentApproves] = useState(dept.vac_parent_approves)
  const [empParentSeesChild, setEmpParentSeesChild] = useState(dept.emp_parent_sees_child)
  const [empChildSeesParent, setEmpChildSeesParent] = useState(dept.emp_child_sees_parent)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useModalOpen(true)

  useEffect(() => {
    if (!pickedManager) return
    setManagerId(pickedManager.id)
    setManagerName(pickedManager.name)
  }, [pickedManager])

  const excludedParents = useMemo(() => new Set([dept.id, ...descendantsOf(departments, dept.id)]), [departments, dept.id])
  const hasParent = parentId !== null || dept.parent_user_id !== null
  const parentLabel = parentId !== null
    ? departments.find((d) => d.id === parentId)?.name
    : dept.parent_user_name

  const dirty = name !== dept.name || description !== (dept.description || '') || managerId !== dept.manager_id ||
    parentId !== dept.parent_id || blocked !== dept.vacation_requests_blocked ||
    vacParentSeesChild !== dept.vac_parent_sees_child || vacChildSeesParent !== dept.vac_child_sees_parent ||
    vacParentApproves !== dept.vac_parent_approves || empParentSeesChild !== dept.emp_parent_sees_child ||
    empChildSeesParent !== dept.emp_child_sees_parent

  const save = async () => {
    if (!name.trim()) { setSection('main'); setError('Название обязательно'); return }
    setSaving(true)
    setError(null)
    try {
      await apiPut(`/dictionaries/departments/${dept.id}`, {
        name: name.trim(),
        description,
        manager_id: managerId,
        parent_id: parentId,
        vacation_requests_blocked: blocked,
        vac_parent_sees_child: vacParentSeesChild,
        vac_child_sees_parent: vacChildSeesParent,
        vac_parent_approves: vacParentApproves,
        emp_parent_sees_child: empParentSeesChild,
        emp_child_sees_parent: empChildSeesParent,
      })
      toast.success(`«${name.trim()}» — изменения сохранены`)
      onChanged()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const sections: Array<{ id: Section; label: string; icon: typeof Settings2 }> = [
    { id: 'main', label: 'Основное', icon: Settings2 },
    { id: 'members', label: `Состав · ${dept.employee_count}`, icon: Users },
    { id: 'access', label: 'Отпуска и видимость', icon: Eye },
  ]

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Настройки отдела ${dept.name}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[640px] flex-col border-l border-border bg-card shadow-2xl animate-fade-in"
      >
        <header className="flex items-start gap-3 border-b border-border px-6 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Настройки отдела</p>
            <h3 className="mt-0.5 text-lg font-bold leading-snug [overflow-wrap:anywhere]">{dept.name}</h3>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-border px-4">
          {sections.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                  section === s.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {s.label}
              </button>
            )
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 scrollbar-thin">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-[13px] text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {section === 'main' && (
            <div className="space-y-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">Название</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={fieldClass} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">Описание</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Чем занимается отдел"
                  className={cn(fieldClass, 'resize-y')}
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">Руководитель</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={onPickManager} className={cn(fieldClass, 'flex-1 text-left hover:bg-muted/40')}>
                    <span className={managerName ? 'text-foreground' : 'text-muted-foreground'}>{managerName || 'Не назначен'}</span>
                  </button>
                  {managerId !== null && (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setManagerId(null); setManagerName('') }}>
                      Снять
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Руководитель согласовывает заявки на отпуск работников отдела</p>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">Входит в подразделение</span>
                <select
                  value={parentId ?? ''}
                  disabled={dept.on_hierarchy}
                  onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
                  className={fieldClass}
                >
                  <option value="">—</option>
                  {departments.filter((d) => !excludedParents.has(d.id)).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {dept.on_hierarchy && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Network className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Отдел размещён на схеме «Иерархия» — родитель задаётся связями на схеме
                    {dept.parent_user_name && !dept.parent_id ? ` (сейчас: ${dept.parent_user_name})` : ''}
                  </p>
                )}
              </label>

              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Удалить отдел
                </button>
              </div>
            </div>
          )}

          {section === 'members' && (
            <MembersSection dept={dept} departments={departments} onChanged={onChanged} />
          )}

          {section === 'access' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Заявки на отпуск</p>
                <ToggleRow
                  label="Запретить подачу заявок на отпуск"
                  hint={blocked ? 'Работники отдела не смогут подать новое заявление' : 'Работники отдела подают заявления как обычно'}
                  checked={blocked}
                  onChange={setBlocked}
                />
              </div>

              {hasParent ? (
                <>
                  <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Настройки связи с родителем «{parentLabel}». {dept.on_hierarchy ? 'Изменения сразу попадут и на схему «Иерархия».' : ''}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Видимость отпусков</p>
                    <ToggleRow label="Отпуск родителя виден отделу" checked={vacChildSeesParent} onChange={setVacChildSeesParent} />
                    <ToggleRow label="Родитель видит отпуска отдела" checked={vacParentSeesChild} onChange={setVacParentSeesChild} />
                    <ToggleRow
                      label="Родитель согласовывает отпуска отдела"
                      hint={!vacParentApproves ? 'Согласование уйдёт на уровень выше' : undefined}
                      checked={vacParentApproves}
                      onChange={setVacParentApproves}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Видимость в разделе «Работники»</p>
                    <ToggleRow label="Родитель видит работников отдела" checked={empParentSeesChild} onChange={setEmpParentSeesChild} />
                    <ToggleRow label="Работники родителя видны отделу" checked={empChildSeesParent} onChange={setEmpChildSeesParent} />
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  <Network className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Отдел не входит в другое подразделение. Видимость и согласование настраиваются для связи с родителем —
                    укажите подразделение во вкладке «Основное» или свяжите отдел на схеме «Иерархия».
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {section !== 'members' && (
          <footer className="flex items-center justify-end gap-2.5 border-t border-border px-6 py-4">
            <Button variant="outline" onClick={onClose}>Отмена</Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  )
}

function MembersSection({ dept, departments, onChanged }: { dept: Dept; departments: Dept[]; onChanged: () => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [target, setTarget] = useState<number | ''>('')
  const [moving, setMoving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setMembers(await apiGet<Member[]>(`/dictionaries/departments/${dept.id}/members`))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [dept.id])

  useEffect(() => { load() }, [load])

  const filtered = members.filter((m) => {
    const q = search.trim().toLowerCase()
    return !q || `${personName(m.last_name, m.first_name, m.middle_name)} ${m.position || ''} ${m.email}`.toLowerCase().includes(q)
  })
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])
  const allSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id))

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((m) => m.id)))

  const moveSelected = async () => {
    if (target === '' || selected.size === 0) return
    const targetName = departments.find((d) => d.id === target)?.name
    setMoving(true)
    try {
      await apiPost(`/dictionaries/departments/${target}/members`, { userIds: [...selected] })
      toast.success(`Переведено в «${targetName}»: ${selected.size}`)
      setSelected(new Set())
      setTarget('')
      await load()
      onChanged()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setMoving(false)
    }
  }

  const addMembers = async (ids: number[]) => {
    setShowPicker(false)
    if (ids.length === 0) return
    try {
      await apiPost(`/dictionaries/departments/${dept.id}/members`, { userIds: ids })
      toast.success(`Добавлено в «${dept.name}»: ${ids.length}`)
      await load()
      onChanged()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по составу…"
            className={cn(fieldClass, 'w-full py-2 pl-9')}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
          <UserPlus className="mr-1 h-4 w-4" /> Добавить работников
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <span className="text-sm font-medium">Выбрано: {selected.size}</span>
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : '')}
            className={cn(fieldClass, 'min-w-[160px] flex-1 py-1.5')}
          >
            <option value="">Перевести в отдел…</option>
            {departments.filter((d) => d.id !== dept.id).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={moveSelected} disabled={target === '' || moving}>
            {moving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Перевести
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          В отделе нет работников
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-primary" />
            {filtered.length === members.length ? `Все работники · ${members.length}` : `Найдено ${filtered.length} из ${members.length}`}
          </label>
          <div className="divide-y divide-border">
            {filtered.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="h-4 w-4 accent-primary" />
                <Initials first={m.first_name} last={m.last_name} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{personName(m.last_name, m.first_name, m.middle_name)}</span>
                    {m.id === dept.manager_id && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">руководитель</span>}
                    {m.is_test && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">тестовый</span>}
                    {STATUS_LABELS[m.status] && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{STATUS_LABELS[m.status]}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.position || m.email}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {showPicker && (
        <MemberPickerModal
          excludeIds={memberIds}
          onConfirm={addMembers}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}

function MemberPickerModal({ excludeIds, onConfirm, onClose }: { excludeIds: Set<number>; onConfirm: (ids: number[]) => void; onClose: () => void }) {
  const [users, setUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())

  useEffect(() => {
    apiGet<OrgUser[]>('/users')
      .then((data) => setUsers(data.filter((u) => u.status !== 'inactive' && !excludeIds.has(u.id))))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [excludeIds])

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase()
    return !q || `${personName(u.last_name, u.first_name, u.middle_name)} ${u.email} ${u.position || ''} ${u.department_name || ''}`.toLowerCase().includes(q)
  })

  const toggle = (id: number) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Добавить работников</h3>
            <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Поиск по имени, должности, отделу…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(fieldClass, 'w-full pl-9')}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Работники будут переведены из текущих отделов</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 scrollbar-thin">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{search ? 'Ничего не найдено' : 'Нет работников'}</div>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={cn('flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted/40', picked.has(u.id) && 'bg-primary/5')}
              >
                <Initials first={u.first_name} last={u.last_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{personName(u.last_name, u.first_name, u.middle_name)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[u.position, u.department_name || 'Без отдела'].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded border', picked.has(u.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                  {picked.has(u.id) && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <Button variant="outline" size="sm" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={() => onConfirm([...picked])} disabled={picked.size === 0}>
            Добавить{picked.size > 0 ? ` (${picked.size})` : ''}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DeleteDepartmentDialog({ dept, departments, onClose, onDeleted }: { dept: Dept; departments: Dept[]; onClose: () => void; onDeleted: () => void }) {
  const [target, setTarget] = useState<number | ''>('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsTransfer = dept.employee_count > 0

  useModalOpen(true)

  const submit = async () => {
    if (needsTransfer && target === '') return
    setDeleting(true)
    setError(null)
    try {
      await apiDelete(`/dictionaries/departments/${dept.id}${needsTransfer ? `?transfer_to=${target}` : ''}`)
      toast.success(needsTransfer
        ? `«${dept.name}» удалён, работники переведены в «${departments.find((d) => d.id === target)?.name}»`
        : `«${dept.name}» удалён`)
      onDeleted()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive"><Trash2 className="h-4 w-4" /></div>
          <h3 className="text-base font-bold">Удалить отдел «{dept.name}»?</h3>
        </div>

        {needsTransfer ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              В отделе {dept.employee_count} чел. Выберите, куда их перевести — отдел удалится сразу после перевода.
            </p>
            <select value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : '')} className={cn(fieldClass, 'w-full')}>
              <option value="">Выберите отдел…</option>
              {departments.filter((d) => d.id !== dept.id).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">В отделе нет работников. Черновики табелей по отделу будут удалены.</p>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-[13px] text-destructive">
            <Ban className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button variant="destructive" onClick={submit} disabled={deleting || (needsTransfer && target === '')}>
            {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {needsTransfer ? 'Перевести и удалить' : 'Удалить'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
