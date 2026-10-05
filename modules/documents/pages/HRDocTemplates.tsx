import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Pencil, Trash2, Search, X, Download, Eye, Loader2, FolderOpen } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { AddDictItemModal } from '@/core/admin/components/modals/AddDictItemModal'
import { OnlyOfficePreviewModal } from '@/shared/components/OnlyOfficePreviewModal'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { PLACEHOLDERS_BY_PURPOSE, getAllGroups } from '@/shared/lib/docPlaceholders'
import { cn, formatDate, getErrorMessage } from '@/shared/lib/utils'
import { formatFileSize, getFileTypeLabel } from '@/shared/lib/documentUtils'
import { API_BASE_URL } from '@/shared/lib/api'
import { DeclensionsPanel } from '@/modules/documents/components/DeclensionsPanel'

const PURPOSE_LABELS: Record<string, string> = {
  vacation_template: 'Шаблон отпуска',
  vacation_transfer_template: 'Шаблон переноса',
}

const PURPOSE_STYLES: Record<string, { icon: string; dot: string }> = {
  vacation_template: { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  vacation_transfer_template: { icon: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500' },
  none: { icon: 'bg-slate-500/10 text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' },
}

const purposeStyle = (purpose?: string) => PURPOSE_STYLES[purpose || 'none'] ?? PURPOSE_STYLES.none
const purposeLabel = (purpose?: string) => (purpose ? PURPOSE_LABELS[purpose] || purpose : 'Без назначения')
const PURPOSE_ORDER = ['vacation_template', 'vacation_transfer_template']

interface DocTemplate {
  id: number
  name: string
  description?: string
  purpose?: string
  file_key?: string | null
  mime_type?: string | null
  size?: number | null
  created_at?: string
  download_count?: number
}

export function HRDocTemplates() {
  const navigate = useNavigate()
  const [view, setView] = useState<'templates' | 'declensions'>('templates')
  const [templates, setTemplates] = useState<DocTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editItem, setEditItem] = useState<DocTemplate | null>(null)
  const [previewItem, setPreviewItem] = useState<DocTemplate | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/doc-templates`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка загрузки')
      setTemplates(await res.json())
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const filtered = templates.filter((t) => {
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || (t.purpose && t.purpose.toLowerCase().includes(q))
  })

  const lanes = useMemo(() => {
    const map = new Map<string, DocTemplate[]>()
    for (const t of filtered) {
      const key = t.purpose || 'none'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    const otherKeys = [...map.keys()].filter((k) => !PURPOSE_ORDER.includes(k) && k !== 'none').sort()
    const orderedKeys = [
      ...PURPOSE_ORDER.filter((k) => map.has(k)),
      ...otherKeys,
      ...(map.has('none') ? ['none'] : []),
    ]
    return orderedKeys.map((key) => ({ key, items: map.get(key)! }))
  }, [filtered])

  const handleDownload = async (item: DocTemplate) => {
    setDownloadingId(item.id)
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/doc-templates/${item.id}/file`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка скачивания')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = item.name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch {
      setError('Не удалось скачать файл')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (item: DocTemplate) => {
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/doc-templates/${item.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
      fetchTemplates()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const handleDeleteClick = async (item: DocTemplate) => {
    const ok = await confirmDialog({
      title: 'Удаление шаблона',
      message: `Удалить «${item.name}»? Это действие нельзя отменить.`,
      confirmText: 'Удалить',
      variant: 'danger',
    })
    if (!ok) return
    handleDelete(item)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Шаблоны документов</h1>
          <p className="text-sm text-muted-foreground">Шаблоны документов организации</p>
        </div>
        {view === 'templates' && <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="w-full rounded-xl bg-background border border-input pl-10 pr-9 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
              placeholder="Поиск по названию или назначению..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button onClick={() => navigate('/hr/doc-templates/new')} className="gap-2">
            <Plus className="h-4 w-4" />
            Добавить шаблон
          </Button>
        </div>}
      </div>

      <div role="tablist" className="inline-flex rounded-xl bg-muted/50 p-1">
        {([['templates', 'Шаблоны'], ['declensions', 'Склонения']] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              view === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'declensions' ? <DeclensionsPanel /> : <>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/40 bg-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              </div>
              <div className="h-8 w-full rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card p-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <FolderOpen className="h-8 w-8 text-primary/70" />
          </div>
          <p className="text-lg font-medium text-muted-foreground">
            {search ? 'Ничего не найдено' : 'Шаблонов пока нет'}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            {search ? 'Попробуйте изменить запрос' : 'Нажмите «Добавить шаблон» чтобы создать первый шаблон'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {lanes.map(({ key, items }) => {
            const style = purposeStyle(key === 'none' ? undefined : key)
            return (
              <div key={key}>
                <p className="flex items-center gap-2 text-[13px] font-semibold mb-2.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  {purposeLabel(key === 'none' ? undefined : key)}
                  <span className="font-normal text-muted-foreground">{items.length}</span>
                </p>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                  {items.map((item) => {
                    const ext = item.file_key ? getFileTypeLabel(item.mime_type || '', item.name) : null
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-border/40 bg-card overflow-hidden hover:border-border hover:shadow-md transition-all duration-200"
                      >
                        <div className="p-4">
                          <div className="flex items-start gap-3 mb-3">
                            <div className={`relative flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${style.icon}`}>
                              <FileText className="h-4.5 w-4.5" />
                              {ext && (
                                <span className="absolute -bottom-1 -right-1.5 rounded border border-border bg-card px-1 py-px font-mono text-[8px] font-bold text-muted-foreground">
                                  {ext}
                                </span>
                              )}
                            </div>
                            <p className="flex-1 min-w-0 font-semibold text-[13.5px] leading-snug truncate" title={item.name}>{item.name}</p>
                          </div>

                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{item.description}</p>
                          )}

                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-3">
                            {item.file_key ? (
                              <span>{item.size ? formatFileSize(item.size) : 'Файл'}</span>
                            ) : (
                              <span className="text-muted-foreground/40">Без файла</span>
                            )}
                            {item.created_at && <span>· {formatDate(item.created_at)}</span>}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDownload(item)}
                              disabled={!item.file_key || downloadingId === item.id}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Скачать"
                            >
                              {downloadingId === item.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              Скачать
                            </button>
                            <button
                              onClick={() => setPreviewItem(item)}
                              disabled={!item.file_key}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Предпросмотр"
                            >
                              <Eye className="h-3 w-3" />
                              Просмотр
                            </button>
                            <button
                              onClick={() => setEditItem(item)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Редактировать"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(item)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Удалить"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      </>}


      {previewItem && (
        <OnlyOfficePreviewModal
          open={true}
          onClose={() => setPreviewItem(null)}
          document={{
            id: previewItem.id,
            name: previewItem.name,
            mimeType: previewItem.mime_type || 'application/octet-stream',
            size: previewItem.size ?? undefined,
            url: async () => {
              const res = await fetch(`${API_BASE_URL}/dictionaries/doc-templates/${previewItem.id}/preview-token`, { headers: getAuthHeaders() })
              if (!res.ok) throw new Error('Не удалось получить токен')
              const data = await res.json()
              return data.publicUrl
            },
          }}
          editable={true}
          onSave={async (downloadUrl, fileType) => {
            const res = await fetch(`${API_BASE_URL}/dictionaries/doc-templates/${previewItem.id}/save-from-url`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify({ url: downloadUrl, fileType }),
            })
            if (!res.ok) {
              try {
                const data = await res.json()
                throw new Error(data.error || 'Ошибка сохранения')
              } catch (e: unknown) {
                if (e instanceof Error) throw e
                throw new Error('Ошибка сохранения')
              }
            }
          }}
          placeholders={previewItem.purpose ? (PLACEHOLDERS_BY_PURPOSE[previewItem.purpose] ?? getAllGroups()) : getAllGroups()}
        />
      )}

      {editItem && (
        <AddDictItemModal
          open={true}
          onClose={() => setEditItem(null)}
          onAdded={() => { setEditItem(null); fetchTemplates() }}
          tab="doc-templates"
          editItem={editItem}
        />
      )}
    </div>
  )
}
