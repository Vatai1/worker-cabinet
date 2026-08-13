import { useState, useEffect } from 'react'
import { FileText, X, Download, Loader2, UserCheck } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Label } from '@/shared/components/ui/Label'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useModulesStore } from '@/shared/store/modulesStore'

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
  const user = useAuthStore(s => s.user)
  const isSubstitutionEnabled = useModulesStore(s => s.isModuleEnabled('substitution'))
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(defaultYear ?? currentYear)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [substituteIds, setSubstituteIds] = useState<number[]>([])
  const [employees, setEmployees] = useState<Array<{ id: number; first_name: string; last_name: string; position: string }>>([])
  const [empSearch, setEmpSearch] = useState('')

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
    if (isSubstitutionEnabled) {
      fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : [])
        .then((data) => {
          const list = (Array.isArray(data) ? data : data.users || [])
            .filter((u: any) => u.id !== user?.id)
            .map((u: any) => ({ id: u.id, first_name: u.first_name, last_name: u.last_name, position: u.position || '' }))
          setEmployees(list)
        })
        .catch(() => {})
    }
  }, [open])

  const handleGenerate = async () => {
    if (!templateId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/vacation/generate-application`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ year, templateId: Number(templateId), substitute_ids: isSubstitutionEnabled && substituteIds.length > 0 ? substituteIds : undefined }),
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

            {isSubstitutionEnabled && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" />
                  Замещающие (необязательно)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Выберите сотрудников, которые будут замещать вас на время отпуска
                </p>
                <input
                  type="text"
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  placeholder="Поиск сотрудника..."
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="max-h-32 overflow-y-auto border border-input rounded-lg">
                  {employees
                    .filter((e) => {
                      const q = empSearch.toLowerCase()
                      return !q || `${e.last_name} ${e.first_name} ${e.position}`.toLowerCase().includes(q)
                    })
                    .map((e) => (
                      <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={substituteIds.includes(e.id)}
                          onChange={() => {
                            setSubstituteIds(prev => prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id])
                          }}
                          className="rounded"
                        />
                        <span>{e.last_name} {e.first_name}</span>
                        {e.position && <span className="text-muted-foreground text-xs">— {e.position}</span>}
                      </label>
                    ))}
                </div>
                {substituteIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {substituteIds.map(id => {
                      const emp = employees.find(e => e.id === id)
                      if (!emp) return null
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs">
                          {emp.last_name} {emp.first_name}
                          <button type="button" onClick={() => setSubstituteIds(prev => prev.filter(x => x !== id))}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
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
