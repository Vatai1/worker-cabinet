import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'
import { X, Plus } from 'lucide-react'

interface Project {
  id: string
  name: string
  role: string
  status: 'active' | 'completed' | 'paused'
  startDate?: string
  endDate?: string
  description?: string
}

interface AddProjectModalProps {
  open: boolean
  onClose: () => void
  onAdd: (project: Omit<Project, 'id'>) => void
}

export function AddProjectModal({ open, onClose, onAdd }: AddProjectModalProps) {
  const [isOngoing, setIsOngoing] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    status: 'active' as Project['status'],
    startDate: '',
    endDate: '',
    description: '',
  })

  const handleIsOngoingChange = (checked: boolean) => {
    setIsOngoing(checked)
    if (checked) {
      setFormData({ ...formData, endDate: '' })
    }
  }

  useEffect(() => {
    if (!open) {
      setIsOngoing(false)
      setFormData({
        name: '',
        role: '',
        status: 'active',
        startDate: '',
        endDate: '',
        description: '',
      })
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.name.trim() && formData.role.trim()) {
      onAdd({
        name: formData.name.trim(),
        role: formData.role.trim(),
        status: formData.status,
        startDate: formData.startDate || undefined,
        endDate: isOngoing ? undefined : (formData.endDate || undefined),
        description: formData.description.trim() || undefined,
      })
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  const statusOptions = [
    { value: 'active', label: 'Активный' },
    { value: 'completed', label: 'Завершён' },
    { value: 'paused', label: 'На паузе' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Plus className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Добавить проект</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Заполните информацию о проекте сотрудника
          </p>

          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <Label htmlFor="name">Название проекта *</Label>
                <Input
                  id="name"
                  placeholder="Название проекта"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  autoFocus
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Роль в проекте *</Label>
                <Input
                  id="role"
                  placeholder="Разработчик, Менеджер, Аналитик..."
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Статус проекта</Label>
                <select
                  id="status"
                  className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                >
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Дата начала</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="endDate">Дата окончания</Label>
                    <Switch
                      checked={isOngoing}
                      onCheckedChange={handleIsOngoingChange}
                    />
                    <span className="text-sm text-muted-foreground">По настоящее время</span>
                  </div>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    min={formData.startDate}
                    disabled={isOngoing}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Input
                  id="description"
                  placeholder="Краткое описание проекта"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
              <Button type="submit" disabled={!formData.name.trim() || !formData.role.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
