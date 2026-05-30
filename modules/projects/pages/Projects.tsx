import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { Input } from '@/shared/components/ui/Input'
import {
  FolderKanban, Plus, Search, Loader2,
  Calendar, Users, CircleDot, CheckCircle2, Clock,
  ArrowRight, Layers,
} from 'lucide-react'
import { CreateProjectModal } from '@/modules/projects/components/modals/CreateProjectModal'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAvatarColor } from '@/shared/lib/constants'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import type { ProjectMember as ProjectMemberType } from '@/shared/types'

export type { ProjectMemberType as ProjectMember }

export interface Project {
  id: string
  name: string
  full_name?: string
  description?: string
  status: 'active' | 'completed' | 'paused'
  start_date?: string
  end_date?: string
  member_count: number
  members: ProjectMemberType[]
  created_at: string
  created_by?: string
}

const statusConfig = {
  active:    { label: 'Активный', icon: CircleDot,    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', dot: 'bg-emerald-500', bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400' },
  completed: { label: 'Завершён', icon: CheckCircle2, color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-950/30',       dot: 'bg-blue-500',    bar: 'bg-gradient-to-r from-blue-500 to-blue-400' },
  paused:    { label: 'На паузе', icon: Clock,        color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-950/30',     dot: 'bg-amber-500',   bar: 'bg-gradient-to-r from-amber-500 to-amber-400' },
}

const STATUS_FILTERS = [
  { value: '',          label: 'Все' },
  { value: 'active',    label: 'Активные' },
  { value: 'paused',    label: 'На паузе' },
  { value: 'completed', label: 'Завершённые' },
]

const PROJECT_GRADIENTS = [
  'from-violet-500/10 to-purple-500/5',
  'from-blue-500/10 to-cyan-500/5',
  'from-emerald-500/10 to-teal-500/5',
  'from-rose-500/10 to-pink-500/5',
  'from-amber-500/10 to-orange-500/5',
  'from-indigo-500/10 to-blue-500/5',
  'from-fuchsia-500/10 to-purple-500/5',
  'from-sky-500/10 to-blue-500/5',
]

function formatDateShort(dateStr?: string) {
  if (!dateStr) return null
  if (!dateStr.includes('T')) {
    const [year, month, day] = dateStr.split('-').map(Number)
    const localDate = new Date(year, month - 1, day)
    return localDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getProgress(project: Project) {
  if (project.status === 'completed') return 100
  if (!project.start_date || !project.end_date) return null
  const start = new Date(project.start_date).getTime()
  const end = new Date(project.end_date).getTime()
  const now = Date.now()
  if (project.status === 'paused') return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
}

function getDaysLeft(endDate?: string) {
  if (!endDate) return null
  const end = new Date(endDate).getTime()
  const diff = Math.ceil((end - Date.now()) / 86400000)
  if (diff < 0) return 'Просрочен'
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return '1 день'
  if (diff < 5) return `${diff} дня`
  if (diff < 21) return `${diff} дней`
  return `${diff} дн.`
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const navigate = useNavigate()
  const cfg = statusConfig[project.status] ?? statusConfig.active
  const leads = project.members.filter((m) => m.role === 'lead')
  const gradient = PROJECT_GRADIENTS[index % PROJECT_GRADIENTS.length]
  const progress = getProgress(project)
  const daysLeft = project.status === 'active' ? getDaysLeft(project.end_date) : null

  return (
    <button
      className={cn(
        'group relative w-full text-left rounded-2xl border border-border/50 bg-card',
        'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
        'transition-all duration-300 overflow-hidden',
      )}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1', cfg.bar)} />

      <div className={cn('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br', gradient)} />

      <div className="relative p-5">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 shrink-0 group-hover:bg-primary/15 transition-colors">
            <FolderKanban className="h-5 w-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                  {project.name}
                </h3>
                {project.full_name && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{project.full_name}</p>
                )}
              </div>
              <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0', cfg.bg, cfg.color)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
            </div>

            {project.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{project.description}</p>
            )}

            {progress !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Прогресс</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', cfg.bar)}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {(project.start_date || project.end_date) && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDateShort(project.start_date)}
                    {project.end_date && ` — ${formatDateShort(project.end_date)}`}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {leads.slice(0, 2).map((m) => (
                    <Avatar key={m.id} className="h-7 w-7 ring-2 ring-background">
                      <AvatarImage src={m.avatar || generateAvatarUrl(m.id, m.gender)} alt={`${m.first_name} ${m.last_name}`} />
                      <AvatarFallback className={cn('bg-gradient-to-br text-white text-[10px] font-semibold', getAvatarColor(m.id))}>
                        {m.first_name?.[0]}{m.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {project.member_count > 2 && (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
                      +{project.member_count - 2}
                    </div>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {project.member_count}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {daysLeft && (
                  <span className={cn(
                    'text-xs font-medium',
                    daysLeft === 'Просрочен' ? 'text-red-500' : 'text-muted-foreground'
                  )}>
                    {daysLeft === 'Просрочен' ? 'Просрочен' : `${daysLeft} ост.`}
                  </span>
                )}
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search)       params.set('search', search)
      const res = await fetch(`${API_BASE_URL}/projects?${params}`, { headers: getAuthHeadersWithContentType() })
      if (!res.ok) throw new Error('Не удалось загрузить проекты')
      setProjects(await res.json())
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [statusFilter])

  const filtered = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  const handleCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev])
  }

  const activeCount = projects.filter((p) => p.status === 'active').length
  const pausedCount = projects.filter((p) => p.status === 'paused').length
  const completedCount = projects.filter((p) => p.status === 'completed').length

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 bg-primary/10 rounded-xl">
              <Layers className="h-5 w-5 text-primary" />
            </span>
            Проекты
          </h1>
          <p className="text-muted-foreground mt-1 ml-12">
            {loading ? 'Загрузка...' : `${projects.length} проектов`}
          </p>
        </div>
        <Button className="gap-2 self-start sm:self-auto interactive" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Создать проект
        </Button>
      </div>

      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/50 bg-card p-3.5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold">{projects.length}</p>
              <p className="text-[11px] text-muted-foreground">Всего</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-3.5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <CircleDot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold">{activeCount}</p>
              <p className="text-[11px] text-muted-foreground">Активных</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-3.5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold">{pausedCount}</p>
              <p className="text-[11px] text-muted-foreground">На паузе</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-3.5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold">{completedCount}</p>
              <p className="text-[11px] text-muted-foreground">Завершённых</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по названию или описанию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-muted/60 w-fit self-start">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'interactive px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap',
                statusFilter === f.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <FolderKanban className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            {search || statusFilter ? 'Проектов не найдено' : 'Проектов пока нет'}
          </p>
          {!search && !statusFilter && (
            <Button variant="outline" className="mt-4 interactive" onClick={() => setCreateOpen(true)}>
              Создать первый проект
            </Button>
          )}
        </div>
      )}

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
