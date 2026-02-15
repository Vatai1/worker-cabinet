import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'
import { Pencil, X, Check } from 'lucide-react'

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

interface ProjectBase {
  id: string
  name: string
  full_name?: string
  description?: string
  status: 'active' | 'completed' | 'paused'
  start_date?: string
  end_date?: string
}

interface Props {
  project: ProjectBase
  open: boolean
  onClose: () => void
  onUpdated: (project: any) => void
}

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Активный' },
  { value: 'paused',    label: 'На паузе' },
  { value: 'completed', label: 'Завершён' },
]

export function EditProjectModal({ project, open, onClose, onUpdated }: Props) {
  const [isOngoing, setIsOngoing] = useState(!project.end_date)
  const [form, setForm] = useState({
    name:        project.name,
    fullName:    project.full_name ?? '',
    description: project.description ?? '',
    status:      project.status,
    startDate:   project.start_date?.split('T')[0] ?? '',
    endDate:     project.end_date?.split('T')[0]   ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleIsOngoingChange = (checked: boolean) => {
    setIsOngoing(checked)
    if (checked) {
      setForm({ ...form, endDate: '' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${project.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name:        form.name.trim(),
          fullName:    form.fullName.trim() || null,
          description: form.description.trim() || null,
          status:      form.status,
          startDate:   form.startDate || null,
          endDate:     isOngoing ? null : (form.endDate || null),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка при сохранении')
      }
      onUpdated(await res.json())
      onClose()
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
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
              <Pencil className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Редактировать проект</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Полное название</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Описание</Label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Статус</Label>
              <select
                className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Дата начала</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Дата окончания</Label>
                  <Switch
                    checked={isOngoing}
                    onCheckedChange={handleIsOngoingChange}
                  />
                  <span className="text-sm text-muted-foreground">По настоящее время</span>
                </div>
                <Input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  disabled={isOngoing}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
              <Button type="submit" disabled={!form.name.trim() || saving}>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Сохранение…
                  </span>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Сохранить
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
