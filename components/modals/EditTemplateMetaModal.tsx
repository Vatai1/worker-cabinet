import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { templateApi } from '@/services/templateApi'
import { getErrorMessage } from '@/lib/utils'
import type { DocumentTemplate } from '@/types'

const CATEGORIES = [
  { value: 'hr', label: 'HR' },
  { value: 'legal', label: 'Юридические' },
  { value: 'finance', label: 'Финансы' },
  { value: 'general', label: 'Общие' },
]

interface Props {
  open: boolean
  onClose: () => void
  template: DocumentTemplate | null
  onSaved: () => void
}

export function EditTemplateMetaModal({ open, onClose, template, onSaved }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('hr')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (template) {
      setName(template.name)
      setDescription(template.description ?? '')
      setCategory(template.category)
    }
  }, [template])

  if (!open || !template) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Введите название')
    setLoading(true)
    setError(null)
    try {
      await templateApi.update(template.id, { name: name.trim(), description: description.trim(), category })
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Редактировать шаблон</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Название *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Описание</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Категория *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
