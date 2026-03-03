import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Upload, X, FileText, Plus, Check } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = {}
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch {}
  }
  return headers
}

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  onUploaded: () => void
}

export function UploadDocumentModal({ projectId, open, onClose, onUploaded }: Props) {
  const [name, setName] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      if (!name) {
        setName(e.target.files[0].name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !name.trim()) return

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name.trim())
      formData.append('tags', JSON.stringify(tags))
      formData.append('description', description.trim())

      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/documents`, {
        method: 'POST',
        headers: { Authorization: getAuthHeaders()['Authorization']! },
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка при загрузке документа')
      }
      onUploaded()
      handleClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setTags([])
    setTagInput('')
    setDescription('')
    setFile(null)
    setError(null)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Загрузить документ</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Файл *</Label>
              <div className="relative">
                <Input
                  type="file"
                  id="document-file"
                  className="sr-only"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.7z,.jpg,.jpeg,.png"
                />
                <label
                  htmlFor="document-file"
                  className="flex flex-col items-center justify-center w-full h-32 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors cursor-pointer bg-muted/30"
                >
                  {file ? (
                    <div className="flex items-center gap-2">
                      <FileText className="h-6 w-6 text-primary" />
                      <div className="text-left">
                        <div className="text-sm font-medium truncate max-w-[200px]">{file.name}</div>
                        <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} КБ</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground/60" />
                      <div className="text-sm text-muted-foreground text-center">
                        <span className="font-medium">Нажмите для выбора файла</span>
                        <span className="block text-xs mt-1">PDF, DOC, XLS, TXT, ZIP, изображения</span>
                      </div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Название документа *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Введите название документа"
              />
            </div>

            <div className="space-y-2">
              <Label>Основные теги</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Введите тег"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddTag}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Описание документа</Label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Краткое описание документа"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
              <Button type="submit" disabled={!file || !name.trim() || uploading}>
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Загрузка…
                  </span>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Загрузить
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
