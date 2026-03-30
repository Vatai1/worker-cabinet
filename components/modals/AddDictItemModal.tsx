import { useState, useEffect, useRef } from 'react'
import { Building2, Wrench, Palmtree, FileText, Plus, X, Upload, Paperclip, Copy, Check as CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { PLACEHOLDERS_BY_PURPOSE, getAllPlaceholders } from '@/lib/docPlaceholders'

type DictTab = 'departments' | 'skills' | 'vacation-types' | 'doc-templates'

interface Manager {
  id: number
  first_name: string
  last_name: string
  middle_name?: string
  position?: string
}

interface EditItem {
  id?: number
  name: string
  code?: string
  description?: string
  purpose?: string
  manager_id?: number | null
}

interface Props {
  open: boolean
  onClose: () => void
  onAdded: () => void
  tab: DictTab
  editItem?: EditItem | null
}

const TAB_CONFIG: Record<DictTab, { label: string; icon: typeof Building2; showCode: boolean }> = {
  departments: { label: 'отдел', icon: Building2, showCode: false },
  skills: { label: 'навык', icon: Wrench, showCode: false },
  'vacation-types': { label: 'тип отпуска', icon: Palmtree, showCode: true },
  'doc-templates': { label: 'шаблон документа', icon: FileText, showCode: false },
}

const PURPOSE_OPTIONS = [
  { value: 'vacation_template', label: 'Шаблон отпуска' },
  { value: 'vacation_transfer_template', label: 'Шаблон переноса отпуска' },
]


function PlaceholdersSection({ purpose, show, onToggle, copiedTag, onCopy }: {
  purpose: string
  show: boolean
  onToggle: () => void
  copiedTag: string | null
  onCopy: (tag: string) => void
}) {
  const list = PLACEHOLDERS_BY_PURPOSE[purpose] ?? getAllPlaceholders()

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>Плейсхолдеры DOCX</Label>
        <button type="button" onClick={onToggle} className="text-xs text-primary hover:underline">
          {show ? 'Скрыть' : 'Показать'}
        </button>
      </div>
      {show && (
        <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/40 bg-muted/40">
            <p className="text-xs text-muted-foreground">
              Нажмите на плейсхолдер, чтобы скопировать
              {!purpose && <span className="ml-1 opacity-70">· выберите назначение для фильтрации</span>}
            </p>
          </div>
          <div className="divide-y divide-border/20 max-h-52 overflow-y-auto">
            {list.map(p => (
              <button
                key={p.tag}
                type="button"
                onClick={() => onCopy(p.tag)}
                className="flex items-center gap-3 w-full px-3 py-1.5 hover:bg-muted/40 transition-colors text-left"
              >
                <code className="text-xs font-mono text-primary shrink-0">{p.tag}</code>
                <span className="text-xs text-muted-foreground flex-1">{p.desc}</span>
                {copiedTag === p.tag
                  ? <CheckIcon className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <Copy className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                }
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AddDictItemModal({ open, onClose, onAdded, tab, editItem }: Props) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [managerId, setManagerId] = useState('')
  const [managers, setManagers] = useState<Manager[]>([])
  const [purpose, setPurpose] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPlaceholders, setShowPlaceholders] = useState(true)
  const [copiedTag, setCopiedTag] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCopy = (tag: string) => {
    navigator.clipboard.writeText(tag).then(() => {
      setCopiedTag(tag)
      setTimeout(() => setCopiedTag(null), 1500)
    })
  }

  const config = TAB_CONFIG[tab]
  const Icon = config.icon
  const isDepartment = tab === 'departments'
  const isDocTemplate = tab === 'doc-templates'
  const isEdit = !!editItem

  useEffect(() => {
    if (open && isDepartment) {
      fetch(`${API_BASE_URL}/dictionaries/managers`, { headers: getAuthHeaders() })
        .then(res => res.ok ? res.json() : [])
        .then(data => setManagers(data))
        .catch(() => setManagers([]))
    }
  }, [open, isDepartment])

  useEffect(() => {
    if (open && editItem) {
      setName(editItem.name)
      setCode(editItem.code || '')
      setDescription(editItem.description || '')
      setPurpose(editItem.purpose || '')
      setManagerId(editItem.manager_id ? String(editItem.manager_id) : '')
    }
  }, [open, editItem])

  const reset = () => {
    setName('')
    setCode('')
    setDescription('')
    setManagerId('')
    setPurpose('')
    setFile(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (config.showCode && !code.trim()) {
      setError('Код обязателен')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { name: name.trim() }
      if (config.showCode) body.code = code.trim()
      if (isDepartment) {
        body.manager_id = managerId ? Number(managerId) : null
        body.description = description.trim() || null
      }
      if (isDocTemplate) {
        body.description = description.trim() || null
        body.purpose = purpose.trim() || null
      }

      const url = isEdit
        ? `${API_BASE_URL}/dictionaries/${tab}/${editItem!.id}`
        : `${API_BASE_URL}/dictionaries/${tab}`
      const method = isEdit ? 'PUT' : 'POST'

      let res: Response
      if (isDocTemplate) {
        const formData = new FormData()
        formData.append('name', name.trim())
        if (description.trim()) formData.append('description', description.trim())
        if (purpose.trim()) formData.append('purpose', purpose.trim())
        if (file) formData.append('file', file)

        res = await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: formData,
        })
      } else {
        res = await fetch(url, {
          method,
          headers: getAuthHeadersWithContentType(),
          body: JSON.stringify(body),
        })
      }
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка')
      }
      onAdded()
      handleClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl gradient-primary">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold">
              {isEdit ? 'Редактировать' : 'Добавить'} {config.label}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 ml-12">
            {isEdit ? 'Измените данные элемента справочника' : 'Введите данные для нового элемента справочника'}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dict-name">Название *</Label>
              <Input
                id="dict-name"
                placeholder="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>

            {isDepartment && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dict-manager">Руководитель</Label>
                  <select
                    id="dict-manager"
                    className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={managerId}
                    onChange={(e) => setManagerId(e.target.value)}
                  >
                    <option value="">Не назначен</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.last_name} {m.first_name}{m.middle_name ? ` ${m.middle_name}` : ''}{m.position ? ` — ${m.position}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dict-description">Описание</Label>
                  <textarea
                    id="dict-description"
                    rows={3}
                    placeholder="Описание отдела"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </>
            )}

            {isDocTemplate && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dict-purpose">Назначение</Label>
                  <select
                    id="dict-purpose"
                    className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  >
                    <option value="">Не указано</option>
                    {PURPOSE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Файл шаблона</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  {file ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-input bg-muted/30">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(file.size / 1024).toFixed(0)} КБ
                      </span>
                      <button
                        type="button"
                        onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        className="p-1 rounded hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-input hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Нажмите для выбора файла</span>
                      <span className="text-xs text-muted-foreground/60">PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dict-desc-tmpl">Описание</Label>
                  <textarea
                    id="dict-desc-tmpl"
                    rows={3}
                    placeholder="Описание шаблона документа"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <PlaceholdersSection
                  purpose={purpose}
                  show={showPlaceholders}
                  onToggle={() => setShowPlaceholders(v => !v)}
                  copiedTag={copiedTag}
                  onCopy={handleCopy}
                />
              </>
            )}

            {config.showCode && (
              <div className="space-y-2">
                <Label htmlFor="dict-code">Код *</Label>
                <Input
                  id="dict-code"
                  placeholder="Например, sick_leave"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
              <Button type="submit" disabled={!name.trim() || saving}>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {isEdit ? 'Сохранение…' : 'Добавление…'}
                  </span>
                ) : (
                  <>
                    {isEdit ? null : <Plus className="h-4 w-4 mr-2" />}
                    {isEdit ? 'Сохранить' : 'Добавить'}
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
