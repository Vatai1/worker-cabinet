import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn, personName } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import {
  Briefcase, Plane, Tag, Plus, Trash2, X,
  AlertTriangle, Loader2, Users, UserPlus, RotateCcw, Settings2,
} from 'lucide-react'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { EntityModal, ModalError } from '@/shared/components/ui/EntityModal'
import { useCan } from '@/shared/lib/permissions'
import {
  CountBadge, FilterHeader, RowAction, TableCard, TableEmpty, TableEmptyRow, TableFrame, TableHeadRow, TableSearch, TableSkeleton, TD, TH, TR,
  filterOptionsOf, matchesFilter, useTableSort,
} from '@/shared/components/ui/DataTable'

const ROLE_LABELS: Record<string, string> = {
  employee: 'Работник', manager: 'Руководитель', hr: 'HR-менеджер',
  admin: 'Администратор', director: 'Директор', onboarding: 'Онбординг',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  inactive: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  on_leave: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен', inactive: 'Неактивен', on_leave: 'В отпуске',
}

const COUNT_FILTER_OPTIONS = [
  { id: 'with', label: 'Есть работники' },
  { id: 'without', label: 'Без работников' },
]

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few
  return many
}

interface TagUser {
  id: number
  first_name: string
  last_name: string
  middle_name: string | null
  position: string | null
  department_name: string | null
  skills?: string[]
}

interface DictionariesData {
  positions: { name: string; count: string; genitive: string | null; suggestion: string }[]
  vacationTypes: { id: number; code: string; name: string }[]
  skills: { id: number; name: string }[]
}

