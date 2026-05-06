export type DocumentType = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'docx' | 'other'

function getDocumentTypeByExtension(filename: string): DocumentType {
  if (!filename) return 'other'

  const ext = filename.split('.').pop()?.toLowerCase() || ''

  const pdfExtensions = ['pdf']
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const videoExtensions = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv']
  const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma']
  const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'xml', 'yaml', 'yml', 'csv']
  const docxExtensions = ['docx']
  const officeExtensions = ['xlsx', 'pptx', 'doc', 'xls', 'ppt', 'odt', 'ods', 'odp']
  const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz']

  if (pdfExtensions.includes(ext)) return 'pdf'
  if (imageExtensions.includes(ext)) return 'image'
  if (videoExtensions.includes(ext)) return 'video'
  if (audioExtensions.includes(ext)) return 'audio'
  if (textExtensions.includes(ext)) return 'text'
  if (docxExtensions.includes(ext)) return 'docx'
  if (officeExtensions.includes(ext)) return 'other'
  if (archiveExtensions.includes(ext)) return 'other'

  return 'other'
}

export function getDocumentType(mimeType: string | undefined | null, filename?: string): DocumentType {
  if (!mimeType) {
    if (filename) return getDocumentTypeByExtension(filename)
    return 'other'
  }

  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'

  const textTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/yaml',
    'application/x-yaml',
  ]

  if (textTypes.some(type => mimeType.startsWith(type))) return 'text'

  const docxMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ]

  if (docxMimeTypes.includes(mimeType)) return 'docx'

  const officeMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlform',
  ]

  if (officeMimeTypes.includes(mimeType)) return 'other'

  const archiveMimeTypes = [
    'application/zip',
    'application/x-rar',
    'application/x-7z',
    'application/x-tar',
    'application/gzip',
  ]

  if (archiveMimeTypes.includes(mimeType)) return 'other'

  if (filename) return getDocumentTypeByExtension(filename)

  return 'other'
}

export function isPreviewable(mimeType: string | undefined | null, filename?: string): boolean {
  const typeFromMime = getDocumentType(mimeType || '')
  
  if (typeFromMime !== 'other') return true
  
  if (filename) {
    const typeFromExt = getDocumentTypeByExtension(filename)
    return typeFromExt !== 'other'
  }
  
  return false
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '—'
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export function getFileIconType(mimeType: string): 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'docx' | 'file' {
  const type = getDocumentType(mimeType)
  if (type === 'other') return 'file'
  return type
}

export interface FolderItem {
  id: string
  name: string
  path: string
  parent_path: string
  created_by: string
  created_at: string
}

export interface DocItem {
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

export interface ProjectMeta {
  id: string
  name: string
  members: { id: string; role: string }[]
  leads: { id: string }[]
}

export interface ContextMenuState {
  x: number
  y: number
  type: 'folder' | 'doc'
  folder?: FolderItem
  doc?: DocItem
}

export const MIME_TYPE_LABELS: Record<string, string> = {
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

export function getFileTypeLabel(mimeType: string, fileName?: string): string {
  if (MIME_TYPE_LABELS[mimeType]) return MIME_TYPE_LABELS[mimeType]
  if (fileName) {
    const ext = fileName.split('.').pop()?.toUpperCase()
    if (ext && ext.length <= 5) return ext
  }
  return 'FILE'
}

export function formatDateShort(d: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(d))
}

export function formatDateTimeShort(d: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d))
}

export function parseBreadcrumbs(path: string) {
  const parts = path.split('/').filter(Boolean)
  const crumbs: { name: string; path: string }[] = [{ name: 'Home', path: '' }]
  let acc = ''
  for (const p of parts) {
    acc += '/' + p
    crumbs.push({ name: p, path: acc })
  }
  return crumbs
}
