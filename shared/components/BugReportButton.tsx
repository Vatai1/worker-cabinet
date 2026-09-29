import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import * as rasterizeHTML from 'rasterizehtml'
import { Bug, X, Loader2, Camera, Trash2, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { cn } from '@/shared/lib/utils'
import { useThemeStore } from '@/shared/theme/themeStore'

export function BugReportButton({ collapsed = false }: { collapsed?: boolean }) {
  const isCrct = useThemeStore((s) => s.activeTheme === 'crct')
  const [phase, setPhase] = useState<'idle' | 'open'>('idle')
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const canvasToJpegBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> => {
    const w = canvas.width
    if (w > 1920) {
      const scaled = document.createElement('canvas')
      scaled.width = 1920
      scaled.height = Math.round((canvas.height * 1920) / w)
      scaled.getContext('2d')!.drawImage(canvas, 0, 0, scaled.width, scaled.height)
      canvas = scaled
    }
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
  }

  const captureDom = async (): Promise<Blob | null> => {
    try {
      if (document.fonts?.ready) await document.fonts.ready
      const root = document.documentElement
      const clone = root.cloneNode(true) as HTMLElement
      const live = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
      const copies = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]
      live.forEach((el, i) => {
        const copy = copies[i]
        if (el instanceof HTMLInputElement) {
          if (el.type === 'checkbox' || el.type === 'radio') copy.toggleAttribute('checked', el.checked)
          else copy.setAttribute('value', el.value)
        } else if (el instanceof HTMLTextAreaElement) {
          copy.textContent = el.value
        } else if (el instanceof HTMLSelectElement) {
          copy.querySelectorAll('option').forEach((o, j) => o.toggleAttribute('selected', j === el.selectedIndex))
        }
        if (el.scrollTop || el.scrollLeft) {
          copy.style.overflow = 'hidden'
          for (const child of Array.from(copy.children) as HTMLElement[]) {
            child.style.translate = `${-el.scrollLeft}px ${-el.scrollTop}px`
          }
        }
      })
      clone.querySelectorAll('script, [data-bug-report-modal]').forEach((el) => el.remove())
      const style = document.createElement('style')
      style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }'
      clone.querySelector('head')?.appendChild(style)
      const width = window.innerWidth
      const height = window.innerHeight
      const zoom = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * zoom)
      canvas.height = Math.round(height * zoom)
      await rasterizeHTML.drawHTML(clone.outerHTML, canvas, { baseUrl: location.href, width, height, zoom })
      return await canvasToJpegBlob(canvas)
    } catch {
      return null
    }
  }

  const captureScreen = async (): Promise<Blob | null> => {
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

      return await canvasToJpegBlob(canvas)
    } catch {
      toast.info('Захват экрана отменён')
      return null
    }
  }

  const applyShot = (blob: Blob | null) => {
    if (screenshotUrl) URL.revokeObjectURL(screenshotUrl)
    setScreenshotBlob(blob)
    setScreenshotUrl(blob ? URL.createObjectURL(blob) : null)
  }

  const handleDomShot = async () => {
    setCapturing(true)
    applyShot(await captureDom())
    setCapturing(false)
  }

  const handlePickShot = async () => {
    setCapturing(true)
    applyShot(await captureScreen())
    setCapturing(false)
  }

  const handleClick = async () => {
    setCapturing(true)
    applyShot(await captureDom())
    setCapturing(false)
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
      if (screenshotBlob) formData.append('screenshot', screenshotBlob, 'screenshot.jpg')

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

  useEffect(() => {
    if (phase !== 'open') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Баг-репорт"
        className={cn(
          'flex items-center gap-2 rounded-lg text-sm font-medium transition-colors interactive',
          isCrct
            ? collapsed
              ? 'justify-center p-2 text-white/85 hover:text-white'
              : 'px-3 py-2 text-white/85 hover:bg-white/10 hover:text-white'
            : collapsed
              ? 'justify-center p-2 text-muted-foreground hover:text-foreground'
              : 'px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <Bug className="h-4 w-4 shrink-0" />
        {capturing && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
        {!collapsed && <span>Баг-репорт</span>}
      </button>

      {phase === 'open' && createPortal(
        <div data-bug-report-modal className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-scale-in max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Bug className="h-5 w-5 text-primary" />
                Баг-репорт
              </h2>
              <button type="button" onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-5 space-y-4">
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
                      disabled={capturing}
                      onClick={handleDomShot}
                      className="absolute top-2 left-2 p-1.5 rounded-lg bg-background/90 border border-border text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Переснять страницу"
                    >
                      {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    </button>
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
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleDomShot} disabled={capturing}>
                      {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                      Снять страницу
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handlePickShot} disabled={capturing}>
                      <Monitor className="h-3.5 w-3.5" />
                      Экран / окно
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <span className="font-medium">Страница:</span> {window.location.pathname}
              </div>
            </div>

            <div className="p-5 border-t flex justify-end gap-3 shrink-0">
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
