import { useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import {
  Briefcase, Plane, Wrench, Plus, Trash2, Edit3, Check, X,
  AlertTriangle, Loader2, Users,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  employee: 'Сотрудник', manager: 'Руководитель', hr: 'HR-менеджер',
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

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
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
    } catch {} finally { setLoading(false) }
  }

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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!data) return null

  const tabInfo = activeDict === 'positions'
    ? { name: 'Должности', icon: Briefcase, color: 'from-blue-500 to-indigo-600', desc: 'Должности сотрудников (из профиля)' }
    : activeDict === 'vacationTypes'
    ? { name: 'Отпуск', icon: Plane, color: 'from-emerald-500 to-teal-600', desc: 'Типы отпусков' }
    : { name: 'Навыки', icon: Wrench, color: 'from-violet-500 to-purple-600', desc: 'Каталог навыков компании' }
  const ActiveIcon = tabInfo.icon

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-xl bg-gradient-to-br text-white', tabInfo.color)}>
              <ActiveIcon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{tabInfo.name}</CardTitle>
              <CardDescription>{tabInfo.desc}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeDict === 'positions' && (
            <div className="space-y-0.5">
              {data.positions.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <Briefcase className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Нет должностей</p>
                </div>
              )}
              {data.positions.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group">
                  {editPositionName === p.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-muted-foreground/50 font-mono w-6">{i + 1}.</span>
                      <Input value={editPositionNewName} onChange={e => setEditPositionNewName(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && renamePosition(p.name)} />
                      <Button size="sm" variant="outline" onClick={() => renamePosition(p.name)}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditPositionName(null)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground/50 font-mono w-6">{i + 1}.</span>
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px]">{p.count} чел.</Badge>
                        <button onClick={() => setShowPositionUsers(p.name)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Сотрудники">
                          <Users className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditPositionName(p.name); setEditPositionNewName(p.name) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deletePosition(p.name)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeDict === 'vacationTypes' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input placeholder="Название" value={newVacationName} onChange={e => setNewVacationName(e.target.value)} className="h-9 text-sm" />
                <Input placeholder="Код" value={newVacationCode} onChange={e => setNewVacationCode(e.target.value)} className="h-9 text-sm w-24" />
                <Button size="sm" onClick={addVacationType} disabled={!newVacationName.trim() || !newVacationCode.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Добавить
                </Button>
              </div>
              <div className="space-y-0.5">
                {data.vacationTypes.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <Plane className="h-8 w-8 opacity-20" />
                    <p className="text-sm">Нет типов отпусков</p>
                  </div>
                )}
                {data.vacationTypes.map((vt) => (
                  <div key={vt.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group">
                    {editVacationId === vt.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input value={editVacationName} onChange={e => setEditVacationName(e.target.value)} className="h-8 text-sm" autoFocus />
                        <Input value={editVacationCode} onChange={e => setEditVacationCode(e.target.value)} className="h-8 text-sm w-20" />
                        <Button size="sm" variant="outline" onClick={() => updateVacationType(vt.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditVacationId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{vt.code}</span>
                          <span className="text-sm font-medium">{vt.name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditVacationId(vt.id); setEditVacationName(vt.name); setEditVacationCode(vt.code) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteVacationType(vt.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeDict === 'skills' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input placeholder="Новый навык" value={newSkill} onChange={e => setNewSkill(e.target.value)} className="h-9 text-sm" onKeyDown={e => e.key === 'Enter' && addSkill()} />
                <Button size="sm" onClick={addSkill} disabled={!newSkill.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Добавить
                </Button>
              </div>
              <div className="space-y-0.5">
                {data.skills.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <Wrench className="h-8 w-8 opacity-20" />
                    <p className="text-sm">Нет навыков</p>
                  </div>
                )}
                {data.skills.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group">
                    {editSkillId === s.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input value={editSkillName} onChange={e => setEditSkillName(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && updateSkill(s.id)} />
                        <Button size="sm" variant="outline" onClick={() => updateSkill(s.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditSkillId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-medium">{s.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditSkillId(s.id); setEditSkillName(s.name) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteSkill(s.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showPositionUsers && (
        <PositionUsersModal position={showPositionUsers} isAdmin={isAdmin} onClose={() => setShowPositionUsers(null)} />
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col border border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2"><Briefcase className="h-5 w-5 text-muted-foreground" /> {position}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Сотрудники на этой должности</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Users className="h-10 w-10 opacity-20" />
              <p className="text-sm">Нет сотрудников на этой должности</p>
            </div>
          ) : (
            <div className="space-y-1">
              {users.map(u => {
                const fullName = `${u.last_name} ${u.first_name}${u.middle_name ? ' ' + u.middle_name : ''}`
                return (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {u.first_name?.[0]}{u.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{fullName}</span>
                        <Badge className={cn('text-[10px]', STATUS_COLORS[u.status])}>{STATUS_LABELS[u.status]}</Badge>
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
