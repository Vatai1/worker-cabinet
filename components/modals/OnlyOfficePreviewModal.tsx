import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Edit, Loader2 } from 'lucide-react'
import { formatFileSize } from '@/lib/documentUtils'
import { Button } from '@/components/ui/Button'

interface OnlyOfficePreviewModalProps {
  open: boolean
  onClose: () => void
  document: {
    id: string
    name: string
    mimeType: string
    url: string | (() => Promise<string>)
    size?: number
  }
}

const ONLYOFFICE_URL = import.meta.env.VITE_ONLYOFFICE_URL || 'http://localhost:8080'
const ONLYOFFICE_API_URL = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`

let editorCounter = 0

export function OnlyOfficePreviewModal({ open, onClose, document: doc }: OnlyOfficePreviewModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editorId] = useState(() => `onlyoffice-editor-${++editorCounter}`)
  const editorRef = useRef<any>(null)
  const isInitializedRef = useRef(false)

  const destroyEditor = useCallback(() => {
    if (editorRef.current) {
      try {
        console.log('🧹 Destroying editor...')
        editorRef.current.destroyEditor()
      } catch (e) {
        console.error('Error destroying editor:', e)
      }
      editorRef.current = null
    }
    isInitializedRef.current = false
  }, [])

  useEffect(() => {
    if (!open) {
      destroyEditor()
      return
    }

    if (isInitializedRef.current) return

    const initEditor = async () => {
      setLoading(true)
      setError(null)

      try {
        console.log('📦 Loading OnlyOffice API...')
        
        if (!(window as any).DocsAPI) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = ONLYOFFICE_API_URL
            script.async = true
            script.onload = () => {
              console.log('✅ OnlyOffice API loaded')
              resolve()
            }
            script.onerror = () => reject(new Error('Не удалось загрузить OnlyOffice API'))
            document.head.appendChild(script)
          })
        }

        let fileUrl: string
        console.log('🔗 Getting document URL...')
        if (typeof doc.url === 'function') {
          fileUrl = await doc.url()
        } else {
          fileUrl = doc.url
        }
        console.log('📄 Document URL:', fileUrl.substring(0, 80) + '...')

        if (fileUrl.startsWith('blob:')) {
          console.log('🔄 Converting blob URL to data URL...')
          const response = await fetch(fileUrl)
          const blob = await response.blob()
          fileUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          console.log('✅ Converted to data URL')
        }

        const DocsAPI = (window as any).DocsAPI
        const fileType = getFileType(doc.mimeType, doc.name)
        const key = `${doc.id}-${Date.now()}`

        console.log('⚙️ Creating editor configuration...')
        console.log('📋 File type:', fileType, 'Key:', key)

        const config = {
          document: {
            fileType: fileType,
            key: key,
            title: doc.name,
            url: fileUrl,
            permissions: {
              edit: false,
              download: true,
              print: true,
            },
          },
          editorConfig: {
            lang: 'ru',
            mode: 'view',
            callbackUrl: '',
            user: {
              id: 'preview-user',
              name: 'Preview User',
            },
          },
          height: '100%',
          width: '100%',
          type: 'desktop',
        }

        console.log('🎨 Initializing editor in:', editorId)
        
        await new Promise(resolve => setTimeout(resolve, 50))
        
        const container = document.getElementById(editorId)
        if (!container) {
          throw new Error(`Container #${editorId} not found`)
        }

        editorRef.current = new DocsAPI.DocEditor(editorId, config)
        isInitializedRef.current = true
        console.log('✅ Editor initialized!')

        setLoading(false)
      } catch (e: any) {
        console.error('❌ Error:', e)
        setError(e.message || 'Не удалось загрузить документ')
        setLoading(false)
      }
    }

    const timeoutId = setTimeout(initEditor, 100)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [open, doc.id, doc.name, doc.mimeType, editorId, destroyEditor])

  useEffect(() => {
    return () => {
      destroyEditor()
    }
  }, [destroyEditor])

  const getFileType = (mimeType: string, fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''

    const typeMap: Record<string, string> = {
      'text/plain': 'txt',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.oasis.opendocument.text': 'odt',
      'application/rtf': 'rtf',
      'text/html': 'html',
      'text/csv': 'csv',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.oasis.opendocument.spreadsheet': 'ods',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'application/vnd.oasis.opendocument.presentation': 'odp',
      'application/pdf': 'pdf',
    }

    if (typeMap[mimeType]) return typeMap[mimeType]

    const extMap: Record<string, string> = {
      doc: 'doc', docx: 'docx', odt: 'odt', rtf: 'rtf', txt: 'txt',
      html: 'html', csv: 'csv', xls: 'xls', xlsx: 'xlsx', ods: 'ods',
      ppt: 'ppt', pptx: 'pptx', odp: 'odp', pdf: 'pdf',
    }

    return extMap[ext] || 'docx'
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-7xl mx-4 flex flex-col h-[95vh]">
        <div className="flex items-center justify-between p-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
              <Edit className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">{doc.name}</h2>
              {doc.size && (
                <p className="text-sm text-muted-foreground">{formatFileSize(doc.size)}</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden relative" style={{ minHeight: '500px' }}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Загрузка документа...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
              <div className="text-center max-w-md">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <p className="text-destructive mb-2">{error}</p>
                <p className="text-sm text-muted-foreground">
                  Убедитесь, что OnlyOffice запущен на {ONLYOFFICE_URL}
                </p>
              </div>
            </div>
          )}

          <div
            id={editorId}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border/60 shrink-0">
          <p className="text-sm text-muted-foreground">Powered by OnlyOffice</p>
          <Button variant="outline" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  )
}
