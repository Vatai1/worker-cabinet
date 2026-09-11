import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Download, Loader2, Plane, Calendar, FileText, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { cn, getErrorMessage } from '@/shared/lib/utils'
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
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Template[]) => {
        const filtered = data.filter((t) => t.purpose === 'vacation_template')
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
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Link
          to="/vacation"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Отпуск
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-sm">
            <Plane className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Заявление на отпуск</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Документ по шаблону из справочника — с вашими отпусками за выбранный год
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      <Card className="overflow-hidden p-0">
        <section className="border-b border-border/60 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Год</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={cn(
                  'min-w-[68px] rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
                  year === y
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/50',
                )}
              >
                {y}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            В документ попадут все отпуска за {year} год
          </p>
        </section>

        <section className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Шаблон документа</h2>
          </div>

          {templatesLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка шаблонов…
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              Нет шаблонов с назначением «Шаблон отпуска». Добавьте шаблон в справочнике документов.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => {
                const active = templateId === String(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(String(t.id))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        active ? 'border-primary' : 'border-muted-foreground/40',
                      )}
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <FileText className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="truncate text-sm font-medium">{t.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => navigate('/vacation')}>
          Отмена
        </Button>
        <Button onClick={handleGenerate} disabled={!templateId || loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {loading ? 'Формирование…' : 'Скачать .docx'}
        </Button>
      </div>
    </div>
  )
}
