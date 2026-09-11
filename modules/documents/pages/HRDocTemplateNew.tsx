import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, FileText, Upload, Paperclip, X, Search, Copy, Check, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Card } from '@/shared/components/ui/Card'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { PLACEHOLDERS_BY_PURPOSE, getAllGroups } from '@/shared/lib/docPlaceholders'

const PURPOSE_OPTIONS = [
  { value: '', label: 'Не указано' },
  { value: 'vacation_template', label: 'Шаблон отпуска' },
  { value: 'vacation_transfer_template', label: 'Шаблон переноса отпуска' },
]

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png'
const LIST_URL = '/hr?tab=doc-templates'

export function HRDocTemplateNew() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phSearch, setPhSearch] = useState('')
  const [copiedTag, setCopiedTag] = useState<string | null>(null)

  const groups = useMemo(
    () => (purpose ? PLACEHOLDERS_BY_PURPOSE[purpose] ?? getAllGroups() : getAllGroups()),
    [purpose],
  )
  const filteredGroups = useMemo(() => {
    const q = phSearch.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({ ...g, items: g.items.filter((p) => p.tag.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0)
  }, [groups, phSearch])

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag).then(() => {
      setCopiedTag(tag)
      setTimeout(() => setCopiedTag(null), 1500)
    })
  }

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      if (description.trim()) fd.append('description', description.trim())
      if (purpose.trim()) fd.append('purpose', purpose.trim())
      if (file) fd.append('file', file)
      const res = await fetch(`${API_BASE_URL}/dictionaries/doc-templates`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Ошибка')
      }
      toast.success('Шаблон создан')
      navigate(LIST_URL)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Link
          to={LIST_URL}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Шаблоны документов
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-sm">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Новый шаблон документа</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Файл-шаблон с плейсхолдерами для автогенерации документов
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5">
            <p className="mb-2 text-sm font-medium">
              Файл шаблона <span className="text-destructive">*</span>
            </p>
            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Paperclip className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} КБ</p>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) setFile(f)
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
                  dragging ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50 hover:bg-muted/30',
                )}
              >
                <Upload className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">Перетащите файл сюда или нажмите для выбора</p>
                <p className="text-xs text-muted-foreground/70">PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Card>

          <Card className="space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="tmpl-name">
                Название <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tmpl-name"
                autoFocus
                autoComplete="off"
                placeholder="Напр. Заявление на отпуск"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Назначение</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {PURPOSE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value || 'none'}
                    type="button"
                    onClick={() => setPurpose(opt.value)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                      purpose === opt.value
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/70">
                Назначение фильтрует список плейсхолдеров справа.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tmpl-desc">Описание</Label>
              <textarea
                id="tmpl-desc"
                rows={3}
                placeholder="Кратко о шаблоне"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate(LIST_URL)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!name.trim() || !file || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {saving ? 'Создание…' : 'Создать шаблон'}
            </Button>
          </div>
        </div>

        <Card className="self-start overflow-hidden p-0 lg:sticky lg:top-4">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-sm font-semibold">Плейсхолдеры DOCX</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Клик — скопировать тег в буфер</p>
          </div>
          <div className="border-b border-border/60 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={phSearch}
                onChange={(e) => setPhSearch(e.target.value)}
                placeholder="Фильтр по тегу или описанию…"
                className="w-full rounded-lg border border-input bg-background py-1.5 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Ничего не найдено</p>
            ) : (
              filteredGroups.map((g, gi) => (
                <div key={g.label}>
                  <div className={cn('bg-muted/40 px-3 py-1.5', gi > 0 && 'border-t border-border/40')}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  </div>
                  {g.items.map((ph, i) => (
                    <button
                      key={`${g.label}-${i}`}
                      type="button"
                      onClick={() => copyTag(ph.tag)}
                      className="flex w-full items-center gap-2 border-t border-border/10 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                    >
                      <code className="shrink-0 font-mono text-xs text-primary">{ph.tag}</code>
                      <span className="flex-1 truncate text-xs text-muted-foreground">{ph.desc}</span>
                      {copiedTag === ph.tag ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </Card>
      </form>
    </div>
  )
}
