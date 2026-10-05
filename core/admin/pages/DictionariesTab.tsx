import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn, personName } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import {
  Briefcase, Plane, Tag, Plus, Trash2, Edit3, Check, X,
  AlertTriangle, Loader2, Users, UserPlus,
} from 'lucide-react'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
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

interface DictionariesData {
  positions: { name: string; count: string }[]
  vacationTypes: { id: number; code: string; name: string }[]
  skills: { id: number; name: string }[]
}

export function DictionariesTab({ initialTab = 'positions', variant = 'admin' }: { initialTab?: string; variant?: 'admin' | 'hr' }) {
  const isAdmin = variant === 'admin'
  const activeDict = initialTab
  const [data, setData] = useState<DictionariesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
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
  const [showPositionUsers, setShowPositionUsers] = useState<string | null>(null)
  const [assigningTag, setAssigningTag] = useState<{ id: number; name: string } | null>(null)

  useEffect(() => { setSearch('') }, [activeDict])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      if (isAdmin) {
        const res = await fetchWithRetry(`${API_BASE_URL}/admin/dictionaries`, { headers: getAuthHeaders() })
        if (res.ok) setData(await res.json())
      } else {
        const [posRes, vacRes, sklRes] = await Promise.all([
          fetchWithRetry(`${API_BASE_URL}/dictionaries/positions`, { headers: getAuthHeaders() }),
          fetchWithRetry(`${API_BASE_URL}/dictionaries/vacation-types`, { headers: getAuthHeaders() }),
          fetchWithRetry(`${API_BASE_URL}/dictionaries/skills`, { headers: getAuthHeaders() }),
        ])
        const positions = posRes.ok ? await posRes.json() : []
        const vacationTypes = vacRes.ok ? await vacRes.json() : []
        const skills = sklRes.ok ? await sklRes.json() : []
        setData({ positions, vacationTypes, skills })
      }
    } catch {} finally { if (!silent) setLoading(false) }
  }, [isAdmin])

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

  const updateSkill = async (id: number) => {
    if (!editSkillName.trim()) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/skills/${id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: editSkillName.trim() }),
      })
      if (res.ok) { setEditSkillId(null); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deleteSkill = async (id: number, name: string) => {
    if (!(await confirmDialog({ title: 'Удаление тега', message: `Удалить тег «${name}»? Он пропадёт у всех работников.`, confirmText: 'Удалить', variant: 'danger' }))) return
    try {
      await fetchWithRetry(`${API_BASE_URL}/dictionaries/skills/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchData()
    } catch {}
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

  const updateVacationType = async (id: number) => {
    if (!editVacationName.trim()) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/vacation-types/${id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: editVacationName.trim(), code: editVacationCode.trim() }),
      })
      if (res.ok) { setEditVacationId(null); fetchData() }
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

  const renamePosition = async (oldName: string) => {
    if (!editPositionNewName.trim() || editPositionNewName.trim() === oldName) { setEditPositionName(null); return }
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/positions/rename`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ oldName, newName: editPositionNewName.trim() }),
      })
      if (res.ok) { setEditPositionName(null); fetchData() }
      else { const d = await res.json(); setError(d.error) }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deletePosition = async (name: string) => {
    if (!(await confirmDialog({ title: 'Удаление должности', message: `Удалить должность «${name}»? Она будет очищена в профилях работников.`, confirmText: 'Удалить', variant: 'danger' }))) return
    try {
      await fetchWithRetry(`${API_BASE_URL}/dictionaries/positions/${encodeURIComponent(name)}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchData()
    } catch {}
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
                <th className={cn(TH, 'w-36')}>
                  <FilterHeader label="Работников" sortActive={positionSort.key === 'count'} sortDir={positionSort.dir} onSort={() => positionSort.toggle('count')}
                    filterOptions={COUNT_FILTER_OPTIONS} selected={fPositionCount} onFilterChange={setFPositionCount} />
                </th>
                <th className={cn(TH, 'w-24')} />
              </TableHeadRow>
            </thead>
            <tbody>
              {filteredPositions.length === 0 && <TableEmptyRow colSpan={3} icon={Briefcase} title="Должности не найдены" />}
              {positionSort.sorted(filteredPositions, (p, k) => (k === 'count' ? Number(p.count) || 0 : p.name)).map((p) => (
                <tr key={p.name} onClick={() => editPositionName !== p.name && setShowPositionUsers(p.name)} className={cn(TR, 'group cursor-pointer')}>
                  {editPositionName === p.name ? (
                    <td colSpan={3} className={TD} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Input value={editPositionNewName} onChange={e => setEditPositionNewName(e.target.value)} className="h-8 text-[13px]" autoFocus onKeyDown={e => e.key === 'Enter' && renamePosition(p.name)} />
                        <Button size="sm" variant="outline" onClick={() => renamePosition(p.name)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditPositionName(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className={cn(TD, 'font-medium')}>{p.name}</td>
                      <td className={TD}><CountBadge count={Number(p.count) || 0} /></td>
                      <td className={TD}>
                        <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          <RowAction icon={Users} label="Работники" onClick={() => setShowPositionUsers(p.name)} />
                          {isAdmin && <RowAction icon={Edit3} label="Переименовать" onClick={() => { setEditPositionName(p.name); setEditPositionNewName(p.name) }} />}
                          {isAdmin && <RowAction icon={Trash2} label="Удалить" danger onClick={() => deletePosition(p.name)} />}
                        </div>
                      </td>
                    </>
                  )}
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
                <tr key={vt.id} className={cn(TR, 'group')}>
                  {editVacationId === vt.id ? (
                    <td colSpan={3} className={TD}>
                      <div className="flex items-center gap-2">
                        <Input value={editVacationName} onChange={e => setEditVacationName(e.target.value)} className="h-8 text-[13px]" autoFocus onKeyDown={e => e.key === 'Enter' && updateVacationType(vt.id)} />
                        <Input value={editVacationCode} onChange={e => setEditVacationCode(e.target.value)} className="h-8 w-28 text-[13px]" onKeyDown={e => e.key === 'Enter' && updateVacationType(vt.id)} />
                        <Button size="sm" variant="outline" onClick={() => updateVacationType(vt.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditVacationId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className={cn(TD, 'font-medium')}>{vt.name}</td>
                      <td className={TD}><span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{vt.code}</span></td>
                      <td className={TD}>
                        <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          <RowAction icon={Edit3} label="Редактировать" onClick={() => { setEditVacationId(vt.id); setEditVacationName(vt.name); setEditVacationCode(vt.code) }} />
                          <RowAction icon={Trash2} label="Удалить" danger onClick={() => deleteVacationType(vt.id, vt.name)} />
                        </div>
                      </td>
                    </>
                  )}
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
                <th className={cn(TH, 'w-28')} />
              </TableHeadRow>
            </thead>
            <tbody>
              {filteredSkills.length === 0 && <TableEmptyRow colSpan={2} icon={Tag} title="Ничего не найдено" />}
              {skillSort.sorted(filteredSkills, (sk) => sk.name).map((sk) => (
                <tr key={sk.id} className={cn(TR, 'group')}>
                  {editSkillId === sk.id ? (
                    <td colSpan={2} className={TD}>
                      <div className="flex items-center gap-2">
                        <Input value={editSkillName} onChange={e => setEditSkillName(e.target.value)} className="h-8 text-[13px]" autoFocus onKeyDown={e => e.key === 'Enter' && updateSkill(sk.id)} />
                        <Button size="sm" variant="outline" onClick={() => updateSkill(sk.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditSkillId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[12px] font-medium">
                          <Tag className="h-3 w-3 text-muted-foreground" /> {sk.name}
                        </span>
                      </td>
                      <td className={TD}>
                        <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          <RowAction icon={UserPlus} label="Назначить работникам" onClick={() => setAssigningTag({ id: sk.id, name: sk.name })} />
                          <RowAction icon={Edit3} label="Переименовать" onClick={() => { setEditSkillId(sk.id); setEditSkillName(sk.name) }} />
                          <RowAction icon={Trash2} label="Удалить" danger onClick={() => deleteSkill(sk.id, sk.name)} />
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )
      )}

      {showPositionUsers && (
        <PositionUsersModal position={showPositionUsers} isAdmin={isAdmin} onClose={() => setShowPositionUsers(null)} />
      )}

      {assigningTag && (
        <AssignTagModal
          tag={assigningTag}
          onClose={() => setAssigningTag(null)}
          onAssigned={() => fetchData(true)}
        />
      )}
    </TableCard>
  )
}

function PositionUsersModal({ position, isAdmin, onClose }: { position: string; isAdmin: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<{ id: number; first_name: string; last_name: string; middle_name: string | null; email: string; department_name: string | null; role: string; status: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = isAdmin
      ? `${API_BASE_URL}/admin/users?position=${encodeURIComponent(position)}&limit=100`
      : `${API_BASE_URL}/users?position=${encodeURIComponent(position)}&limit=100`
    fetchWithRetry(url, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setUsers(data.users || data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [position, isAdmin])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden border border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2"><Briefcase className="h-5 w-5 text-muted-foreground" /> {position}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Работники на этой должности</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Users className="h-10 w-10 opacity-20" />
              <p className="text-sm">Нет работников на этой должности</p>
            </div>
          ) : (
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
          )}
        </div>
      </div>
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
