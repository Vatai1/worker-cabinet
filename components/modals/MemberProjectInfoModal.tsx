import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { User, X, Calendar, Shield, Save } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

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

interface Member {
  id: string
  first_name: string
  last_name: string
  position: string
  department_name?: string
  role: 'lead' | 'member'
  joined_at?: string
  description?: string
}

interface Props {
  member: Member
  projectId: string
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

const ROLE_LABELS: Record<string, string> = {
  lead: 'Руководитель',
  member: 'Участник',
}

const ROLE_COLORS: Record<string, string> = {
  lead: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
  member: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
}

export function MemberProjectInfoModal({ member, projectId, open, onClose, onUpdated }: Props) {
  const [description, setDescription] = useState(member.description || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  const handleSaveDescription = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/members/${member.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ description: description.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка при сохранении')
      }
      member.description = description.trim() || undefined
      onUpdated()
      setEditing(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl gradient-primary">
              <User className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold">{member.last_name} {member.first_name}</h2>
              <p className="text-sm text-muted-foreground truncate">{member.position}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Роль в проекте</div>
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[member.role]} mt-1`}>
                  {ROLE_LABELS[member.role]}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Дата вступления в проект</div>
                <div className="font-medium text-sm mt-1">{formatDate(member.joined_at)}</div>
              </div>
            </div>

            {member.department_name && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Отдел</div>
                  <div className="font-medium text-sm mt-1">{member.department_name}</div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Описание участия в проекте</Label>
                {editing ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                      Отмена
                    </Button>
                    <Button size="sm" onClick={handleSaveDescription} disabled={saving}>
                      {saving ? (
                        <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Save className="h-3 w-3 mr-1" />
                          Сохранить
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    Изменить
                  </Button>
                )}
              </div>
              {editing ? (
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Опишите роль сотрудника в проекте..."
                />
              ) : (
                <div className="p-4 rounded-xl border border-border/60 bg-card min-h-[100px]">
                  {description ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground/50 italic">Описание не добавлено</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Закрыть
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