export function DictionariesTab({ initialTab = 'positions' }: { initialTab?: string }) {
  const canEditPositions = useCan('dictionaries:positions')
  const activeDict = initialTab
  const [data, setData] = useState<DictionariesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [newVacationName, setNewVacationName] = useState('')
  const [newVacationCode, setNewVacationCode] = useState('')
  const [settingsPosition, setSettingsPosition] = useState<DictionariesData['positions'][number] | null>(null)
  const [editingSkill, setEditingSkill] = useState<DictionariesData['skills'][number] | null>(null)
  const [editingVacationType, setEditingVacationType] = useState<DictionariesData['vacationTypes'][number] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setSearch('') }, [activeDict])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [posRes, vacRes, sklRes] = await Promise.all([
        fetchWithRetry(`${API_BASE_URL}/dictionaries/positions`, { headers: getAuthHeaders() }),
        fetchWithRetry(`${API_BASE_URL}/dictionaries/vacation-types`, { headers: getAuthHeaders() }),
        fetchWithRetry(`${API_BASE_URL}/dictionaries/skills`, { headers: getAuthHeaders() }),
      ])
      const positions = posRes.ok ? await posRes.json() : []
      const vacationTypes = vacRes.ok ? await vacRes.json() : []
      const skills = sklRes.ok ? await sklRes.json() : []
      setData({ positions, vacationTypes, skills })
    } catch {} finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const addSkill = async () => {
    if (!newSkill.trim()) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/skills`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newSkill.trim() }),
      })
      if (res.ok) { setNewSkill(''); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const putDictionary = async (path: string, body: object) => {
    const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/${path}`, {
      method: 'PUT', headers: getAuthHeadersWithContentType(), body: JSON.stringify(body),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
    fetchData(true)
  }

  const deleteSkill = async (id: number, name: string) => {
    if (!(await confirmDialog({ title: 'Удаление тега', message: `Удалить тег «${name}»? Он пропадёт у всех работников.`, confirmText: 'Удалить', variant: 'danger' }))) return
    const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/skills/${id}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
    setEditingSkill(null)
    fetchData(true)
  }

  const addVacationType = async () => {
    if (!newVacationName.trim() || !newVacationCode.trim()) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/vacation-types`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newVacationName.trim(), code: newVacationCode.trim() }),
      })
      if (res.ok) { setNewVacationName(''); setNewVacationCode(''); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deleteVacationType = async (id: number, name: string) => {
    if (!(await confirmDialog({ title: 'Удаление типа отпуска', message: `Удалить тип «${name}»?`, confirmText: 'Удалить', variant: 'danger' }))) return
    try {
      await fetchWithRetry(`${API_BASE_URL}/dictionaries/vacation-types/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchData()
    } catch {}
  }

  const deletePosition = async (name: string) => {
    if (!(await confirmDialog({ title: 'Удаление должности', message: `Удалить должность «${name}»? Она будет очищена в профилях работников.`, confirmText: 'Удалить', variant: 'danger' }))) return
    const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/positions/${encodeURIComponent(name)}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
    setSettingsPosition(null)
    fetchData(true)
  }

  const q = search.trim().toLowerCase()
  const positionSort = useTableSort<'name' | 'count'>('name')
  const vacationSort = useTableSort<'name' | 'code'>('name')
  const skillSort = useTableSort<'name'>('name')
  const [fPositions, setFPositions] = useState<string[]>([])
  const [fPositionCount, setFPositionCount] = useState<string[]>([])
  const [fVacationNames, setFVacationNames] = useState<string[]>([])
  const [fVacationCodes, setFVacationCodes] = useState<string[]>([])
  const [fSkills, setFSkills] = useState<string[]>([])

  const filteredPositions = useMemo(() =>
    (data?.positions ?? []).filter(p =>
      (!q || p.name.toLowerCase().includes(q)) &&
      matchesFilter(fPositions, p.name) &&
      matchesFilter(fPositionCount, Number(p.count) > 0 ? 'with' : 'without')),
    [data, q, fPositions, fPositionCount])
  const filteredVacationTypes = useMemo(() =>
    (data?.vacationTypes ?? []).filter(v =>
      (!q || `${v.name} ${v.code}`.toLowerCase().includes(q)) &&
      matchesFilter(fVacationNames, v.name) &&
      matchesFilter(fVacationCodes, v.code)),
    [data, q, fVacationNames, fVacationCodes])
  const filteredSkills = useMemo(() =>
    (data?.skills ?? []).filter(sk => (!q || sk.name.toLowerCase().includes(q)) && matchesFilter(fSkills, sk.name)),
    [data, q, fSkills])

  const tabInfo = activeDict === 'positions'
    ? { name: 'Должности', icon: Briefcase, desc: 'Должности работников (из профиля)' }
    : activeDict === 'vacationTypes'
    ? { name: 'Типы отпусков', icon: Plane, desc: 'Виды отпусков, доступные при подаче заявления' }
    : { name: 'Теги', icon: Tag, desc: 'Каталог тегов компании' }

  const count = activeDict === 'positions' ? data?.positions.length : activeDict === 'vacationTypes' ? data?.vacationTypes.length : data?.skills.length
  const countLabel = count === undefined ? '' : activeDict === 'positions'
    ? `${count} ${pluralRu(count, 'должность', 'должности', 'должностей')}`
    : activeDict === 'vacationTypes'
    ? `${count} ${pluralRu(count, 'тип', 'типа', 'типов')}`
    : `${count} ${pluralRu(count, 'тег', 'тега', 'тегов')}`

  return (
    <TableCard icon={tabInfo.icon} title={tabInfo.name} subtitle={countLabel ? `${tabInfo.desc} · ${countLabel}` : tabInfo.desc}>
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <TableSearch
          value={search}
          onChange={setSearch}
          placeholder={activeDict === 'positions' ? 'Поиск должности…' : activeDict === 'vacationTypes' ? 'Поиск по названию или коду…' : 'Поиск тега…'}
        />
        {activeDict === 'vacationTypes' && (
          <>
            <Input placeholder="Название нового типа" value={newVacationName} onChange={e => setNewVacationName(e.target.value)} className="h-9 w-56 rounded-[10px] text-[13px]" />
            <Input placeholder="Код" value={newVacationCode} onChange={e => setNewVacationCode(e.target.value)} className="h-9 w-24 rounded-[10px] text-[13px]" onKeyDown={e => e.key === 'Enter' && addVacationType()} />
            <Button size="sm" onClick={addVacationType} disabled={!newVacationName.trim() || !newVacationCode.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Добавить
            </Button>
          </>
        )}
        {activeDict === 'skills' && (
          <>
            <Input placeholder="Новый тег" value={newSkill} onChange={e => setNewSkill(e.target.value)} className="h-9 w-56 rounded-[10px] text-[13px]" onKeyDown={e => e.key === 'Enter' && addSkill()} />
            <Button size="sm" onClick={addSkill} disabled={!newSkill.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Добавить
            </Button>
          </>
        )}
      </div>

      {loading || !data ? <TableSkeleton /> : activeDict === 'positions' ? (
        data.positions.length === 0 ? (
          <TableEmpty icon={Briefcase} title="Нет должностей" hint="Должности появятся, когда их укажут в профилях работников" />
        ) : (
          <TableFrame>
            <thead>
              <TableHeadRow>
                <th className={TH}>
                  <FilterHeader label="Должность" sortActive={positionSort.key === 'name'} sortDir={positionSort.dir} onSort={() => positionSort.toggle('name')}
                    filterOptions={filterOptionsOf(data.positions.map(p => p.name))} selected={fPositions} onFilterChange={setFPositions} searchPlaceholder="Поиск должности…" />
                </th>
                <th className={TH}>Родительный падеж</th>
                <th className={cn(TH, 'w-36')}>
                  <FilterHeader label="Работников" sortActive={positionSort.key === 'count'} sortDir={positionSort.dir} onSort={() => positionSort.toggle('count')}
                    filterOptions={COUNT_FILTER_OPTIONS} selected={fPositionCount} onFilterChange={setFPositionCount} />
                </th>
              </TableHeadRow>
            </thead>
            <tbody>
              {filteredPositions.length === 0 && <TableEmptyRow colSpan={3} icon={Briefcase} title="Должности не найдены" />}
              {positionSort.sorted(filteredPositions, (p, k) => (k === 'count' ? Number(p.count) || 0 : p.name)).map((p) => (
                <tr key={p.name} onClick={() => setSettingsPosition(p)} className={cn(TR, 'cursor-pointer')}>
                  <td className={cn(TD, 'font-medium')}>{p.name}</td>
                  <td className={TD}>
                    <span className={cn('truncate', !p.genitive && 'text-muted-foreground')}>{p.genitive ?? p.suggestion}</span>
                    {!p.genitive && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">авто</span>}
                  </td>
                  <td className={TD}><CountBadge count={Number(p.count) || 0} /></td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )
      ) : activeDict === 'vacationTypes' ? (
        data.vacationTypes.length === 0 ? (
          <TableEmpty icon={Plane} title="Нет типов отпусков" hint="Добавьте первый тип отпуска" />
        ) : (
          <TableFrame>
            <thead>
              <TableHeadRow>
                <th className={TH}>
                  <FilterHeader label="Название" sortActive={vacationSort.key === 'name'} sortDir={vacationSort.dir} onSort={() => vacationSort.toggle('name')}
                    filterOptions={filterOptionsOf(data.vacationTypes.map(v => v.name))} selected={fVacationNames} onFilterChange={setFVacationNames} searchPlaceholder="Поиск типа…" />
                </th>
                <th className={cn(TH, 'w-44')}>
                  <FilterHeader label="Код" sortActive={vacationSort.key === 'code'} sortDir={vacationSort.dir} onSort={() => vacationSort.toggle('code')}
                    filterOptions={filterOptionsOf(data.vacationTypes.map(v => v.code))} selected={fVacationCodes} onFilterChange={setFVacationCodes} searchPlaceholder="Поиск кода…" />
                </th>
                <th className={cn(TH, 'w-24')} />
              </TableHeadRow>
            </thead>
            <tbody>
              {filteredVacationTypes.length === 0 && <TableEmptyRow colSpan={3} icon={Plane} title="Ничего не найдено" />}
              {vacationSort.sorted(filteredVacationTypes, (v, k) => (k === 'code' ? v.code : v.name)).map((vt) => (
                <tr key={vt.id} onClick={() => setEditingVacationType(vt)} className={cn(TR, 'group cursor-pointer')}>
                  <td className={cn(TD, 'font-medium')}>{vt.name}</td>
                  <td className={TD}><span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{vt.code}</span></td>
                  <td className={TD}>
                    <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                      <RowAction icon={Settings2} label="Настройки" onClick={() => setEditingVacationType(vt)} />
                      <RowAction icon={Trash2} label="Удалить" danger onClick={() => deleteVacationType(vt.id, vt.name)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )
      ) : (
        data.skills.length === 0 ? (
          <TableEmpty icon={Tag} title="Нет тегов" hint="Добавьте первый тег" />
        ) : (
          <TableFrame>
            <thead>
              <TableHeadRow>
                <th className={TH}>
                  <FilterHeader label="Тег" sortActive={skillSort.key === 'name'} sortDir={skillSort.dir} onSort={() => skillSort.toggle('name')}
                    filterOptions={filterOptionsOf(data.skills.map(sk => sk.name))} selected={fSkills} onFilterChange={setFSkills} searchPlaceholder="Поиск тега…" />
                </th>
              </TableHeadRow>
            </thead>
            <tbody>
              {filteredSkills.length === 0 && <TableEmptyRow colSpan={1} icon={Tag} title="Ничего не найдено" />}
              {skillSort.sorted(filteredSkills, (sk) => sk.name).map((sk) => (
                <tr key={sk.id} onClick={() => setEditingSkill(sk)} className={cn(TR, 'cursor-pointer')}>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[12px] font-medium">
                      <Tag className="h-3 w-3 text-muted-foreground" /> {sk.name}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )
      )}

      {editingVacationType && (
        <DictEditModal
          icon={Plane}
          title="Настройки типа отпуска"
          subtitle={editingVacationType.name}
          fields={[
            { id: 'name', label: 'Название', initial: editingVacationType.name },
            { id: 'code', label: 'Код', initial: editingVacationType.code, mono: true },
          ]}
          onSave={async (v) => { await putDictionary(`vacation-types/${editingVacationType.id}`, { name: v.name, code: v.code }); setEditingVacationType(null) }}
          onClose={() => setEditingVacationType(null)}
        />
      )}

      {editingSkill && (
        <TagSettingsModal
          tag={editingSkill}
          onDelete={() => deleteSkill(editingSkill.id, editingSkill.name)}
          onClose={() => setEditingSkill(null)}
          onSaved={() => { setEditingSkill(null); fetchData(true) }}
        />
      )}

      {settingsPosition && (
        <PositionSettingsModal
          position={settingsPosition}
          canEdit={canEditPositions}
          onDelete={() => deletePosition(settingsPosition.name)}
          onClose={() => setSettingsPosition(null)}
          onSaved={() => { setSettingsPosition(null); fetchData(true) }}
        />
      )}

    </TableCard>
  )
}

function DictEditModal({ icon, title, subtitle, fields, onSave, onClose }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  fields: { id: string; label: string; initial: string; mono?: boolean }[]
  onSave: (values: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(f => [f.id, f.initial])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]))
  const canSave = fields.every(f => trimmed[f.id]) && fields.some(f => trimmed[f.id] !== f.initial)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
    } catch (err) {
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <EntityModal icon={icon} title={title} subtitle={subtitle} busy={saving} canSave={canSave} onSave={save} onClose={onClose}>
      <div className="space-y-4">
        <ModalError error={error} />
        {fields.map((f, i) => (
          <div key={f.id} className="space-y-1.5">
            <label htmlFor={`dict-${f.id}`} className="text-xs font-medium text-muted-foreground">{f.label}</label>
            <Input
              id={`dict-${f.id}`}
              value={values[f.id]}
              onChange={e => setValues(prev => ({ ...prev, [f.id]: e.target.value }))}
              className={cn(f.mono && 'font-mono')}
              autoFocus={i === 0}
            />
          </div>
        ))}
      </div>
    </EntityModal>
  )
}

function PositionSettingsModal({ position, canEdit, onDelete, onClose, onSaved }: {
  position: DictionariesData['positions'][number]
  canEdit: boolean
  onDelete: () => Promise<void>
  onClose: () => void
  onSaved: () => void
}) {
  const canRename = canEdit
  const [tab, setTab] = useState<'settings' | 'users'>('settings')
  const [name, setName] = useState(position.name)
  const [genitive, setGenitive] = useState(position.genitive ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const newName = name.trim()
  const nameChanged = newName !== position.name
  const genitiveChanged = genitive.trim() !== (position.genitive ?? '')
  const canSave = !!newName && (nameChanged || genitiveChanged)

  const put = async (path: string, body: object) => {
    const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/positions/${path}`, {
      method: 'PUT', headers: getAuthHeadersWithContentType(), body: JSON.stringify(body),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      if (nameChanged) await put('rename', { oldName: position.name, newName })
      if (genitiveChanged || (nameChanged && genitive.trim())) await put('genitive', { name: newName, genitive: genitive.trim() })
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setError(null)
    try {
      await onDelete()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const count = Number(position.count) || 0

  return (
    <EntityModal
      icon={Briefcase}
      title={position.name}
      subtitle={`Должность · ${count} ${pluralRu(count, 'работник', 'работника', 'работников')}`}
      tabs={[{ id: 'settings', label: 'Настройки', icon: Settings2 }, { id: 'users', label: `Работники (${count})`, icon: Users }]}
      tab={tab}
      onTabChange={(t) => setTab(t as typeof tab)}
      busy={saving}
      canSave={canSave}
      onSave={save}
      onDelete={canEdit ? remove : undefined}
      onClose={onClose}
    >
      <div className="space-y-4">
        <ModalError error={error} />
        {tab === 'users' ? <PositionUsersList position={position.name} /> : <>
          <div className="space-y-1.5">
            <label htmlFor="position-name" className="text-xs font-medium text-muted-foreground">Название</label>
            <Input id="position-name" value={name} onChange={e => setName(e.target.value)} disabled={!canRename} autoFocus={canRename} />
            {canRename && nameChanged && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Должность изменится у всех работников ({Number(position.count) || 0}). Проверьте склонение для нового названия.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="position-genitive" className="text-xs font-medium text-muted-foreground">Родительный падеж (кого? чего?)</label>
            <div className="flex gap-2">
              <Input
                id="position-genitive"
                value={genitive}
                onChange={e => setGenitive(e.target.value)}
                placeholder={position.suggestion}
                autoFocus={!canRename}
              />
              {genitive && (
                <Button type="button" variant="ghost" size="sm" className="h-10 shrink-0" onClick={() => setGenitive('')} title="Вернуть автоматическое">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {genitive ? 'Задано вручную.' : <>Сейчас автоматически: «{position.suggestion}».</>} Подставляется в документы как {'{position_gen}'}.
            </p>
          </div>
        </>}
      </div>
    </EntityModal>
  )
}

function TagSettingsModal({ tag, onDelete, onClose, onSaved }: {
  tag: DictionariesData['skills'][number]
  onDelete: () => Promise<void>
  onClose: () => void
  onSaved: () => void
}) {
  const [tab, setTab] = useState<'settings' | 'users'>('settings')
  const [name, setName] = useState(tag.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<TagUser[] | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)

  const loadUsers = useCallback(() => {
    fetchWithRetry(`${API_BASE_URL}/users?limit=1000`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then((data) => setUsers(((data.users || data || []) as TagUser[]).filter(u => u.skills?.includes(tag.name))))
      .catch(() => setUsers([]))
  }, [tag.name])

  useEffect(() => { loadUsers() }, [loadUsers])

  const newName = name.trim()
  const canSave = !!newName && newName !== tag.name
  const count = users?.length

  const run = async (action: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const save = () => run(async () => {
    const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/skills/${tag.id}`, {
      method: 'PUT', headers: getAuthHeadersWithContentType(), body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
    onSaved()
  })

  const removeUser = async (u: TagUser) => {
    setRemovingId(u.id)
    setError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/users/${u.id}/skills`, {
        method: 'DELETE', headers: getAuthHeadersWithContentType(), body: JSON.stringify({ skill: tag.name }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
      setUsers(prev => prev?.filter(x => x.id !== u.id) ?? prev)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <>
      <EntityModal
        icon={Tag}
        title={tag.name}
        subtitle={count === undefined ? 'Тег' : `Тег · ${count} ${pluralRu(count, 'работник', 'работника', 'работников')}`}
        tabs={[{ id: 'settings', label: 'Настройки', icon: Settings2 }, { id: 'users', label: count === undefined ? 'Работники' : `Работники (${count})`, icon: Users }]}
        tab={tab}
        onTabChange={(t) => setTab(t as typeof tab)}
        busy={saving}
        locked={assigning}
        canSave={canSave}
        onSave={save}
        onDelete={() => run(onDelete)}
        onClose={onClose}
      >
        <div className="space-y-4">
          <ModalError error={error} />
          {tab === 'settings' ? (
            <div className="space-y-1.5">
              <label htmlFor="tag-name" className="text-xs font-medium text-muted-foreground">Название</label>
              <Input id="tag-name" value={name} onChange={e => setName(e.target.value)} autoFocus />
              {canSave && !!count && <p className="text-[11px] text-amber-600 dark:text-amber-400">Тег переименуется у всех работников ({count}).</p>}
            </div>
          ) : (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => setAssigning(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Назначить работникам
              </Button>
              {users === null ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                  <Users className="h-10 w-10 opacity-20" />
                  <p className="text-sm">Тег пока никому не назначен</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map(u => (
                    <div key={u.id} className="group flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/30">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-semibold text-primary">
                        {u.first_name?.[0]}{u.last_name?.[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{personName(u.last_name, u.first_name, u.middle_name)}</p>
                        <p className="truncate text-xs text-muted-foreground">{[u.position, u.department_name].filter(Boolean).join(' · ')}</p>
                      </div>
                      <Button type="button" size="sm" variant="ghost" title="Снять тег" disabled={removingId === u.id} onClick={() => removeUser(u)} className="opacity-60 group-hover:opacity-100">
                        {removingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </EntityModal>
      {assigning && <AssignTagModal tag={tag} onClose={() => setAssigning(false)} onAssigned={loadUsers} />}
    </>
  )
}

function PositionUsersList({ position }: { position: string }) {
  const [users, setUsers] = useState<{ id: number; first_name: string; last_name: string; middle_name: string | null; email: string; department_name: string | null; role: string; status: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWithRetry(`${API_BASE_URL}/users/search?position=${encodeURIComponent(position)}&includeInactive=true`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [position])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
        <Users className="h-10 w-10 opacity-20" />
        <p className="text-sm">Нет работников на этой должности</p>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {users.map(u => {
        const fullName = personName(u.last_name, u.first_name, u.middle_name)
        return (
          <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
              {u.first_name?.[0]}{u.last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{fullName}</span>
                <span className={cn('inline-flex items-center rounded-lg border border-transparent px-2.5 py-0.5 text-[10px] font-medium', STATUS_COLORS[u.status])}>{STATUS_LABELS[u.status]}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="truncate">{u.email}</span>
                {u.department_name && <span>· {u.department_name}</span>}
                <span>· {ROLE_LABELS[u.role] || u.role}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AssignTagModal({ tag, onClose, onAssigned }: { tag: { id: number; name: string }; onClose: () => void; onAssigned: () => void }) {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<{ id: number; first_name: string; last_name: string; middle_name: string | null; position: string | null; department_name: string | null; skills?: string[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ assigned: number; total: number } | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    fetchWithRetry(`${API_BASE_URL}/users?limit=1000`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(data => setUsers(data.users || data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase()
      return !q || `${u.last_name} ${u.first_name} ${u.position || ''} ${u.department_name || ''}`.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const aHas = a.skills?.includes(tag.name) ? 0 : 1
      const bHas = b.skills?.includes(tag.name) ? 0 : 1
      if (aHas !== bHas) return aHas - bHas
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'ru')
    })

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllFiltered = () => {
    setSelected(prev => {
      const next = new Set(prev)
      filtered.forEach(u => { if (!u.skills?.includes(tag.name)) next.add(u.id) })
      return next
    })
  }

  const handleAssign = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/skills/${tag.id}/assign`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ userIds: [...selected] }),
      })
      if (res.ok) {
        const data = await res.json()
        setResult({ assigned: data.assigned, total: data.total })
        onAssigned()
      } else {
        const d = await res.json()
        setError(d.error || 'Ошибка')
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden border border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Tag className="h-5 w-5 text-muted-foreground" /> Назначить тег «{tag.name}»
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>

        {result ? (
          <div className="p-6 text-center space-y-4">
            <p className="text-sm">
              Тег «{tag.name}» назначен {result.assigned} из {result.total} выбранных работников
              {result.total - result.assigned > 0 ? ` (у остальных ${result.total - result.assigned} тег уже был)` : ''}.
            </p>
            <Button onClick={onClose}>Готово</Button>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-border shrink-0 space-y-2">
              <Input
                placeholder="Поиск по имени, должности, отделу…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 text-sm"
                autoFocus
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Выбрано: {selected.size}</span>
                <button type="button" onClick={selectAllFiltered} className="text-primary hover:underline">
                  Выбрать всех в списке
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-4 mt-3 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">{error}</div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-2">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Ничего не найдено</div>
              ) : (
                filtered.map(u => {
                  const already = u.skills?.includes(tag.name) ?? false
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg text-sm ${already ? 'opacity-50' : 'hover:bg-muted/40 cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={already || selected.has(u.id)}
                        disabled={already}
                        onChange={() => toggle(u.id)}
                        className="rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{personName(u.last_name, u.first_name, u.middle_name)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[u.position, u.department_name].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {already && <span className="text-[10px] text-muted-foreground shrink-0">уже добавлен</span>}
                    </label>
                  )
                })
              )}
            </div>

            <div className="p-4 border-t border-border shrink-0 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
              <Button className="flex-1" onClick={handleAssign} disabled={selected.size === 0 || saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Назначить{selected.size > 0 ? ` (${selected.size})` : ''}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
