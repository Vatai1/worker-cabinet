import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DocumentPreviewModal } from '@/components/modals/DocumentPreviewModal'
import { isPreviewable } from '@/lib/documentUtils'
import {
  ArrowLeft, Loader2, Upload, FolderPlus, Folder, FolderOpen,
  File, FileText, FileImage, FileCode, FileArchive, Download,
  Trash2, ChevronRight, Home, MoreVertical, X, Edit3, Info, Eye,
  Square, CheckSquare, MinusSquare, AlertTriangle, GripVertical, ArrowUp,
  Search,
} from 'lucide-react'

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

interface FolderItem {
  id: string
  name: string
  path: string
  parent_path: string
  created_by: string
  created_at: string
}

interface DocItem {
  id: string
  name: string
  file_path: string
  file_size: number
  mime_type: string
  folder_path: string
  uploader_first_name?: string
  uploader_last_name?: string
  uploaded_by: string
  created_at: string
  tags?: string[]
  description?: string
}

interface ProjectMeta {
  id: string
  name: string
  members: { id: string; role: string }[]
  leads: { id: string }[]
}

interface ContextMenuState {
  x: number
  y: number
  type: 'folder' | 'doc'
  folder?: FolderItem
  doc?: DocItem
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getFileIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType === 'application/pdf') return FileText
  if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return FileCode
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('tar')) return FileArchive
  return File
}

const MIME_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
  'image/svg+xml': 'SVG',
  'image/bmp': 'BMP',
  'video/mp4': 'MP4',
  'video/webm': 'WebM',
  'video/quicktime': 'MOV',
  'video/x-msvideo': 'AVI',
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/ogg': 'OGG',
  'text/plain': 'TXT',
  'text/html': 'HTML',
  'text/css': 'CSS',
  'text/javascript': 'JS',
  'application/json': 'JSON',
  'application/xml': 'XML',
  'application/zip': 'ZIP',
  'application/x-rar-compressed': 'RAR',
  'application/x-7z-compressed': '7Z',
  'application/x-tar': 'TAR',
  'application/gzip': 'GZ',
}

function getFileTypeLabel(mimeType: string, fileName?: string): string {
  if (MIME_TYPE_LABELS[mimeType]) return MIME_TYPE_LABELS[mimeType]

  if (mimeType.startsWith('image/')) return mimeType.replace('image/', '').toUpperCase()
  if (mimeType.startsWith('video/')) return mimeType.replace('video/', '').toUpperCase()
  if (mimeType.startsWith('audio/')) return mimeType.replace('audio/', '').toUpperCase()
  if (mimeType.startsWith('text/')) return mimeType.replace('text/', '').toUpperCase()

  if (fileName) {
    const ext = fileName.split('.').pop()?.toUpperCase()
    if (ext && ext.length <= 5) return ext
  }

  return mimeType.split('/')[1]?.toUpperCase() || mimeType
}

function formatSize(bytes: number) {
  if (!bytes) return '—'
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let size = bytes, i = 0
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(1)} ${units[i]}`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Build breadcrumb segments from path like "/Документы/Отчёты/"
function parseBreadcrumbs(path: string) {
  const parts = path.split('/').filter(Boolean)
  const crumbs: { label: string; path: string }[] = [{ label: 'Все файлы', path: '/' }]
  let acc = '/'
  for (const p of parts) {
    acc += `${p}/`
    crumbs.push({ label: p, path: acc })
  }
  return crumbs
}

// ── Create folder modal ───────────────────────────────────────────────────

function NewFolderModal({
  projectId, currentPath, onCreated, onClose,
}: { projectId: string; currentPath: string; onCreated: (f: FolderItem) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setErr('')
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/folders`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parentPath: currentPath }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onCreated(await res.json())
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
            <FolderPlus className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Новая папка</h2>
        </div>
        {err && <p className="text-sm text-destructive mb-3">{err}</p>}
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            placeholder="Название папки"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose}><X className="h-4 w-4 mr-1" />Отмена</Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? 'Создание…' : 'Создать'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Rename folder modal ─────────────────────────────────────────────────────

