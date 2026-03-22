import { useState, useEffect, useCallback } from 'react'
import { Upload, Pencil, Trash2, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { OnlyOfficePreviewModal } from '@/components/modals/OnlyOfficePreviewModal'
import { UploadTemplateModal } from '@/components/modals/UploadTemplateModal'
import { EditTemplateMetaModal } from '@/components/modals/EditTemplateMetaModal'
import { templateApi } from '@/services/templateApi'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import type { DocumentTemplate } from '@/types'

const CATEGORY_LABELS: Record<string, string> = {
  hr: 'HR', legal: 'Юридические', finance: 'Финансы', general: 'Общие',
}
const CATEGORIES = ['all', 'hr', 'legal', 'finance', 'general']

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export function HRDocumentTemplates() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const [showUpload, setShowUpload] = useState(false)
  const [editTarget, setEditTarget] = useState<DocumentTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentTemplate | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [onlyOfficeDoc, setOnlyOfficeDoc] = useState<{
    id: number; name: string; mimeType: string; url: string; size?: number
  } | null>(null)
  const [onlyOfficeEditable, setOnlyOfficeEditable] = useState(false)
  const [onlyOfficeCallback, setOnlyOfficeCallback] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await templateApi.list()
      setTemplates(data)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'all' || t.category === category
    return matchesSearch && matchesCategory
  })

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await templateApi.remove(deleteTarget.id)
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleOpenOnlyOffice = async (template: DocumentTemplate, editable: boolean) => {
    try {
      const info = await templateApi.getOnlyOfficeInfo(template.id)
      setOnlyOfficeDoc({ id: template.id, name: info.name, mimeType: info.mimeType, url: info.url, size: template.size })
      setOnlyOfficeEditable(editable)
      setOnlyOfficeCallback(editable ? `${API_BASE_URL}/templates/${template.id}/onlyoffice/callback` : '')
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const isDocx = (t: DocumentTemplate) =>
    t.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    t.mimeType === 'application/msword'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Шаблоны документов</h1>
          <p className="text-muted-foreground text-sm mt-1">Управление шаблонами для сотрудников</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Загрузить шаблон
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {c === 'all' ? 'Все' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p>Шаблоны не найдены</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-base font-semibold">Шаблоны ({filtered.length})</h3>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">
                <div className={`w-10 h-12 rounded flex items-center justify-center text-xs font-bold text-white ${
                  t.mimeType === 'application/pdf' ? 'bg-red-600' : 'bg-blue-600'
                }`}>
                  {t.mimeType === 'application/pdf' ? 'PDF' : 'DOC'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {CATEGORY_LABELS[t.category]} · {formatFileSize(t.size)} · {t.downloadCount} скачиваний
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs border border-border">{CATEGORY_LABELS[t.category]}</span>
                <div className="flex items-center gap-2">
                  {isDocx(t) ? (
                    <Button size="sm" variant="outline" onClick={() => handleOpenOnlyOffice(t, true)}>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      OnlyOffice
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleOpenOnlyOffice(t, false)}>
                      Просмотр
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditTarget(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(t)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <UploadTemplateModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={load} />
      <EditTemplateMetaModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        template={editTarget}
        onSaved={load}
      />
      <ConfirmModal
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleteLoading}
        title="Удалить шаблон"
        message={`Вы уверены, что хотите удалить "${deleteTarget?.name}"? Это действие нельзя отменить.`}
      />
      {onlyOfficeDoc && (
        <OnlyOfficePreviewModal
          open={!!onlyOfficeDoc}
          onClose={() => setOnlyOfficeDoc(null)}
          document={onlyOfficeDoc}
          editable={onlyOfficeEditable}
          callbackUrl={onlyOfficeCallback}
        />
      )}
    </div>
  )
}
