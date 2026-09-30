import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { Play, PlayCircle } from 'lucide-react'
import { apiGet } from '@/shared/lib/apiClient'
import { cn } from '@/shared/lib/utils'

export type InstructionPlacement = 'vacation-create' | 'vacation-transfer' | 'vacation-approve' | 'vacation-restrictions' | 'day-off-take' | 'day-off-grant'
export type InstructionAudience = 'all' | 'manager'

export const INSTRUCTION_PLACEMENTS: Array<{ value: InstructionPlacement; label: string }> = [
  { value: 'vacation-create', label: 'Отпуск → Создание заявления' },
  { value: 'vacation-transfer', label: 'Отпуск → Перенос отпуска' },
  { value: 'vacation-approve', label: 'Отпуск → Согласование заявки' },
  { value: 'vacation-restrictions', label: 'Отпуск → Пересечения отпусков' },
  { value: 'day-off-take', label: 'Отпуск → Как взять отгул' },
  { value: 'day-off-grant', label: 'Отпуск → Начисление отгулов' },
]

export const INSTRUCTION_AUDIENCES: Array<{ value: InstructionAudience; label: string }> = [
  { value: 'all', label: 'Все сотрудники' },
  { value: 'manager', label: 'Только руководители' },
]

export interface InstructionVideo {
  id: number
  title: string
  description: string | null
  audience: InstructionAudience
  placement: InstructionPlacement | null
  sortOrder: number
  src: string
  poster: string | null
}

const REFRESH_AFTER_MS = 60 * 60 * 1000

interface InstructionsStore {
  videos: InstructionVideo[]
  loaded: boolean
  loadedAt: number
  load: (force?: boolean) => Promise<void>
}

export const useInstructionsStore = create<InstructionsStore>((set, get) => ({
  videos: [],
  loaded: false,
  loadedAt: 0,
  load: async (force = false) => {
    if (!force && get().loaded && Date.now() - get().loadedAt < REFRESH_AFTER_MS) return
    try {
      const videos = await apiGet<InstructionVideo[]>('/instructions')
      set({ videos, loaded: true, loadedAt: Date.now() })
    } catch {
      set({ loaded: true, loadedAt: Date.now() })
    }
  },
}))

export function useInstructionVideos(): InstructionVideo[] {
  const videos = useInstructionsStore((s) => s.videos)
  const load = useInstructionsStore((s) => s.load)
  useEffect(() => {
    load()
  }, [load])
  return videos
}

export function InstructionVideoPlayer({ video, className }: { video: InstructionVideo; className?: string }) {
  const [started, setStarted] = useState(false)
  const frame = cn('aspect-[16/10] w-full overflow-hidden rounded-lg border border-border', className)

  if (!started && video.poster) {
    return (
      <button
        type="button"
        onClick={() => setStarted(true)}
        className={cn(frame, 'group relative block bg-white')}
        aria-label={`Смотреть: ${video.title}`}
      >
        <img src={video.poster} alt={video.title} className="h-full w-full object-contain" loading="lazy" />
        <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />
        <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-primary py-1.5 pl-2.5 pr-3.5 text-xs font-semibold text-primary-foreground shadow-lg transition-transform group-hover:scale-105">
          <Play className="h-3.5 w-3.5" fill="currentColor" />
          Смотреть
        </span>
      </button>
    )
  }

  return (
    <video
      className={cn(frame, 'bg-black object-contain')}
      src={video.src}
      poster={video.poster ?? undefined}
      controls
      autoPlay={started}
      preload={started ? 'auto' : 'metadata'}
      playsInline
    >
      Ваш браузер не поддерживает воспроизведение видео
    </video>
  )
}

export function InstructionVideoCard({ video }: { video: InstructionVideo }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/50 p-3">
      <InstructionVideoPlayer video={video} />
      <div className="flex items-start gap-2.5 px-1 pb-1">
        <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{video.title}</p>
          {video.description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{video.description}</p>}
        </div>
      </div>
    </div>
  )
}
