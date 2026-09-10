import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { Label } from '@/shared/components/ui/Label'
import { Card } from '@/shared/components/ui/Card'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'

interface Template {
  id: number
  name: string
  purpose: string
}

export function VacationApplicationPage() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
  }, [])

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
      toast.success('Заявление сформировано')
      navigate('/vacation')
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Link
          to="/vacation"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Отпуск
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Заявление на отпуск</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Генерация документа по шаблону из справочника
          </p>
        </div>
      </div>

      <Card className="max-w-lg p-6">
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
          <Button type="button" variant="outline" onClick={() => navigate('/vacation')}>
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
      </Card>
    </div>
  )
}
