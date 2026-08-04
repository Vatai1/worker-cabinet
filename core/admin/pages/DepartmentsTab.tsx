import { useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import {
  Building2, Users, Plus, Trash2, Edit3, Check, X,
  AlertTriangle, Loader2, Search,
} from 'lucide-react'

const DEPT_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-pink-500 to-rose-600',
  'from-violet-500 to-purple-600',
  'from-cyan-500 to-blue-600',
  'from-red-500 to-rose-600',
  'from-sky-500 to-cyan-600',
]

export function DepartmentsTab() {
  const [departments, setDepartments] = useState<{ id: number; name: string; manager_id: number | null; manager_name: string | null; manager_position: string | null; employee_count: string; vacation_requests_blocked: boolean; description: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchDepartments() }, [])

  const fetchDepartments = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      if (res.ok) setDepartments(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newManagerId, setNewManagerId] = useState<number | null>(null)
  const [newManagerName, setNewManagerName] = useState('')
  const [showPicker, setShowPicker] = useState<'create' | number | null>(null)
  const [editName, setEditName] = useState('')
  const [editManagerId, setEditManagerId] = useState<number | null>(null)
  const [editManagerName, setEditManagerName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const createDept = async () => {
    if (!newName.trim()) { setError('Название обязательно'); return }
    const confirmed = await confirmDialog({ title: 'Создать отдел', message: `Создать отдел «${newName.trim()}»?`, confirmText: 'Создать' })
    if (!confirmed) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/departments`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newName.trim(), manager_id: newManagerId }),
      })
      if (res.ok) { setShowCreate(false); setNewName(''); setNewManagerId(null); setNewManagerName(''); fetchDepartments() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const updateDept = async (id: number) => {
    const confirmed = await confirmDialog({ title: 'Сохранить изменения', message: `Сохранить изменения для отдела «${editName.trim()}»?`, confirmText: 'Сохранить' })
    if (!confirmed) return
    try {
      const body: Record<string, unknown> = { name: editName.trim() }
      if (editManagerId) body.manager_id = editManagerId
      else body.manager_id = null
      const res = await fetchWithRetry(`${API_BASE_URL}/dictionaries/departments/${id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (res.ok) { setEditingId(null); fetchDepartments() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deleteDept = async (id: number, name: string) => {
    const confirmed = await confirmDialog({ title: 'Удалить отдел', message: `Удалить отдел «${name}»? Сотрудники будут отвязаны от отдела.`, confirmText: 'Удалить', variant: 'danger' })
    if (!confirmed) return
    try {
      await fetchWithRetry(`${API_BASE_URL}/dictionaries/departments/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      fetchDepartments()
    } catch {}
  }

  const startEdit = (dept: typeof departments[0]) => {
    setEditingId(dept.id)
    setEditName(dept.name)
    setEditManagerId(dept.manager_id)
    setEditManagerName(dept.manager_name || '')
  }

  const pickUser = (userId: number, userName: string) => {
    if (showPicker === 'create') {
      setNewManagerId(userId)
      setNewManagerName(userName)
    } else if (typeof showPicker === 'number') {
      setEditManagerId(userId)
      setEditManagerName(userName)
    }
    setShowPicker(null)
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const filteredDepartments = search.trim()
    ? departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || (d.manager_name || '').toLowerCase().includes(search.toLowerCase()))
    : departments

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Поиск отдела..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{filteredDepartments.length} из {departments.length}</span>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Новый отдел</Button>
        </div>
      </div>

      {showCreate && (
        <Card className="border-dashed border-primary/40">
          <CardContent className="pt-5 space-y-3">
            <Input placeholder="Название отдела" value={newName} onChange={e => setNewName(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">Руководитель:</span>
              <button
                onClick={() => setShowPicker('create')}
                className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background text-sm hover:bg-muted/30 transition-colors"
              >
                <span className={newManagerName ? 'text-foreground' : 'text-muted-foreground'}>
                  {newManagerName || 'Выбрать руководителя...'}
                </span>
                {newManagerId && (
                  <button onClick={e => { e.stopPropagation(); setNewManagerId(null); setNewManagerName('') }} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </button>
            </div>
            <div className="flex gap-2">
              <Button onClick={createDept} disabled={!newName.trim()}>Создать</Button>
              <Button variant="outline" onClick={() => { setShowCreate(false); setNewName(''); setNewManagerId(null); setNewManagerName('') }}>Отмена</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filteredDepartments.map((dept) => {
          const gradient = DEPT_GRADIENTS[dept.id % DEPT_GRADIENTS.length]
          return (
          <Card key={dept.id} className="group relative overflow-hidden">
            <CardContent className="pt-5">
              {editingId === dept.id ? (
                <div className="space-y-3">
                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Название" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">Рук.:</span>
                    <button
                      onClick={() => setShowPicker(dept.id)}
                      className="flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm hover:bg-muted/30 transition-colors"
                    >
                      <span className={editManagerName ? 'text-foreground' : 'text-muted-foreground'}>
                        {editManagerName || 'Выбрать...'}
                      </span>
                      {editManagerId && (
                        <button onClick={e => { e.stopPropagation(); setEditManagerId(null); setEditManagerName('') }} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateDept(dept.id)}><Check className="h-3.5 w-3.5 mr-1" />Сохранить</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Отмена</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className={cn('p-3 rounded-2xl bg-gradient-to-br text-white shrink-0 shadow-md', gradient)}>
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-base">{dept.name}</h3>
                    {dept.manager_name ? (
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium text-foreground/80">{dept.manager_name}</span>
                        {dept.manager_position && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="truncate">{dept.manager_position}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        Без руководителя
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge className="text-[11px] bg-primary/10 text-primary">{dept.employee_count} чел.</Badge>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(dept)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteDept(dept.id, dept.name)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          )
        })}
      </div>

      {departments.length === 0 && !showCreate && (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <Building2 className="h-10 w-10 opacity-20" />
          <p className="text-sm">Нет отделов</p>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5 mr-1" />Создать первый</Button>
        </div>
      )}

      {showPicker !== null && (
        <UserPickerModal
          onSelect={pickUser}
          onClose={() => setShowPicker(null)}
        />
      )}
    </div>
  )
}

function UserPickerModal({ onSelect, onClose }: { onSelect: (id: number, name: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<{ id: number; first_name: string; last_name: string; email: string; position: string | null }[]>([])
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
    return `${u.last_name} ${u.first_name} ${u.email} ${u.position || ''}`.toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col border border-border" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Выбор сотрудника</h3>
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
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search ? 'Ничего не найдено' : 'Нет сотрудников'}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(u => {
                const fullName = `${u.last_name} ${u.first_name}`
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
