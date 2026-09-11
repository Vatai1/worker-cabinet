import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Crop, X, ZoomIn, ZoomOut, Check, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { useModalOpen } from '@/shared/hooks/useModalOpen'

interface AvatarCropModalProps {
  isOpen: boolean
  imageSrc: string | null
  uploading: boolean
  onCancel: () => void
  onConfirm: (blob: Blob) => void | Promise<void>
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', () => reject(new Error('Не удалось загрузить изображение')))
    img.src = src
  })
}

async function getCroppedImageBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = area.width
  canvas.height = area.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не удалось обработать изображение')
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Не удалось обработать изображение'))
    }, 'image/jpeg', 0.92)
  })
}

export function AvatarCropModal({ isOpen, imageSrc, uploading, onCancel, onConfirm }: AvatarCropModalProps) {
  useModalOpen(isOpen)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  if (!isOpen || !imageSrc) return null

  const handleConfirm = async () => {
    if (!croppedArea) return
    setProcessing(true)
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedArea)
      await onConfirm(blob)
    } finally {
      setProcessing(false)
    }
  }

  const busy = uploading || processing

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Crop className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Новое фото</h2>
              <p className="text-xs text-muted-foreground">Выберите область и масштаб</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative h-80 w-full bg-muted/40">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setCroppedArea(pixels)}
          />
        </div>

        <div className="space-y-4 border-t border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              Отмена
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={busy || !croppedArea}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {busy ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
