import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { UserPlus, X, Search, Check } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch {}
  }
  return headers
}

interface User {
  id: string
  first_name: string
  last_name: string
  position: string
  department_name?: string
}

interface Props {
  projectId: string
  existingMemberIds: string[]
  open: boolean
  onClose: () => void
  onAdded: () => void
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
]
function avatarColor(id: string) {
  const n = parseInt(id, 10) || 0
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

export function AddMemberModal({ projectId, existingMemberIds, open, onClose, onAdded }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [role, setRole] = useState<'member' | 'lead'>('member')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const load = async () => {
      try {
        const params = new URLSearchParams()
        if (existingMemberIds.length > 0) {
          existingMemberIds.forEach(id => params.append('exclude[]', id))
        }
        const res = await fetch(`${API_BASE_URL}/users/search?${params}`, { headers: getAuthHeaders() })
        if (res.ok) setUsers(await res.json())
      } catch {}
    }
    load()
  }, [open])

  const filtered = users.filter((u) => {
    if (existingMemberIds.includes(String(u.id))) return false
    const q = search.toLowerCase()
    return (
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q) ||
      u.position?.toLowerCase().includes(q)
    )
  })

  const handleAdd = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await fetch(`${API_BASE_URL}/projects/${projectId}/members`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: selectedId, role }),
      })
      onAdded()
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setSearch('')
    setSelectedId(null)
    setRole('member')
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
              <UserPlus className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Добавить участника</h2>
          </div>
        </div>

        <div className="p-4 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Поиск сотрудника…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {search ? 'Никого не найдено' : 'Все сотрудники уже добавлены'}
            </p>
          ) : (
            filtered.map((u) => {
              const color = avatarColor(u.id)
              const selected = selectedId === String(u.id)
              return (
                <button
                  key={u.id}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    selected
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedId(String(u.id))}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className={`bg-gradient-to-br ${color} text-white text-xs font-bold`}>
                      {u.first_name?.[0]}{u.last_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{u.last_name} {u.first_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.position}</div>
                  </div>
                  {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              )
            })
          )}
        </div>

        {selectedId && (
          <div className="p-4 border-t border-border/50">
            <div className="flex gap-1 p-1 rounded-xl bg-muted/60 mb-4">
              {(['member', 'lead'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    role === r
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r === 'lead' ? 'Руководитель' : 'Участник'}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
              <Button className="flex-1" onClick={handleAdd} disabled={saving}>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Добавление…
                  </span>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Добавить
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {!selectedId && (
          <div className="p-4 border-t border-border/50 flex justify-end">
            <Button variant="outline" onClick={handleClose}>
              <X className="h-4 w-4 mr-2" />
              Закрыть
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
