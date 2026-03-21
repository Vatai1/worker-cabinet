import { useState, useRef } from 'react'
import { X, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { templateApi } from '@/services/templateApi'
import { getErrorMessage } from '@/lib/utils'

const CATEGORIES = [
  { value: 'hr', label: 'HR' },
  { value: 'legal', label: 'Юридические' },
  { value: 'finance', label: 'Финансы' },
  { value: 'general', label: 'Общие' },
]

interface Props {
  open: boolean
  onClose: () => void
  onUploaded: () => void
}

export function UploadTemplateModal({ open, onClose, onUploaded }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('hr')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.size > 20 * 1024 * 1024) {
      setError('Файл не должен превышать 20 МБ')
      return
    }
    setFile(f)
    setError(null)
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return setError('Выберите файл')
    if (!name.trim()) return setError('Введите название')
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name.trim())
      formData.append('description', description.trim())
      formData.append('category', category)
      await templateApi.upload(formData)
      onUploaded()
      onClose()
      setName(''); setDescription(''); setFile(null)
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
          <h2 className="text-lg font-semibold">Загрузить шаблон</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Нажмите для выбора .docx или .pdf (макс. 20 МБ)</p>
            )}
            <input ref={fileRef} type="file" accept=".docx,.pdf" className="hidden" onChange={handleFileChange} />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Название *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Трудовой договор" />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Описание</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно" />
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
              {loading ? 'Загрузка...' : 'Загрузить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
