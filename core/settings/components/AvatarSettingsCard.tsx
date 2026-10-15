import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2, RefreshCw, Trash2, UserCircle } from 'lucide-react'
import { CollapsibleCard } from '@/shared/components/ui/CollapsibleCard'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarImage } from '@/shared/components/ui/Avatar'
import { AvatarCropModal } from '@/shared/components/AvatarCropModal'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { useAuthStore } from '@/core/auth/store/authStore'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'

const VARIANTS = 8
const randomSeeds = () => Array.from({ length: VARIANTS }, () => Math.random().toString(36).slice(2, 10))

function svgToPng(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 256, 256)
        ctx.drawImage(img, 0, 0, 256, 256)
      }
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось подготовить изображение'))), 'image/png')
    }
    img.onerror = () => reject(new Error('Не удалось подготовить изображение'))
    img.src = src
  })
}

export function AvatarSettingsCard() {
  const { user, updateUser } = useAuthStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [seeds, setSeeds] = useState(randomSeeds)
  const [busy, setBusy] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  if (!user) return null
  const current = user.avatar || generateAvatarUrl(user.id, user.gender)

  const upload = async (blob: Blob, fileName: string, key: string) => {
    setBusy(key)
    try {
      const formData = new FormData()
      formData.append('avatar', blob, fileName)
      const res = await fetch(`${API_BASE_URL}/users/me/avatar`, { method: 'POST', headers: getAuthHeaders(), body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Не удалось сохранить аватар')
      }
      const data = await res.json()
      updateUser({ avatar: data.avatar })
      toast.success('Аватар обновлён')
      return true
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  const closeCrop = () => setCropSrc((prev) => {
    if (prev) URL.revokeObjectURL(prev)
    return null
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (максимум 5 МБ)')
      return
    }
    setCropSrc(URL.createObjectURL(file))
  }

  const pickGenerated = async (seed: string) => {
    try {
      const blob = await svgToPng(generateAvatarUrl(seed))
      await upload(blob, 'avatar.png', seed)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  const reset = async () => {
    const confirmed = await confirmDialog({
      title: 'Сбросить аватар?',
      message: 'Вместо текущего аватара будет показана стандартная автоматическая аватарка.',
      confirmText: 'Сбросить',
      variant: 'danger',
    })
    if (!confirmed) return
    setBusy('reset')
    try {
      const res = await fetch(`${API_BASE_URL}/users/me/avatar`, { method: 'DELETE', headers: getAuthHeaders() })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Не удалось сбросить аватар')
      }
      updateUser({ avatar: undefined })
      toast.success('Аватар сброшен')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <CollapsibleCard
      id="settings_avatar"
      icon={<UserCircle className="h-5 w-5" />}
      title="Аватар"
      description="Загрузите фотографию или выберите сгенерированную аватарку"
    >
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-4 ring-primary/15">
            <AvatarImage src={current} alt="" />
          </Avatar>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-2" disabled={busy !== null} onClick={() => inputRef.current?.click()}>
              <Camera className="h-4 w-4" />
              Загрузить фото
            </Button>
            {user.avatar && (
              <Button size="sm" variant="ghost" className="gap-2" disabled={busy !== null} onClick={reset}>
                {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Сбросить
              </Button>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Сгенерированные аватарки</p>
            <Button size="sm" variant="ghost" className="gap-1.5 h-8" disabled={busy !== null} onClick={() => setSeeds(randomSeeds())}>
              <RefreshCw className="h-3.5 w-3.5" />
              Другие варианты
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {seeds.map((seed) => (
              <button
                key={seed}
                type="button"
                disabled={busy !== null}
                onClick={() => pickGenerated(seed)}
                aria-label="Выбрать эту аватарку"
                className="relative aspect-square rounded-xl border border-border bg-muted/40 p-1.5 transition hover:border-primary hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60"
              >
                <img src={generateAvatarUrl(seed)} alt="" className="h-full w-full" />
                {busy === seed && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

      <AvatarCropModal
        isOpen={cropSrc !== null}
        imageSrc={cropSrc}
        uploading={busy === 'crop'}
        onCancel={closeCrop}
        onConfirm={async (blob) => {
          if (await upload(blob, 'avatar.jpg', 'crop')) closeCrop()
        }}
      />
    </CollapsibleCard>
  )
}