function RenameFolderModal({
  folder, onRenamed, onClose,
}: { folder: FolderItem; onRenamed: (newName: string) => void; onClose: () => void }) {
  const [name, setName] = useState(folder.name)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setErr('')
    try {
      onRenamed(name.trim())
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
            <Folder className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Переименовать папку</h2>
        </div>
        {err && <p className="text-sm text-destructive mb-3">{err}</p>}
        <form onSubmit={handleRename} className="space-y-4">
          <Input
            placeholder="Название папки"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose}><X className="h-4 w-4 mr-1" />Отмена</Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? 'Переименование…' : 'Переименовать'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Rename document modal ─────────────────────────────────────────────────────

function RenameDocModal({
  doc, onRenamed, onClose,
}: { doc: DocItem; onRenamed: (newName: string) => void; onClose: () => void }) {
  const [name, setName] = useState(doc.name)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setErr('')
    try {
      onRenamed(name.trim())
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const FileIcon = getFileIcon(doc.mime_type)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
            <FileIcon className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Переименовать файл</h2>
        </div>
        {err && <p className="text-sm text-destructive mb-3">{err}</p>}
        <form onSubmit={handleRename} className="space-y-4">
          <Input
            placeholder="Название файла"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose}><X className="h-4 w-4 mr-1" />Отмена</Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? 'Переименование…' : 'Переименовать'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Folder info modal ───────────────────────────────────────────────────────

function FolderInfoModal({
  folder, onClose,
}: { folder: FolderItem; onClose: () => void }) {
  const getCreatorName = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${folder.created_by}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        return `${data.first_name} ${data.last_name}`
      }
    } catch {}
    return ''
  }

  const [creatorName, setCreatorName] = useState('')

  useEffect(() => {
    getCreatorName().then(setCreatorName)
  }, [folder.created_by])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <Folder className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{folder.name}</h2>
            <p className="text-sm text-muted-foreground">Папка</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Путь</p>
              <p className="text-sm font-medium truncate">{folder.path}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Создана</p>
              <p className="text-sm font-medium">{formatDate(folder.created_at)}</p>
            </div>
          </div>

          {creatorName && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Создал</p>
              <p className="text-sm font-medium">{creatorName}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  )
}

// ── Document info modal ──────────────────────────────────────────────────────

