import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'
import { FolderKanban, X, Plus } from 'lucide-react'
import type { Project } from '@/pages/Projects'

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

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (project: Project) => void
}

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Активный' },
  { value: 'paused',    label: 'На паузе' },
  { value: 'completed', label: 'Завершён' },
]

export function CreateProjectModal({ open, onClose, onCreated }: Props) {
  const [isOngoing, setIsOngoing] = useState(false)
  const [form, setForm] = useState({
    name: '',
    fullName: '',
    description: '',
    status: 'active',
    startDate: '',
    endDate: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleIsOngoingChange = (checked: boolean) => {
    setIsOngoing(checked)
    if (checked) {
      setForm({ ...form, endDate: '' })
    }
  }

  const reset = () => {
    setIsOngoing(false)
    setForm({ name: '', fullName: '', description: '', status: 'active', startDate: '', endDate: '' })
    setError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name:        form.name.trim(),
          fullName:    form.fullName.trim() || undefined,
          description: form.description.trim() || undefined,
          status:      form.status,
          startDate:   form.startDate || undefined,
          endDate:     isOngoing ? undefined : (form.endDate || undefined),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка при создании проекта')
      }
      const project = await res.json()
      onCreated(project)
      handleClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl gradient-primary">
              <FolderKanban className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold">Новый проект</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 ml-12">
            Создайте проект — вы автоматически станете его руководителем
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cp-name">Название *</Label>
              <Input
                id="cp-name"
                placeholder="Название проекта"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cp-fullname">Полное название</Label>
              <Input
                id="cp-fullname"
                placeholder="Полное название проекта"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cp-desc">Описание</Label>
              <textarea
                id="cp-desc"
                rows={3}
                placeholder="Краткое описание проекта"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cp-status">Статус</Label>
              <select
                id="cp-status"
                className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cp-start">Дата начала</Label>
                <Input
                  id="cp-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="cp-end">Дата окончания</Label>
                  <Switch
                    checked={isOngoing}
                    onCheckedChange={handleIsOngoingChange}
                  />
                  <span className="text-sm text-muted-foreground">По настоящее время</span>
                </div>
                <Input
                  id="cp-end"
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  disabled={isOngoing}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
              <Button type="submit" disabled={!form.name.trim() || saving}>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Создание…
                  </span>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Создать проект
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
