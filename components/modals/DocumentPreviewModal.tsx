import { useState, useEffect, useRef } from 'react'
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Play, Volume2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { formatFileSize, getDocumentType } from '@/lib/documentUtils'
import { Button } from '@/components/ui/Button'
import { OnlyOfficePreviewModal } from './OnlyOfficePreviewModal'

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

interface DocumentPreviewModalProps {
  open: boolean
  onClose: () => void
  document: {
    id: string
    name: string
    mimeType: string
    url: string | (() => Promise<string>)
    size?: number
    projectId?: string
  }
}

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

export function DocumentPreviewModal({ open, onClose, document: doc }: DocumentPreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfNumPages, setPdfNumPages] = useState(0)
  const [pdfPageNumber, setPdfPageNumber] = useState(1)
  const [pdfScale, setPdfScale] = useState(1.0)
  const [audioPlaying, setAudioPlaying] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!open) return

    const loadUrl = async () => {
      setLoading(true)
      setError(null)
      setPreviewUrl(null)
      setPdfNumPages(0)
      setPdfPageNumber(1)
      setPdfScale(1.0)

      try {
        let url: string

        if (typeof doc.url === 'function') {
          url = await doc.url()
        } else {
          url = doc.url
        }

        setPreviewUrl(url)
      } catch (e: any) {
        setError(e.message || 'Не удалось загрузить файл')
      } finally {
        setLoading(false)
      }
    }

    loadUrl()

    return () => {
      setPreviewUrl(null)
    }
  }, [open, doc])

  const handleDownload = async () => {
    try {
      if (doc.projectId) {
        const res = await fetch(
          `${API_BASE_URL}/projects/${doc.projectId}/documents/${doc.id}/download`,
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
      } else if (previewUrl) {
        const link = document.createElement('a')
        link.href = previewUrl
        link.download = doc.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (e: any) {
      alert(e.message || 'Не удалось скачать документ')
    }
  }

  const docType = getDocumentType(doc.mimeType, doc.name)

  if (!open) return null

  // Для DOCX используем OnlyOffice
  if (docType === 'docx') {
    return (
      <OnlyOfficePreviewModal
        open={open}
        onClose={onClose}
        document={doc}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-7xl mx-4 flex flex-col h-[95vh] animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
              {docType === 'pdf' && <Download className="h-5 w-5 text-primary" />}
              {docType === 'image' && <Play className="h-5 w-5 text-primary" />}
              {docType === 'video' && <Play className="h-5 w-5 text-primary" />}
              {docType === 'audio' && <Volume2 className="h-5 w-5 text-primary" />}
              {docType === 'text' && <Download className="h-5 w-5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">{doc.name}</h2>
              {doc.size && (
                <p className="text-sm text-muted-foreground">{formatFileSize(doc.size)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Скачать
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 min-h-0 flex flex-col">
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Загрузка файла...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <p className="text-destructive mb-2">{error}</p>
                <p className="text-sm text-muted-foreground">Не удалось загрузить файл</p>
              </div>
            </div>
          )}

          {!loading && !error && previewUrl && (
            <div className="flex-1 flex flex-col items-center justify-center min-h-0">
              {/* PDF */}
              {docType === 'pdf' && (
                <div className="w-full flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-center gap-4 mb-4 pb-4 border-b border-border/60 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPdfScale(Math.max(0.5, pdfScale - 0.25))}
                      disabled={pdfScale <= 0.5}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[60px] text-center">{Math.round(pdfScale * 100)}%</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPdfScale(Math.min(2.5, pdfScale + 0.25))}
                      disabled={pdfScale >= 2.5}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    {pdfNumPages > 1 && (
                      <>
                        <div className="w-px h-6 bg-border/60" />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPdfPageNumber(Math.max(1, pdfPageNumber - 1))}
                          disabled={pdfPageNumber <= 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-medium min-w-[80px] text-center">
                          {pdfPageNumber} / {pdfNumPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPdfPageNumber(Math.min(pdfNumPages, pdfPageNumber + 1))}
                          disabled={pdfPageNumber >= pdfNumPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto flex items-start justify-center">
                    <Document
                      file={previewUrl}
                      onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                      className="pdf-document"
                      loading={<div className="text-muted-foreground">Загрузка PDF...</div>}
                      error={<div className="text-destructive">Ошибка загрузки PDF</div>}
                    >
                      <Page
                        pageNumber={pdfPageNumber}
                        scale={pdfScale}
                        className="shadow-lg"
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </Document>
                  </div>
                </div>
              )}

              {/* Image */}
              {docType === 'image' && (
                <div className="flex items-center justify-center w-full">
                  <img
                    src={previewUrl}
                    alt={doc.name}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                  />
                </div>
              )}

              {/* Video */}
              {docType === 'video' && (
                <div className="flex items-center justify-center w-full">
                  <video
                    src={previewUrl}
                    controls
                    className="max-w-full max-h-[70vh] rounded-lg shadow-lg"
                  />
                </div>
              )}

              {/* Audio */}
              {docType === 'audio' && (
                <div className="flex flex-col items-center justify-center w-full gap-6">
                  <div className="flex items-center justify-center w-24 h-24 rounded-full bg-primary/10">
                    {audioPlaying ? (
                      <Volume2 className="h-12 w-12 text-primary" />
                    ) : (
                      <Play className="h-12 w-12 text-primary ml-1" />
                    )}
                  </div>
                  <audio
                    ref={audioRef}
                    src={previewUrl}
                    controls
                    className="w-full max-w-md"
                    onPlay={() => setAudioPlaying(true)}
                    onPause={() => setAudioPlaying(false)}
                    onEnded={() => setAudioPlaying(false)}
                  />
                </div>
              )}

              {/* Text */}
              {docType === 'text' && (
                <div className="w-full">
                  <div className="bg-muted/50 rounded-lg p-4 overflow-auto max-h-[70vh]">
                    <pre className="text-sm font-mono whitespace-pre-wrap break-all">{previewUrl}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border/60 shrink-0">
          <p className="text-sm text-muted-foreground">
            {docType === 'pdf' && 'PDF документ'}
            {docType === 'image' && 'Изображение'}
            {docType === 'video' && 'Видео файл'}
            {docType === 'audio' && 'Аудио файл'}
            {docType === 'text' && 'Текстовый файл'}
          </p>
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  )
}
