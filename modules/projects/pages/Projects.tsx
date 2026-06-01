import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { Input } from '@/shared/components/ui/Input'
import {
  FolderKanban, Plus, Search,
  Calendar, Users, CircleDot, CheckCircle2, Clock,
  ArrowRight, Sparkles, Crown,
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
  active:    { label: 'Активный', icon: CircleDot,    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500', bar: 'from-emerald-500/20 to-emerald-500/0' },
  completed: { label: 'Завершён', icon: CheckCircle2, color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-500/10',    dot: 'bg-blue-500',    bar: 'from-blue-500/20 to-blue-500/0' },
  paused:    { label: 'На паузе', icon: Clock,        color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-500/10',   dot: 'bg-amber-500',   bar: 'from-amber-500/20 to-amber-500/0' },
}

const STATUS_FILTERS = [
  { value: '',          label: 'Все' },
  { value: 'active',    label: 'Активные' },
  { value: 'paused',    label: 'На паузе' },
  { value: 'completed', label: 'Завершённые' },
]

const projectColors = [
  { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', accent: 'from-violet-500/20 to-violet-500/0' },
  { bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', accent: 'from-indigo-500/20 to-indigo-500/0' },
  { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', accent: 'from-blue-500/20 to-blue-500/0' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', accent: 'from-cyan-500/20 to-cyan-500/0' },
  { bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', accent: 'from-teal-500/20 to-teal-500/0' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', accent: 'from-emerald-500/20 to-emerald-500/0' },
  { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', accent: 'from-amber-500/20 to-amber-500/0' },
  { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', accent: 'from-rose-500/20 to-rose-500/0' },
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

function pluralize(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const navigate = useNavigate()

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

  const activeCount = useMemo(() => projects.filter((p) => p.status === 'active').length, [projects])
  const pausedCount = useMemo(() => projects.filter((p) => p.status === 'paused').length, [projects])
  const completedCount = useMemo(() => projects.filter((p) => p.status === 'completed').length, [projects])
  const totalMembers = useMemo(() => projects.reduce((s, p) => s + p.member_count, 0), [projects])

  const topProjects = useMemo(() =>
    [...projects].sort((a, b) => b.member_count - a.member_count).slice(0, 3),
    [projects]
  )

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="h-48 rounded-2xl gradient-primary animate-pulse" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-white/60" />
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Управление</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Проекты</h1>
            <p className="mt-2 text-white/45 text-sm">Создавайте проекты и управляйте командной работой</p>
          </div>
        </div>
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 mb-4">
            <FolderKanban className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-lg font-semibold text-muted-foreground/80">Проектов пока нет</p>
          <p className="text-sm text-muted-foreground/50 mt-1">Создайте первый проект, чтобы начать работу</p>
          <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Создать проект
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-white/3 rounded-full blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-white/60" />
            <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Управление</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Проекты</h1>
          <p className="mt-2 text-white/45 text-sm">
            {projects.length} {pluralize(projects.length, 'проект', 'проекта', 'проектов')} · {totalMembers} участников
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-sm font-medium">
              {filtered.length} {pluralize(filtered.length, 'проект', 'проекта', 'проектов')}
            </span>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-muted/60">
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
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              className="pl-10 h-10"
              placeholder="Поиск по названию или описанию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button className="shrink-0 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Создать
          </Button>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 page-grid">
          {filtered.map((project, index) => {
            const color = projectColors[index % projectColors.length]
            const cfg = statusConfig[project.status] ?? statusConfig.active
            const leads = project.members.filter((m) => m.role === 'lead')
            const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'
            return (
              <Card
                key={project.id}
                className={`hover-lift group cursor-pointer animate-slide-up ${staggerClass}`}
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <CardContent className="p-0">
                  <div className={`h-1.5 rounded-t-2xl bg-gradient-to-r ${cfg.bar}`} />
                  <div className="p-5 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`h-12 w-12 shrink-0 rounded-xl ${color.bg} flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
                        <FolderKanban className={`h-6 w-6 ${color.text}`} />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200 mt-1" />
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-[15px] leading-tight group-hover:text-primary transition-colors duration-200 truncate">
                          {project.name}
                        </h3>
                      </div>
                      {project.full_name && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{project.full_name}</p>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2 min-h-[2.5rem]">
                      {project.description || 'Без описания'}
                    </p>

                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5', cfg.bg, cfg.color)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                        {cfg.label}
                      </span>
                      {(project.start_date || project.end_date) && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDateShort(project.start_date)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {leads.length > 0 && (
                          <div className="flex -space-x-1.5">
                            {leads.slice(0, 3).map((m) => (
                              <Avatar key={m.id} className="h-6 w-6 ring-2 ring-background">
                                <AvatarImage src={m.avatar || generateAvatarUrl(m.id, m.gender)} alt={`${m.first_name} ${m.last_name}`} />
                                <AvatarFallback className={cn('bg-gradient-to-br text-white text-[9px] font-semibold', getAvatarColor(m.id))}>
                                  {m.first_name?.[0]}{m.last_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {project.member_count}
                        </span>
                      </div>
                      {leads.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Crown className="h-3 w-3 text-primary/50" />
                          <span className="truncate max-w-[120px]">{leads[0].last_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 mb-4">
            <FolderKanban className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground/70">
            {search || statusFilter ? 'Проекты не найдены по запросу' : 'Проекты не найдены'}
          </p>
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
