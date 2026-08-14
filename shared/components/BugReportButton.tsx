import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Bug, X, Loader2, Camera, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { cn } from '@/shared/lib/utils'

export function BugReportButton({ collapsed = false }: { collapsed?: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'open'>('idle')
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const captureScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as MediaTrackConstraints,
        audio: false,
      })
      const track = stream.getVideoTracks()[0]
      await new Promise((resolve) => {
        if (track.readyState === 'live') return resolve(null)
        track.addEventListener('live', resolve, { once: true })
        setTimeout(resolve, 500)
      })
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()

      const w = video.videoWidth
      const h = video.videoHeight
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0)

      track.stop()
      stream.getTracks().forEach((t) => t.stop())

      const blob: Blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png')
      })
      return blob
    } catch {
      return null
    }
  }

  const handleClick = async () => {
    const blob = await captureScreen()
    if (blob) {
      setScreenshotBlob(blob)
      setScreenshotUrl(URL.createObjectURL(blob))
    }
    setPhase('open')
  }

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('title', title.trim())
      formData.append('description', description)
      formData.append('page_url', window.location.href)
      formData.append('browser_info', navigator.userAgent)
      if (screenshotBlob) formData.append('screenshot', screenshotBlob, 'screenshot.png')

      const res = await fetch(`${API_BASE_URL}/bug-reports`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      if (!res.ok) throw new Error('Ошибка отправки')
      toast.success('Баг-репорт отправлен')
      handleClose()
    } catch {
      toast.error('Не удалось отправить баг-репорт')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (screenshotUrl) URL.revokeObjectURL(screenshotUrl)
    setPhase('idle')
    setTitle('')
    setDescription('')
    setScreenshotBlob(null)
    setScreenshotUrl(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Баг-репорт"
        className={cn(
          'flex items-center gap-2 rounded-lg text-sm font-medium transition-colors interactive',
          collapsed
            ? 'justify-center p-2 text-muted-foreground hover:text-foreground'
            : 'px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <Bug className="h-4 w-4 shrink-0" />
        {!collapsed && <span>Баг-репорт</span>}
      </button>

      {phase === 'open' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-scale-in max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Bug className="h-5 w-5 text-primary" />
                Баг-репорт
              </h2>
              <button type="button" onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Заголовок <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                  placeholder="Кратко опишите проблему"
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">{title.length}/200</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Описание <span className="text-muted-foreground">(необязательно)</span></label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Подробное описание проблемы, шаги для воспроизведения..."
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />
                  Скриншот
                </label>
                {screenshotUrl ? (
                  <div className="relative group">
                    <img src={screenshotUrl} alt="Скриншот" className="w-full rounded-lg border border-border max-h-40 object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        if (screenshotUrl) URL.revokeObjectURL(screenshotUrl)
                        setScreenshotBlob(null)
                        setScreenshotUrl(null)
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground text-center">
                    Скриншот не приложен
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <span className="font-medium">Страница:</span> {window.location.pathname}
              </div>
            </div>

            <div className="p-5 border-t flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={handleClose}>Отмена</Button>
              <Button type="button" onClick={handleSubmit} disabled={!title.trim() || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Отправить
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
