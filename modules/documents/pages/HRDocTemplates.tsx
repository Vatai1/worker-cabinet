import { useState, useEffect, useCallback } from 'react'
import { FileText, Plus, Pencil, Trash2, Search, X, Download, Eye, FileUp, Sparkles, Loader2, FolderOpen } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { ConfirmModal } from '@/shared/components/ConfirmModal'
import { AddDictItemModal } from '@/core/admin/components/modals/AddDictItemModal'
import { OnlyOfficePreviewModal } from '@/shared/components/OnlyOfficePreviewModal'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { PLACEHOLDERS_BY_PURPOSE, getAllGroups } from '@/shared/lib/docPlaceholders'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { formatFileSize } from '@/shared/lib/documentUtils'
import { API_BASE_URL } from '@/shared/lib/api'

const PURPOSE_LABELS: Record<string, string> = {
  vacation_template: 'Шаблон отпуска',
  vacation_transfer_template: 'Шаблон переноса',
}

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
  const [templates, setTemplates] = useState<DocTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<DocTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocTemplate | null>(null)
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
      setDeleteTarget(null)
      fetchTemplates()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
      setDeleteTarget(null)
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
    setDeleteTarget(item)
    handleDelete(item)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-card/5 rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-6 w-6 text-white/80" />
            <h1 className="text-2xl font-bold text-white">Шаблоны документов</h1>
          </div>
          <p className="text-sm text-white/60 mb-6">Шаблоны документов организации</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                className="w-full rounded-xl bg-card/10 border border-white/10 pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                placeholder="Поиск по названию или назначению..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="gap-2 bg-white/15 hover:bg-white/25 border-white/20 text-white backdrop-blur-sm"
            >
              <Plus className="h-4 w-4" />
              Добавить шаблон
            </Button>
          </div>
        </div>
      </div>

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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 mb-4">
            <FolderOpen className="h-8 w-8 text-white/80" />
          </div>
          <p className="text-lg font-medium text-muted-foreground">
            {search ? 'Ничего не найдено' : 'Шаблонов пока нет'}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            {search ? 'Попробуйте изменить запрос' : 'Нажмите «Добавить шаблон» чтобы создать первый шаблон'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {filtered.map((item) => {
            const purposeLabel = item.purpose ? PURPOSE_LABELS[item.purpose] || item.purpose : null
            return (
              <div
                key={item.id}
                className="group relative rounded-2xl border border-border/40 bg-card overflow-hidden hover:border-border hover:shadow-md transition-all duration-200"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 to-rose-600 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-sm">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" title={item.name}>{item.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {purposeLabel ? (
                          <Badge variant="secondary" className="text-[11px]">{purposeLabel}</Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/50">Без назначения</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">{item.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                    {item.file_key ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <FileUp className="h-3 w-3" />
                        {item.size ? formatFileSize(item.size) : 'Файл'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground/40">
                        <FileUp className="h-3 w-3" />
                        Без файла
                      </span>
                    )}
                    {item.created_at && (
                      <span className="inline-flex items-center gap-1">
                        {formatDate(item.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleDownload(item)}
                      disabled={!item.file_key || downloadingId === item.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Скачать"
                    >
                      {downloadingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Скачать
                    </button>
                    <button
                      onClick={() => setPreviewItem(item)}
                      disabled={!item.file_key}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Предпросмотр"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Предпросмотр
                    </button>
                    <div className="flex-1" />
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
      )}

      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          title="Удаление"
          message={`Удалить «${deleteTarget.name}»? Это действие нельзя отменить.`}
          confirmText="Удалить"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

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

      {(isAddModalOpen || editItem) && (
        <AddDictItemModal
          open={true}
          onClose={() => { setIsAddModalOpen(false); setEditItem(null) }}
          onAdded={() => { setIsAddModalOpen(false); setEditItem(null); fetchTemplates() }}
          tab="doc-templates"
          editItem={editItem}
        />
      )}
    </div>
  )
}