function DocInfoModal({
  doc, onClose,
}: { doc: DocItem; onClose: () => void }) {
  const FileIcon = getFileIcon(doc.mime_type)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <FileIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{doc.name}</h2>
            <p className="text-sm text-muted-foreground">Файл</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Тип</p>
              <p className="text-sm font-medium">{getFileTypeLabel(doc.mime_type, doc.name)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Размер</p>
              <p className="text-sm font-medium">{formatSize(Number(doc.file_size))}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Путь</p>
            <p className="text-sm font-medium truncate">{doc.folder_path}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Загружил</p>
              <p className="text-sm font-medium">{doc.uploader_first_name} {doc.uploader_last_name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Дата загрузки</p>
              <p className="text-sm font-medium">{formatDateTime(doc.created_at)}</p>
            </div>
          </div>

          {doc.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Описание</p>
              <p className="text-sm font-medium">{doc.description}</p>
            </div>
          )}

          {doc.tags && doc.tags.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Теги</p>
              <div className="flex flex-wrap gap-2">
                {doc.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-1 bg-muted rounded text-xs">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  )
}

// ── Upload modal ──────────────────────────────────────────────────────────

function UploadModal({
  projectId, currentPath, onUploaded, onClose,
}: { projectId: string; currentPath: string; onUploaded: () => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true); setErr('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name || file.name)
      formData.append('folderPath', currentPath)
      if (description) formData.append('description', description)

      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/documents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onUploaded()
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
            <Upload className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Загрузить файл</h2>
        </div>
        {err && <p className="text-sm text-destructive mb-3">{err}</p>}
        <form onSubmit={handleUpload} className="space-y-4">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              file ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'
            }`}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                if (f && !name) setName(f.name)
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">({formatSize(file.size)})</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                Нажмите для выбора файла
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Имя файла</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название файла" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Описание</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно" />
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose}><X className="h-4 w-4 mr-1" />Отмена</Button>
            <Button type="submit" disabled={!file || uploading}>
              {uploading ? 'Загрузка…' : <><Upload className="h-4 w-4 mr-2" />Загрузить</>}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Confirm delete modal ─────────────────────────────────────────────────────

interface DeleteTarget {
  type: 'single-doc' | 'single-folder' | 'bulk'
  doc?: DocItem
  folder?: FolderItem
  docCount?: number
  folderCount?: number
}

function ConfirmDeleteModal({
  target, onConfirm, onClose, loading,
}: { target: DeleteTarget; onConfirm: () => void; onClose: () => void; loading: boolean }) {
  const getTitle = () => {
    if (target.type === 'single-doc') return 'Удалить файл?'
    if (target.type === 'single-folder') return 'Удалить папку?'
    return 'Удалить элементы?'
  }

  const getDescription = () => {
    if (target.type === 'single-doc') {
      return `Файл "${target.doc?.name}" будет удалён без возможности восстановления.`
    }
    if (target.type === 'single-folder') {
      return `Папка "${target.folder?.name}" и всё её содержимое будут удалены без возможности восстановления.`
    }
    const parts: string[] = []
    if (target.folderCount && target.folderCount > 0) {
      parts.push(`${target.folderCount} папок`)
    }
    if (target.docCount && target.docCount > 0) {
      parts.push(`${target.docCount} файлов`)
    }
    return `${parts.join(' и ')} будут удалены без возможности восстановления.`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">{getTitle()}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">{getDescription()}</p>
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Отмена
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Удаление…' : 'Удалить'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export function ProjectDocuments() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()

  const [project, setProject] = useState<ProjectMeta | null>(null)
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [docs, setDocs] = useState<DocItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState('/')
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [menuDocId, setMenuDocId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [folderToRename, setFolderToRename] = useState<FolderItem | null>(null)
  const [renameDocOpen, setRenameDocOpen] = useState(false)
  const [docToRename, setDocToRename] = useState<DocItem | null>(null)
  const [folderInfoOpen, setFolderInfoOpen] = useState(false)
  const [folderToInfo, setFolderToInfo] = useState<FolderItem | null>(null)
  const [docInfoOpen, setDocInfoOpen] = useState(false)
  const [docToInfo, setDocToInfo] = useState<DocItem | null>(null)
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  // Drag and drop
  const [dragCounter, setDragCounter] = useState(0)
  const [dropUploading, setDropUploading] = useState(false)
  const [dropProgress, setDropProgress] = useState<{ done: number; total: number } | null>(null)
  const dragOver = dragCounter > 0
  
  // Item drag and drop
  const [draggedItem, setDraggedItem] = useState<{ type: 'folder' | 'doc'; item: FolderItem | DocItem } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [movingItem, setMovingItem] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredDocs = docs.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Access
  const isLead = project?.leads?.some((m) => String(m.id) === String(user?.id))
  const isAdmin = user?.role === 'admin' || user?.role === 'hr'
  const isMember = project?.members?.some((m) => String(m.id) === String(user?.id))
  const canManage = isLead || isAdmin

  const fetchContent = async (path = currentPath) => {
    if (!id) return
    setLoading(true)
    try {
      const [foldersRes, docsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/projects/${id}/folders?parent=${encodeURIComponent(path)}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/projects/${id}/documents?folder=${encodeURIComponent(path)}`, { headers: getAuthHeaders() }),
      ])
      if (foldersRes.ok) setFolders(await foldersRes.json())
      if (docsRes.ok) setDocs(await docsRes.json())
    } finally {
      setLoading(false)
    }
  }

  // Fetch project meta once
  useEffect(() => {
    if (!id) return
    fetch(`${API_BASE_URL}/projects/${id}`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((data) => setProject({
        ...data,
        leads: data.members?.filter((m: any) => m.role === 'lead') ?? [],
      }))
      .catch(() => {})
  }, [id])

  useEffect(() => { fetchContent(currentPath) }, [currentPath, id])

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const navigateTo = (path: string) => {
    setCurrentPath(path)
    setMenuDocId(null)
    setContextMenu(null)
  }

  const handleDownload = async (doc: DocItem) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/projects/${id}/documents/${doc.id}/download`,
        { headers: getAuthHeaders() }
      )
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = doc.name
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch { alert('Не удалось скачать файл') }
  }

  const handleDeleteDoc = (doc: DocItem) => {
    setDeleteTarget({ type: 'single-doc', doc })
    setDeleteModalOpen(true)
  }

  const confirmDeleteDoc = async (docId: string) => {
    setBulkActionLoading(true)
    try {
      await fetch(`${API_BASE_URL}/projects/${id}/documents/${docId}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      setDocs((prev) => prev.filter((d) => d.id !== docId))
    } catch { alert('Не удалось удалить файл') }
    finally { setBulkActionLoading(false) }
    setMenuDocId(null)
    setContextMenu(null)
    setDeleteModalOpen(false)
    setDeleteTarget(null)
  }

  const handleDeleteFolder = (folder: FolderItem) => {
    setDeleteTarget({ type: 'single-folder', folder })
    setDeleteModalOpen(true)
  }

  const confirmDeleteFolder = async (folder: FolderItem) => {
    setBulkActionLoading(true)
    try {
      await fetch(`${API_BASE_URL}/projects/${id}/folders`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folder.path }),
      })
      setFolders((prev) => prev.filter((f) => f.id !== folder.id))
    } catch { alert('Не удалось удалить папку') }
    finally { setBulkActionLoading(false) }
    setContextMenu(null)
    setDeleteModalOpen(false)
    setDeleteTarget(null)
  }

  const handleRenameFolder = async (folder: FolderItem, newName: string) => {
    if (!newName.trim()) return
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${id}/folders/${folder.id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error()
      setFolders((prev) => prev.map((f) => f.id === folder.id ? { ...f, name: newName.trim() } : f))
    } catch { alert('Не удалось переименовать папку') }
  }

  const handleRenameDoc = async (doc: DocItem, newName: string) => {
    if (!newName.trim()) return
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${id}/documents/${doc.id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error()
      setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, name: newName.trim() } : d))
    } catch { alert('Не удалось переименовать файл') }
  }

  // ── Bulk Selection ────────────────────────────────────────────────────────

  const visibleItems = filteredFolders.length + filteredDocs.length
  const selectedCount = selectedFolderIds.size + selectedDocIds.size
  const allSelected = visibleItems > 0 && selectedCount === visibleItems
  const someSelected = selectedCount > 0 && !allSelected

  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev)
    setSelectedDocIds(new Set())
    setSelectedFolderIds(new Set())
    setSearchQuery('')
  }

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) {
        next.delete(docId)
      } else {
        next.add(docId)
      }
      return next
    })
  }

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedDocIds(new Set())
      setSelectedFolderIds(new Set())
    } else {
      setSelectedDocIds(new Set(filteredDocs.map((d) => d.id)))
      setSelectedFolderIds(new Set(filteredFolders.map((f) => f.id)))
    }
  }

  const handleBulkDownload = async () => {
    const selectedDocs = docs.filter((d) => selectedDocIds.has(d.id))
    if (selectedDocs.length === 0) return

    setBulkActionLoading(true)
    for (const doc of selectedDocs) {
      await handleDownload(doc)
    }
    setBulkActionLoading(false)
  }

  const handleBulkDelete = () => {
    const selectedDocs = docs.filter((d) => selectedDocIds.has(d.id))
    const selectedFolders = folders.filter((f) => selectedFolderIds.has(f.id))
    const total = selectedDocs.length + selectedFolders.length
    if (total === 0) return

    setDeleteTarget({
      type: 'bulk',
      docCount: selectedDocs.length,
      folderCount: selectedFolders.length,
    })
    setDeleteModalOpen(true)
  }

  const confirmBulkDelete = async () => {
    const selectedDocs = docs.filter((d) => selectedDocIds.has(d.id))
    const selectedFolders = folders.filter((f) => selectedFolderIds.has(f.id))

    setBulkActionLoading(true)
    await Promise.all([
      ...selectedDocs.map((doc) =>
        fetch(`${API_BASE_URL}/projects/${id}/documents/${doc.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })
      ),
      ...selectedFolders.map((folder) =>
        fetch(`${API_BASE_URL}/projects/${id}/folders`, {
          method: 'DELETE',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folder.path }),
        })
      ),
    ])
    setDocs((prev) => prev.filter((d) => !selectedDocIds.has(d.id)))
    setFolders((prev) => prev.filter((f) => !selectedFolderIds.has(f.id)))
    setSelectedDocIds(new Set())
    setSelectedFolderIds(new Set())
    setBulkActionLoading(false)
    setDeleteModalOpen(false)
    setDeleteTarget(null)
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'single-doc' && deleteTarget.doc) {
      confirmDeleteDoc(deleteTarget.doc.id)
    } else if (deleteTarget.type === 'single-folder' && deleteTarget.folder) {
      confirmDeleteFolder(deleteTarget.folder)
    } else if (deleteTarget.type === 'bulk') {
      confirmBulkDelete()
    }
  }

  // ── Drag and Drop ───────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!id || files.length === 0) return
    const arr = Array.from(files)
    setDropUploading(true)
    setDropProgress({ done: 0, total: arr.length })

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i]
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('name', file.name)
        formData.append('folderPath', currentPath)
        await fetch(`${API_BASE_URL}/projects/${id}/documents`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        })
      } catch {}
      setDropProgress({ done: i + 1, total: arr.length })
    }

    setDropUploading(false)
    setDropProgress(null)
    fetchContent(currentPath)
  }, [id, currentPath])

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setDragCounter((c) => c + 1)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter((c) => Math.max(0, c - 1))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter(0)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      uploadFiles(files)
    }
  }

  // ── Item Drag and Drop ────────────────────────────────────────────────────────

  const handleItemDragStart = (e: React.DragEvent, type: 'folder' | 'doc', item: FolderItem | DocItem) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, id: item.id }))
    e.dataTransfer.effectAllowed = 'move'
    setDraggedItem({ type, item })
  }

  const handleItemDragEnd = () => {
    setDraggedItem(null)
    setDropTarget(null)
  }

  const handleFolderDragOver = (e: React.DragEvent, folderPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedItem) {
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(folderPath)
    }
  }

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
  }

  const handleBreadcrumbDragOver = (e: React.DragEvent, path: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedItem && path !== currentPath) {
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(`breadcrumb-${path}`)
    }
  }

  const handleBreadcrumbDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
  }

  const handleMoveItem = async (targetPath: string) => {
    if (!draggedItem || !id) return
    
    // Prevent moving to same location
    if (draggedItem.type === 'folder') {
      const folder = draggedItem.item as FolderItem
      if (folder.parent_path === targetPath) {
        setDraggedItem(null)
        setDropTarget(null)
        return
      }
      // Prevent moving folder into itself
      if (targetPath.startsWith(folder.path)) {
        setDraggedItem(null)
        setDropTarget(null)
        return
      }
    } else {
      const doc = draggedItem.item as DocItem
      if (doc.folder_path === targetPath) {
        setDraggedItem(null)
        setDropTarget(null)
        return
      }
    }

    setMovingItem(true)
    try {
      if (draggedItem.type === 'folder') {
        const res = await fetch(`${API_BASE_URL}/projects/${id}/folders/${draggedItem.item.id}/move`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentPath: targetPath }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Не удалось переместить папку')
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/projects/${id}/documents/${draggedItem.item.id}/move`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: targetPath }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Не удалось переместить файл')
        }
      }
      fetchContent(currentPath)
    } catch (error: any) {
      alert(error.message)
    } finally {
      setMovingItem(false)
      setDraggedItem(null)
      setDropTarget(null)
    }
  }

  const handleFolderDrop = (e: React.DragEvent, folderPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    handleMoveItem(folderPath)
  }

  const handleBreadcrumbDrop = (e: React.DragEvent, path: string) => {
    e.preventDefault()
    e.stopPropagation()
    handleMoveItem(path)
  }

  // ── Context menu ────────────────────────────────────────────────────────

  const openContextMenu = (e: React.MouseEvent, type: 'folder' | 'doc', item: FolderItem | DocItem) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      folder: type === 'folder' ? (item as FolderItem) : undefined,
      doc: type === 'doc' ? (item as DocItem) : undefined,
    })
  }

  const breadcrumbs = parseBreadcrumbs(currentPath)

  return (
    <div className="space-y-5 animate-fade-in" onClick={() => { setMenuDocId(null); setContextMenu(null) }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${id}`}>
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              К проекту
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Документы</h1>
            {project && (
              <p className="text-sm text-muted-foreground">{project.name}</p>
            )}
          </div>
        </div>

        {(canManage || isMember) && (
          <div className="flex gap-2">
            {docs.length > 0 && (
              <Button
                variant={selectMode ? 'default' : 'outline'}
                className="gap-2"
                onClick={toggleSelectMode}
              >
                {selectMode ? (
                  <>
                    <X className="h-4 w-4" />
                    Отмена
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-4 w-4" />
                    Выбрать
                  </>
                )}
              </Button>
            )}
            {canManage && (
              <Button variant="outline" className="gap-2" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                Папка
              </Button>
            )}
            <Button className="gap-2" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Загрузить
            </Button>
          </div>
        )}
      </div>

      {/* Browser frame */}
      <div
        className={`rounded-2xl border bg-card shadow-sm overflow-hidden relative transition-colors duration-150 ${
          dragOver ? 'border-primary border-2' : 'border-border'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-primary/5 backdrop-blur-[2px] pointer-events-none">
            <Upload className="h-14 w-14 text-primary mb-3 animate-bounce" />
            <p className="text-lg font-semibold text-primary">Перетащите файлы сюда</p>
            <p className="text-sm text-muted-foreground mt-1">Файлы будут загружены в текущую папку</p>
          </div>
        )}

        {/* Upload progress overlay */}
        {dropUploading && dropProgress && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
            <p className="font-semibold">Загрузка файлов…</p>
            <p className="text-sm text-muted-foreground mt-1">
              {dropProgress.done} / {dropProgress.total}
            </p>
            <div className="w-48 h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(dropProgress.done / dropProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Moving item overlay */}
        {movingItem && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
            <p className="font-semibold">Перемещение…</p>
          </div>
        )}

        {/* Toolbar: breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-border/60 bg-muted/30 text-sm flex-wrap">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
              {i === breadcrumbs.length - 1 ? (
                <span className="font-medium flex items-center gap-1">
                  {i === 0 ? <Home className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5 text-amber-500" />}
                  {crumb.label}
                </span>
              ) : (
                <button
                  className={`text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-1 py-0.5 rounded ${
                    dropTarget === `breadcrumb-${crumb.path}` ? 'bg-primary/20 text-primary' : ''
                  } ${draggedItem ? 'ring-1 ring-dashed ring-muted-foreground/30' : ''}`}
                  onClick={() => navigateTo(crumb.path)}
                  onDragOver={(e) => handleBreadcrumbDragOver(e, crumb.path)}
                  onDragLeave={handleBreadcrumbDragLeave}
                  onDrop={(e) => handleBreadcrumbDrop(e, crumb.path)}
                >
                  {i === 0 ? <Home className="h-3.5 w-3.5" /> : null}
                  {crumb.label}
                  {draggedItem && crumb.path !== currentPath && (
                    <ArrowUp className="h-3 w-3 text-muted-foreground/50" />
                  )}
                </button>
              )}
            </span>
          ))}
          {/* Search */}
          {(folders.length > 0 || docs.length > 0) && (
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Поиск..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 w-40 pl-7 pr-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {searchQuery && (
                  <button
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : folders.length === 0 && docs.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Folder className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground mb-4">Папка пуста</p>
            {(canManage || isMember) && (
              <div className="flex gap-2 justify-center">
                {canManage && (
                  <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
                    <FolderPlus className="h-4 w-4 mr-2" />Создать папку
                  </Button>
                )}
                <Button onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />Загрузить файл
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2">
          {/* Bulk selection toolbar */}
          {selectMode && visibleItems > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 mb-2 bg-primary/5 rounded-xl mx-2">
              <button
                className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                onClick={toggleSelectAll}
              >
                {allSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : someSelected ? (
                  <MinusSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                <span>
                  {allSelected
                    ? 'Снять выделение'
                    : selectedCount > 0
                    ? `Выбрано ${selectedCount} из ${visibleItems}`
                    : 'Выбрать все'}
                </span>
              </button>
              {selectedCount > 0 && (
                <div className="flex items-center gap-1 ml-auto">
                  {selectedDocIds.size > 0 && (
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
                      onClick={handleBulkDownload}
                      disabled={bulkActionLoading}
                    >
                      <Download className="h-4 w-4" />
                      Скачать
                    </button>
                  )}
                  {canManage && (
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-destructive/10 text-destructive transition-colors disabled:opacity-50"
                      onClick={handleBulkDelete}
                      disabled={bulkActionLoading}
                    >
                      <Trash2 className="h-4 w-4" />
                      Удалить
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Folders */}
          {filteredFolders.map((folder) => {
            const isSelected = selectedFolderIds.has(folder.id)
            const isDropTarget = dropTarget === folder.path
            const isDragging = draggedItem?.type === 'folder' && draggedItem.item.id === folder.id
            return (
              <div
                key={folder.id}
                draggable={!selectMode && canManage}
                onDragStart={(e) => handleItemDragStart(e, 'folder', folder)}
                onDragEnd={handleItemDragEnd}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors group cursor-pointer select-none ${
                  isSelected ? 'bg-primary/10' : isDropTarget ? 'bg-primary/20 ring-2 ring-primary' : isDragging ? 'opacity-50' : 'hover:bg-muted/40'
                }`}
                onClick={() => !selectMode && navigateTo(folder.path)}
                onContextMenu={(e) => openContextMenu(e, 'folder', folder)}
                onDragOver={(e) => handleFolderDragOver(e, folder.path)}
                onDragLeave={handleFolderDragLeave}
                onDrop={(e) => handleFolderDrop(e, folder.path)}
              >
                {selectMode && (
                  <button
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleFolderSelection(folder.id) }}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                    )}
                  </button>
                )}
                {!selectMode && canManage && (
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
                <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                <span className="flex-1 font-medium text-sm">{folder.name}</span>
                <span className="text-xs text-muted-foreground">{formatDate(folder.created_at)}</span>
                {canManage && !selectMode && (
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                    title="Удалить папку"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}

          {/* Divider if both folders and files exist */}
          {filteredFolders.length > 0 && filteredDocs.length > 0 && (
            <div className="border-t border-border/40 my-1 mx-2" />
          )}

          {/* No results */}
          {searchQuery && filteredFolders.length === 0 && filteredDocs.length === 0 && (
            <div className="text-center py-12">
              <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Ничего не найдено</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Попробуйте изменить запрос</p>
            </div>
          )}

          {/* Files */}
          {filteredDocs.map((doc) => {
            const FileIcon = getFileIcon(doc.mime_type)
            const menuOpen = menuDocId === doc.id
            const isSelected = selectedDocIds.has(doc.id)
            const isDragging = draggedItem?.type === 'doc' && draggedItem.item.id === doc.id
            return (
              <div
                key={doc.id}
                draggable={!selectMode && canManage}
                onDragStart={(e) => handleItemDragStart(e, 'doc', doc)}
                onDragEnd={handleItemDragEnd}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors group relative select-none ${
                  isSelected ? 'bg-primary/10' : isDragging ? 'opacity-50' : 'hover:bg-muted/40'
                }`}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => { e.stopPropagation(); openContextMenu(e, 'doc', doc) }}
              >
                {selectMode && (
                  <button
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleDocSelection(doc.id) }}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                    )}
                  </button>
                )}
                {!selectMode && canManage && (
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
                  <FileIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{doc.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{formatSize(Number(doc.file_size))}</span>
                    <span>•</span>
                    <span>{doc.uploader_first_name} {doc.uploader_last_name}</span>
                    <span>•</span>
                    <span>{formatDate(doc.created_at)}</span>
                  </div>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isPreviewable(doc.mime_type, doc.name) && (
                    <button
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      title="Просмотр"
                      onClick={() => setPreviewDoc(doc)}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                    title="Скачать"
                    onClick={() => handleDownload(doc)}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <div className="relative">
                    <button
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                      title="Действия"
                      onClick={(e) => { e.stopPropagation(); setMenuDocId(menuOpen ? null : doc.id) }}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="h-4 w-4" />Скачать
                        </button>
                        {(canManage || String(doc.uploaded_by) === String(user?.id)) && (
                          <button
                            className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
                            onClick={() => handleDeleteDoc(doc)}
                          >
                            <Trash2 className="h-4 w-4" />Удалить
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          </div>
        )}
      </div>{/* end browser frame */}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden py-1 w-52"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'folder' && contextMenu.folder && (
            <>
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                onClick={() => { navigateTo(contextMenu.folder!.path) }}
              >
                <FolderOpen className="h-4 w-4 text-amber-500" />
                Открыть
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                onClick={() => { setFolderToInfo(contextMenu.folder!); setFolderInfoOpen(true); setContextMenu(null) }}
              >
                <Info className="h-4 w-4" />
                Информация
              </button>
              {canManage && (
                <>
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                    onClick={() => { setFolderToRename(contextMenu.folder!); setRenameFolderOpen(true); setContextMenu(null) }}
                  >
                    <Edit3 className="h-4 w-4" />
                    Переименовать
                  </button>
                  <div className="border-t border-border/40 my-1" />
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
                    onClick={() => handleDeleteFolder(contextMenu.folder!)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить папку
                  </button>
                </>
              )}
            </>
          )}
          {contextMenu.type === 'doc' && contextMenu.doc && (
            <>
              {isPreviewable(contextMenu.doc.mime_type, contextMenu.doc.name) && (
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                  onClick={() => { setPreviewDoc(contextMenu.doc!); setContextMenu(null) }}
                >
                  <Eye className="h-4 w-4" />
                  Просмотр
                </button>
              )}
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                onClick={() => { handleDownload(contextMenu.doc!); setContextMenu(null) }}
              >
                <Download className="h-4 w-4" />
                Скачать
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                onClick={() => { setDocToInfo(contextMenu.doc!); setDocInfoOpen(true); setContextMenu(null) }}
              >
                <Info className="h-4 w-4" />
                Информация
              </button>
              {(canManage || String(contextMenu.doc.uploaded_by) === String(user?.id)) && (
                <>
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                    onClick={() => { setDocToRename(contextMenu.doc!); setRenameDocOpen(true); setContextMenu(null) }}
                  >
                    <Edit3 className="h-4 w-4" />
                    Переименовать
                  </button>
                  <div className="border-t border-border/40 my-1" />
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
                    onClick={() => handleDeleteDoc(contextMenu.doc!)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить файл
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {newFolderOpen && (
        <NewFolderModal
          projectId={id!}
          currentPath={currentPath}
          onCreated={(f) => setFolders((prev) => [...prev, f])}
          onClose={() => setNewFolderOpen(false)}
        />
      )}
      {uploadOpen && (
        <UploadModal
          projectId={id!}
          currentPath={currentPath}
          onUploaded={() => fetchContent(currentPath)}
          onClose={() => setUploadOpen(false)}
        />
      )}
      {renameFolderOpen && folderToRename && (
        <RenameFolderModal
          folder={folderToRename}
          onRenamed={(newName) => handleRenameFolder(folderToRename, newName)}
          onClose={() => { setRenameFolderOpen(false); setFolderToRename(null) }}
        />
      )}
      {renameDocOpen && docToRename && (
        <RenameDocModal
          doc={docToRename}
          onRenamed={(newName) => handleRenameDoc(docToRename, newName)}
          onClose={() => { setRenameDocOpen(false); setDocToRename(null) }}
        />
      )}
      {folderInfoOpen && folderToInfo && (
        <FolderInfoModal
          folder={folderToInfo}
          onClose={() => { setFolderInfoOpen(false); setFolderToInfo(null) }}
        />
      )}
      {docInfoOpen && docToInfo && (
        <DocInfoModal
          doc={docToInfo}
          onClose={() => { setDocInfoOpen(false); setDocToInfo(null) }}
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
              console.log('🔍 Loading document preview:', {
                id: previewDoc.id,
                name: previewDoc.name,
                mimeType: previewDoc.mime_type,
              })

              // For DOCX files, get preview token and use public URL for OnlyOffice
              if (previewDoc.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                  previewDoc.mime_type === 'application/msword' ||
                  previewDoc.name.toLowerCase().endsWith('.docx')) {
                console.log('📄 Detected DOCX file, getting preview token...')
                const tokenRes = await fetch(
                  `${API_BASE_URL}/projects/${id}/documents/${previewDoc.id}/preview-token`,
                  { headers: getAuthHeaders() }
                )

                console.log('Token response status:', tokenRes.status)

                if (!tokenRes.ok) {
                  const errorData = await tokenRes.text()
                  console.error('❌ Failed to get token:', errorData)
                  throw new Error('Не удалось получить токен')
                }

                const data = await tokenRes.json()
                const publicUrl = data.publicUrl || `${API_BASE_URL}/projects/${id}/documents/${previewDoc.id}/public/${data.token}`
                console.log('✅ Got public URL:', publicUrl.substring(0, 80) + '...')

                return publicUrl
              }

              // For other files, use regular preview endpoint
              const res = await fetch(
                `${API_BASE_URL}/projects/${id}/documents/${previewDoc.id}/preview`,
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
            projectId: id,
          }}
        />
      )}
      {deleteModalOpen && deleteTarget && (
        <ConfirmDeleteModal
          target={deleteTarget}
          onConfirm={handleConfirmDelete}
          onClose={() => { setDeleteModalOpen(false); setDeleteTarget(null) }}
          loading={bulkActionLoading}
        />
      )}
    </div>
  )
}
