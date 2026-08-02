import { useState, useEffect } from 'react'
import { FileText, X, Download, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Label } from '@/shared/components/ui/Label'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'

interface Template {
  id: number
  name: string
  purpose: string
}

interface Props {
  open: boolean
  onClose: () => void
  defaultYear?: number
}

export function VacationApplicationModal({ open, onClose, defaultYear }: Props) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(defaultYear ?? currentYear)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTemplatesLoading(true)
    fetch(`${API_BASE_URL}/dictionaries/doc-templates`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Template[]) => {
        const filtered = data.filter(t => t.purpose === 'vacation_template')
        setTemplates(filtered)
        if (filtered.length === 1) setTemplateId(String(filtered[0].id))
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false))
  }, [open])

  const handleGenerate = async () => {
    if (!templateId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/vacation/generate-application`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ year, templateId: Number(templateId) }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка генерации')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Заявление_${year}.docx`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-lg mx-4 animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold">Заявление на отпуск</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 ml-12">
            Генерация документа по шаблону из справочника
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Год</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                В документ попадут все отпуска за {year} год
              </p>
            </div>

            <div className="space-y-2">
              <Label>Шаблон документа</Label>
              {templatesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Загрузка шаблонов...
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                  Нет шаблонов с назначением «Шаблон отпуска». Добавьте шаблон в справочнике документов.
                </div>
              ) : (
                <select
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={templateId}
                  onChange={e => setTemplateId(e.target.value)}
                >
                  <option value="">Выберите шаблон</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Отмена
            </Button>
            <Button onClick={handleGenerate} disabled={!templateId || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Генерация...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Скачать
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
