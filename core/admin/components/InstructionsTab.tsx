import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Film, Loader2, Pencil, Plus, Trash2, Upload, X, ImageIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Switch } from '@/shared/components/ui/Switch'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { apiDelete, apiGet } from '@/shared/lib/apiClient'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  INSTRUCTION_AUDIENCES,
  INSTRUCTION_PLACEMENTS,
  useInstructionsStore,
  type InstructionAudience,
  type InstructionPlacement,
  type InstructionVideo,
} from '@/shared/components/InstructionVideos'

interface AdminInstruction extends InstructionVideo {
  isActive: boolean
  videoSize: number | null
  videoMime: string | null
  createdAt: string
  updatedAt: string
}

interface FormState {
  title: string
  description: string
  audience: InstructionAudience
  placement: InstructionPlacement | ''
  sortOrder: string
  isActive: boolean
  video: File | null
  poster: File | null
  removePoster: boolean
}

const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const MAX_POSTER_BYTES = 5 * 1024 * 1024

const formatSize = (bytes: number | null) => {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

const audienceLabel = (a: InstructionAudience) => INSTRUCTION_AUDIENCES.find((o) => o.value === a)?.label ?? a
const placementLabel = (p: InstructionPlacement | null) => (p ? INSTRUCTION_PLACEMENTS.find((o) => o.value === p)?.label ?? p : 'Только дашборд')

function emptyForm(nextOrder: number): FormState {
  return { title: '', description: '', audience: 'all', placement: '', sortOrder: String(nextOrder), isActive: true, video: null, poster: null, removePoster: false }
}

function formFromInstruction(i: AdminInstruction): FormState {
  return {
    title: i.title,
    description: i.description ?? '',
    audience: i.audience,
    placement: i.placement ?? '',
    sortOrder: String(i.sortOrder),
    isActive: i.isActive,
    video: null,
    poster: null,
    removePoster: false,
  }
}

function sendInstruction(method: 'POST' | 'PUT', path: string, form: FormData, onProgress: (percent: number) => void): Promise<AdminInstruction> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, `${API_BASE_URL}${path}`)
    xhr.withCredentials = true
    for (const [k, v] of Object.entries(getAuthHeaders())) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let data: unknown = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = null
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as AdminInstruction)
      else if (xhr.status === 413) reject(new Error('Файл слишком большой для сервера'))
      else reject(new Error((data as { error?: string } | null)?.error || 'Не удалось сохранить инструкцию'))
    }
    xhr.onerror = () => reject(new Error('Не удалось связаться с сервером'))
    xhr.send(form)
  })
}

