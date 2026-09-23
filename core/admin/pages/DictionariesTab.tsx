import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn, personName } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import {
  Briefcase, Plane, Tag, Plus, Trash2, Edit3, Check, X,
  AlertTriangle, Loader2, Users, UserPlus, Search, MoreVertical,
} from 'lucide-react'

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

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-[120px] flex-col gap-0.5 rounded-xl border border-border bg-card px-4 py-2.5">
      <b className="text-lg font-bold leading-tight">{value}</b>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
      />
    </div>
  )
}

function EmptyState({ icon: Icon, title, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
      <Icon className="h-8 w-8 opacity-20" />
      <b className="text-[15px] text-foreground">{title}</b>
      {hint}
    </div>
  )
}

function RowCard({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-muted-foreground/30">
      {children}
    </article>
  )
}

function IconChip({ icon: Icon, className }: { icon: React.ComponentType<{ className?: string }>; className: string }) {
  return (
    <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', className)}>
      <Icon className="h-5 w-5" />
    </div>
  )
}

function RowMenu({ open, onToggle, children, label }: { open: boolean; onToggle: () => void; children: React.ReactNode; label: string }) {
  return (
    <div className="relative">
      <button
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        onClick={e => { e.stopPropagation(); onToggle() }}
        className={cn(
          'grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          open && 'bg-muted text-foreground',
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          onClick={e => e.stopPropagation()}
          className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, label, danger, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium hover:bg-muted',
        danger && 'text-destructive hover:bg-destructive/10',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

export function DictionariesTab({ initialTab = 'positions', variant = 'admin' }: { initialTab?: string; variant?: 'admin' | 'hr' }) {
  const isAdmin = variant === 'admin'
  const activeDict = initialTab
  const [data, setData] = useState<DictionariesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
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

  useEffect(() => {
    if (openMenuKey === null) return
    const close = () => setOpenMenuKey(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuKey])

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

  const deleteSkill = async (id: number) => {
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

  const deleteVacationType = async (id: number) => {
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
    try {
      await fetchWithRetry(`${API_BASE_URL}/dictionaries/positions/${encodeURIComponent(name)}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchData()
    } catch {}
  }

  const q = search.trim().toLowerCase()
  const filteredPositions = useMemo(() =>
    !q ? (data?.positions ?? []) : (data?.positions ?? []).filter(p => p.name.toLowerCase().includes(q)),
    [data, q])
  const filteredVacationTypes = useMemo(() =>
    !q ? (data?.vacationTypes ?? []) : (data?.vacationTypes ?? []).filter(v => `${v.name} ${v.code}`.toLowerCase().includes(q)),
    [data, q])
  const filteredSkills = useMemo(() =>
    !q ? (data?.skills ?? []) : (data?.skills ?? []).filter(s => s.name.toLowerCase().includes(q)),
    [data, q])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!data) return null

  const tabInfo = activeDict === 'positions'
    ? { name: 'Должности', icon: Briefcase, color: 'from-blue-500 to-indigo-600', desc: 'Должности работников (из профиля)' }
    : activeDict === 'vacationTypes'
    ? { name: 'Типы отпусков', icon: Plane, color: 'from-emerald-500 to-teal-600', desc: 'Виды отпусков, доступные при подаче заявления' }
    : { name: 'Теги', icon: Tag, color: 'from-violet-500 to-purple-600', desc: 'Каталог тегов компании' }
  const ActiveIcon = tabInfo.icon

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white', tabInfo.color)}>
          <ActiveIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{tabInfo.name}</h2>
          <p className="text-sm text-muted-foreground">{tabInfo.desc}</p>
        </div>
      </div>

      {activeDict === 'positions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatPill value={data.positions.length} label={pluralRu(data.positions.length, 'должность', 'должности', 'должностей')} />
            <SearchBox value={search} onChange={setSearch} placeholder="Поиск должности…" />
          </div>

          {filteredPositions.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title={data.positions.length === 0 ? 'Нет должностей' : 'Должности не найдены'}
              hint={data.positions.length === 0 ? 'Должности появятся, когда их укажут в профилях работников' : 'Измените запрос поиска'}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredPositions.map((p) => {
                const count = Number(p.count) || 0
                const key = `pos-${p.name}`
                return (
                  <RowCard key={p.name}>
                    {editPositionName === p.name ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input value={editPositionNewName} onChange={e => setEditPositionNewName(e.target.value)} className="h-9 text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && renamePosition(p.name)} />
                        <Button size="sm" variant="outline" onClick={() => renamePosition(p.name)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditPositionName(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <>
                        <IconChip icon={Briefcase} className="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
                        <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{p.name}</h3>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
                            count === 0 ? 'bg-muted text-muted-foreground/60' : 'bg-primary/10 text-primary',
                          )}>
                            <Users className="h-3 w-3" /> {count} чел.
                          </span>
                          <button onClick={() => setShowPositionUsers(p.name)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Работники">
                            <Users className="h-3.5 w-3.5" />
                          </button>
                          {isAdmin && (
                            <RowMenu open={openMenuKey === key} onToggle={() => setOpenMenuKey(openMenuKey === key ? null : key)} label={`Действия: ${p.name}`}>
                              <MenuItem icon={Edit3} label="Переименовать" onClick={() => { setOpenMenuKey(null); setEditPositionName(p.name); setEditPositionNewName(p.name) }} />
                              <MenuItem icon={Trash2} label="Удалить" danger onClick={() => { setOpenMenuKey(null); deletePosition(p.name) }} />
                            </RowMenu>
                          )}
                        </div>
                      </>
                    )}
                  </RowCard>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeDict === 'vacationTypes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatPill value={data.vacationTypes.length} label={pluralRu(data.vacationTypes.length, 'тип', 'типа', 'типов')} />
            <SearchBox value={search} onChange={setSearch} placeholder="Поиск по названию или коду…" />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <Input placeholder="Название" value={newVacationName} onChange={e => setNewVacationName(e.target.value)} className="h-9 min-w-[160px] flex-1 text-sm" />
            <Input placeholder="Код" value={newVacationCode} onChange={e => setNewVacationCode(e.target.value)} className="h-9 w-24 text-sm" />
            <Button size="sm" onClick={addVacationType} disabled={!newVacationName.trim() || !newVacationCode.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Добавить
            </Button>
          </div>

          {filteredVacationTypes.length === 0 ? (
            <EmptyState
              icon={Plane}
              title={data.vacationTypes.length === 0 ? 'Нет типов отпусков' : 'Ничего не найдено'}
              hint={data.vacationTypes.length === 0 ? 'Добавьте первый тип отпуска' : 'Измените запрос поиска'}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredVacationTypes.map((vt) => {
                const key = `vac-${vt.id}`
                return (
                  <RowCard key={vt.id}>
                    {editVacationId === vt.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input value={editVacationName} onChange={e => setEditVacationName(e.target.value)} className="h-9 text-sm" autoFocus />
                        <Input value={editVacationCode} onChange={e => setEditVacationCode(e.target.value)} className="h-9 w-20 text-sm" />
                        <Button size="sm" variant="outline" onClick={() => updateVacationType(vt.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditVacationId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <>
                        <IconChip icon={Plane} className="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-[14.5px] font-semibold">{vt.name}</h3>
                            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">{vt.code}</span>
                          </div>
                        </div>
                        <RowMenu open={openMenuKey === key} onToggle={() => setOpenMenuKey(openMenuKey === key ? null : key)} label={`Действия: ${vt.name}`}>
                          <MenuItem icon={Edit3} label="Редактировать" onClick={() => { setOpenMenuKey(null); setEditVacationId(vt.id); setEditVacationName(vt.name); setEditVacationCode(vt.code) }} />
                          <MenuItem icon={Trash2} label="Удалить" danger onClick={() => { setOpenMenuKey(null); deleteVacationType(vt.id) }} />
                        </RowMenu>
                      </>
                    )}
                  </RowCard>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeDict === 'skills' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatPill value={data.skills.length} label={pluralRu(data.skills.length, 'тег', 'тега', 'тегов')} />
            <SearchBox value={search} onChange={setSearch} placeholder="Поиск тега…" />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <Input placeholder="Новый тег" value={newSkill} onChange={e => setNewSkill(e.target.value)} className="h-9 min-w-[160px] flex-1 text-sm" onKeyDown={e => e.key === 'Enter' && addSkill()} />
            <Button size="sm" onClick={addSkill} disabled={!newSkill.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Добавить
            </Button>
          </div>

          {filteredSkills.length === 0 ? (
            <EmptyState
              icon={Tag}
              title={data.skills.length === 0 ? 'Нет тегов' : 'Ничего не найдено'}
              hint={data.skills.length === 0 ? 'Добавьте первый тег' : 'Измените запрос поиска'}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredSkills.map((s) => {
                const key = `skl-${s.id}`
                return (
                  <RowCard key={s.id}>
                    {editSkillId === s.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input value={editSkillName} onChange={e => setEditSkillName(e.target.value)} className="h-9 text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && updateSkill(s.id)} />
                        <Button size="sm" variant="outline" onClick={() => updateSkill(s.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditSkillId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <>
                        <IconChip icon={Tag} className="bg-violet-500/10 text-violet-600 dark:text-violet-400" />
                        <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{s.name}</h3>
                        <div className="flex shrink-0 items-center gap-2">
                          <button onClick={() => setAssigningTag({ id: s.id, name: s.name })} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Назначить работникам">
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                          <RowMenu open={openMenuKey === key} onToggle={() => setOpenMenuKey(openMenuKey === key ? null : key)} label={`Действия: ${s.name}`}>
                            <MenuItem icon={Edit3} label="Переименовать" onClick={() => { setOpenMenuKey(null); setEditSkillId(s.id); setEditSkillName(s.name) }} />
                            <MenuItem icon={Trash2} label="Удалить" danger onClick={() => { setOpenMenuKey(null); deleteSkill(s.id) }} />
                          </RowMenu>
                        </div>
                      </>
                    )}
                  </RowCard>
                )
              })}
            </div>
          )}
        </div>
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
    </div>
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
