import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DocumentPreviewModal } from '@/components/modals/DocumentPreviewModal'
import { isPreviewable } from '@/lib/documentUtils'
import { FileText, Upload, Trash2, Download, File, FileImage, FileCode, FileArchive, Eye } from 'lucide-react'
import { UploadDocumentModal } from '@/components/modals/UploadDocumentModal'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

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

interface Document {
  id: string
  name: string
  file_path: string
  file_size: number
  mime_type: string
  uploaded_by: string
  uploader_first_name?: string
  uploader_last_name?: string
  created_at: string
  tags?: string[]
  description?: string
}

interface Props {
  projectId: string
  canManage: boolean
  isMember: boolean
}

const FILE_ICONS: Record<string, React.ElementType> = {
  'application/pdf': FileText,
  'image/': FileImage,
  'text/': FileCode,
  'application/zip': FileArchive,
  'application/x-rar': FileArchive,
  'application/x-7z': FileArchive,
}

function getFileIcon(mimeType: string) {
  for (const [type, icon] of Object.entries(FILE_ICONS)) {
    if (mimeType.startsWith(type)) return icon
  }
  return File
}

function formatFileSize(bytes: number) {
  if (!bytes) return '—'
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DocumentsSection({ projectId, canManage, isMember }: Props) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/documents`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Не удалось загрузить документы')
      const data = await res.json()
      setDocuments(data)
    } catch (err: any) {
      console.error('Error fetching documents:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Удалить документ?')) return
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/documents/${docId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Не удалось удалить документ')
      fetchDocuments()
    } catch (err) {
      console.error('Error deleting document:', err)
    }
  }

  const handleDownload = async (doc: Document) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/projects/${projectId}/documents/${doc.id}/download`,
        { headers: getAuthHeaders() }
      )

      if (!res.ok) throw new Error('Не удалось скачать документ')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = doc.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading document:', err)
      alert('Не удалось скачать документ')
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [projectId])

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Документы
              <span className="ml-1 text-xs text-muted-foreground font-normal">({documents.length})</span>
            </CardTitle>
            {(canManage || isMember) && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Загрузить
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Загрузка...</div>
          ) : documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => {
                const FileIcon = getFileIcon(doc.mime_type)
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors group"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 shrink-0">
                      <FileIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{doc.name}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{formatFileSize(Number(doc.file_size))}</span>
                        <span>•</span>
                        <span>{doc.uploader_first_name} {doc.uploader_last_name}</span>
                        <span>•</span>
                        <span>{formatDate(doc.created_at)}</span>
                      </div>
                      {doc.tags && doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {doc.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {doc.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isPreviewable(doc.mime_type, doc.name) && (
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title="Просмотр"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                        title="Скачать"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {(canManage || String(doc.uploaded_by) === String(localStorage.getItem('auth-storage') ? JSON.parse(localStorage.getItem('auth-storage')!).state?.token?.id : '')) && (
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                <FileText className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Документов нет</p>
            </div>
          )}
        </CardContent>
      </Card>
      {uploadOpen && (
        <UploadDocumentModal
          projectId={projectId}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={fetchDocuments}
        />
      )}
      {previewDoc && (
        <DocumentPreviewModal
          open={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          document={{
            id: previewDoc.id,
            name: previewDoc.name,
            mimeType: previewDoc.mime_type,
            url: async () => {
              const res = await fetch(
                `${API_BASE_URL}/projects/${projectId}/documents/${previewDoc.id}/preview`,
                { headers: getAuthHeaders() }
              )
              if (!res.ok) throw new Error('Не удалось загрузить файл')
              
              const contentType = res.headers.get('content-type') || ''
              
              if (contentType.includes('text/plain') || contentType.includes('text/html')) {
                const text = await res.text()
                return text
              }
              
              const blob = await res.blob()
              return window.URL.createObjectURL(blob)
            },
            size: previewDoc.file_size,
            projectId: projectId,
          }}
        />
      )}
    </>
  )
}
