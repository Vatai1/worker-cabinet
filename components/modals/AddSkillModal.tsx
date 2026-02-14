import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { X, Plus } from 'lucide-react'

interface AddSkillModalProps {
  open: boolean
  onClose: () => void
  onAdd: (skill: string) => void
}

export function AddSkillModal({ open, onClose, onAdd }: AddSkillModalProps) {
  const [skill, setSkill] = useState('')

  useEffect(() => {
    if (!open) {
      setSkill('')
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (skill.trim()) {
      onAdd(skill.trim())
      setSkill('')
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Plus className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Добавить навык</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Введите название нового навыка для сотрудника
          </p>

          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <Label htmlFor="skill">Название навыка</Label>
                <Input
                  id="skill"
                  placeholder="Например: JavaScript, Управление проектами..."
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
              <Button type="submit" disabled={!skill.trim()}>
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