function FilePicker({
  label, hint, accept, file, onChange, icon: Icon,
}: {
  label: string
  hint: string
  accept: string
  file: File | null
  onChange: (f: File | null) => void
  icon: React.ComponentType<{ className?: string }>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-3 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <Upload className="h-4 w-4" />
          Выбрать файл
        </button>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function InstructionFormModal({
  editing, nextOrder, onClose, onSaved,
}: {
  editing: AdminInstruction | null
  nextOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  useModalOpen(true)
  const [form, setForm] = useState<FormState>(() => (editing ? formFromInstruction(editing) : emptyForm(nextOrder)))
  const [progress, setProgress] = useState<number | null>(null)
  const saving = progress !== null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, saving])

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Укажите название инструкции')
      return
    }
    if (!editing && !form.video) {
      toast.error('Прикрепите видеофайл')
      return
    }
    if (form.video && form.video.size > MAX_VIDEO_BYTES) {
      toast.error('Видео не должно превышать 500 МБ')
      return
    }
    if (form.poster && form.poster.size > MAX_POSTER_BYTES) {
      toast.error('Обложка не должна превышать 5 МБ')
      return
    }
    const data = new FormData()
    data.append('title', form.title.trim())
    data.append('description', form.description.trim())
    data.append('audience', form.audience)
    data.append('placement', form.placement)
    data.append('sortOrder', form.sortOrder || '0')
    data.append('isActive', String(form.isActive))
    if (form.video) data.append('video', form.video)
    if (form.poster) data.append('poster', form.poster)
    if (!form.poster && form.removePoster) data.append('removePoster', 'true')

    setProgress(0)
    try {
      if (editing) await sendInstruction('PUT', `/instructions/admin/${editing.id}`, data, setProgress)
      else await sendInstruction('POST', '/instructions/admin', data, setProgress)
      toast.success(editing ? 'Инструкция сохранена' : 'Инструкция загружена')
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err))
      setProgress(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={() => !saving && onClose()} />
      <Card className="relative flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden p-0 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Film className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">{editing ? 'Изменить инструкцию' : 'Новая видеоинструкция'}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto scrollbar-thin overscroll-contain p-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Название</label>
            <Input value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Напр. «Как оформить заявку на отпуск»" maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Описание (необязательно)</label>
            <textarea
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
              placeholder="Кратко: что показано в видео"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Кому показывать</label>
              <select
                value={form.audience}
                onChange={(e) => patch({ audience: e.target.value as InstructionAudience })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                {INSTRUCTION_AUDIENCES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Порядок</label>
              <Input type="number" value={form.sortOrder} onChange={(e) => patch({ sortOrder: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Где ещё показывать</label>
            <select
              value={form.placement}
              onChange={(e) => patch({ placement: e.target.value as InstructionPlacement | '' })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
            >
              <option value="">Только на дашборде</option>
              {INSTRUCTION_PLACEMENTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Все инструкции показываются на дашборде; здесь можно добавить видео в раздел окна «Как это работает»</p>
          </div>

          <FilePicker
            label={editing ? 'Заменить видео' : 'Видео'}
            hint={editing ? 'Оставьте пустым, чтобы сохранить текущее видео. MP4 или WebM, до 500 МБ' : 'MP4 или WebM, до 500 МБ'}
            accept="video/mp4,video/webm"
            file={form.video}
            onChange={(video) => patch({ video })}
            icon={Film}
          />
          <FilePicker
            label={editing?.poster ? 'Заменить обложку' : 'Обложка (необязательно)'}
            hint="Картинка до запуска видео. JPEG, PNG или WebP, до 5 МБ"
            accept="image/jpeg,image/png,image/webp"
            file={form.poster}
            onChange={(poster) => patch({ poster, removePoster: false })}
            icon={ImageIcon}
          />
          {editing?.poster && !form.poster && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={form.removePoster} onChange={(e) => patch({ removePoster: e.target.checked })} className="h-4 w-4 rounded border-input accent-primary" />
              Удалить текущую обложку
            </label>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Показывать пользователям</p>
              <p className="text-xs text-muted-foreground">Выключенная инструкция скрыта, но не удалена</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(isActive) => patch({ isActive })} />
          </div>
        </div>

        <div className="border-t border-border p-4 shrink-0 space-y-3">
          {saving && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress < 100 ? 'Загрузка файла…' : 'Сохранение…'}</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? 'Сохранить' : 'Загрузить'}
            </Button>
          </div>
        </div>
      </Card>
    </div>,
    document.body,
  )
}

export function InstructionsTab() {
  const [items, setItems] = useState<AdminInstruction[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminInstruction | null>(null)
  const reloadPublic = useInstructionsStore((s) => s.load)

  const fetchItems = useCallback(async () => {
    try {
      setItems(await apiGet<AdminInstruction[]>('/instructions/admin'))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const afterChange = async () => {
    await fetchItems()
    reloadPublic(true)
  }

  const toggleActive = async (item: AdminInstruction, isActive: boolean) => {
    const data = new FormData()
    data.append('isActive', String(isActive))
    try {
      await sendInstruction('PUT', `/instructions/admin/${item.id}`, data, () => {})
      toast.success(isActive ? 'Инструкция показывается' : 'Инструкция скрыта')
      afterChange()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleDelete = async (item: AdminInstruction) => {
    if (!(await confirmDialog({ title: 'Удалить инструкцию', message: `Удалить «${item.title}»? Видео и обложка будут удалены из хранилища.`, confirmText: 'Удалить', variant: 'danger' }))) return
    try {
      await apiDelete(`/instructions/admin/${item.id}`)
      toast.success('Инструкция удалена')
      afterChange()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sortOrder)) + 1 : 1

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Film className="h-5 w-5" />
              Видеоинструкции
            </CardTitle>
            <CardDescription>
              Показываются на дашборде всех организаций; инструкции «для руководителей» видят manager, HR и администраторы
            </CardDescription>
          </div>
          <Button onClick={() => { setEditing(null); setFormOpen(true) }} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Добавить инструкцию
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
            Инструкций пока нет — загрузите первое видео
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-4 rounded-xl border border-border p-3 sm:flex-row">
                <video
                  src={item.src}
                  poster={item.poster ?? undefined}
                  controls
                  preload={item.poster ? 'none' : 'metadata'}
                  className="aspect-[16/10] w-full shrink-0 rounded-lg border border-border bg-black object-contain sm:w-64"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-snug">{item.title}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch checked={item.isActive} onCheckedChange={(v) => toggleActive(item, v)} title={item.isActive ? 'Скрыть' : 'Показывать'} />
                      <button
                        type="button"
                        onClick={() => { setEditing(item); setFormOpen(true) }}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Изменить"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                  <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
                    <span className={item.audience === 'manager' ? 'rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400' : 'rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary'}>
                      {audienceLabel(item.audience)}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{placementLabel(item.placement)}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Порядок: {item.sortOrder}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{formatSize(item.videoSize)}</span>
                    {!item.isActive && <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">Скрыта</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {formOpen && (
        <InstructionFormModal
          editing={editing}
          nextOrder={nextOrder}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); afterChange() }}
        />
      )}

    </Card>
  )
}
