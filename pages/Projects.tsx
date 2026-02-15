import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Input } from '@/components/ui/Input'
import {
  FolderKanban, Plus, Search, Loader2, ChevronDown, ChevronUp,
  Calendar, Users, CircleDot, CheckCircle2, Clock, Crown,
} from 'lucide-react'
import { CreateProjectModal } from '@/components/modals/CreateProjectModal'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch {}
  }
  return headers
}

export interface ProjectMember {
  id: string
  first_name: string
  last_name: string
  position: string
  role: 'lead' | 'member'
}

export interface Project {
  id: string
  name: string
  full_name?: string
  description?: string
  status: 'active' | 'completed' | 'paused'
  start_date?: string
  end_date?: string
  member_count: number
  members: ProjectMember[]
  created_at: string
}

const statusConfig = {
  active:    { label: 'Активный', icon: CircleDot,    variant: 'success'   as const, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  completed: { label: 'Завершён', icon: CheckCircle2, variant: 'default'   as const, color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
  paused:    { label: 'На паузе', icon: Clock,        variant: 'warning'   as const, color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
]
function avatarColor(id: string) {
  const n = parseInt(id, 10) || 0
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

const STATUS_FILTERS = [
  { value: '',          label: 'Все' },
  { value: 'active',    label: 'Активные' },
  { value: 'paused',    label: 'На паузе' },
  { value: 'completed', label: 'Завершённые' },
]

function formatDateShort(dateStr?: string) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Project card with expand/collapse ──────────────────────────────────────
function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  const cfg = statusConfig[project.status] ?? statusConfig.active
  const StatusIcon = cfg.icon
  const leads = project.members.filter((m) => m.role === 'lead')
  const participants = project.members.filter((m) => m.role === 'member')

  const PREVIEW_LIMIT = 3
  const previewLeads = leads.slice(0, PREVIEW_LIMIT)
  const previewParticipants = participants.slice(0, PREVIEW_LIMIT)
  const extraLeads = leads.length - PREVIEW_LIMIT
  const extraParticipants = participants.length - PREVIEW_LIMIT

  return (
    <Card className="overflow-hidden hover:border-primary/30 transition-colors duration-200">
      {/* Collapsed header — always visible */}
      <button
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="flex items-center justify-center w-10 h-10 rounded-xl gradient-primary shrink-0 shadow-sm">
              <FolderKanban className="h-5 w-5 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base">{project.name}</h3>
              {project.full_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{project.full_name}</p>
              )}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color} w-fit mt-1`}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>

              {project.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
                {(project.start_date || project.end_date) && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDateShort(project.start_date)}
                    {project.end_date && ` — ${formatDateShort(project.end_date)}`}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {project.member_count} участн.
                </span>
              </div>
            </div>

            <div className="shrink-0 text-muted-foreground">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardContent>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/40 px-5 pb-5 pt-4 space-y-4 animate-in fade-in duration-200">
          {project.description && (
            <p className="text-sm text-muted-foreground">{project.description}</p>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Leads */}
            {leads.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Crown className="h-3.5 w-3.5 text-amber-500" />
                  Руководители
                </p>
                <div className="space-y-2">
                  {previewLeads.map((m) => (
                    <MemberRow key={m.id} member={m} />
                  ))}
                  {extraLeads > 0 && (
                    <p className="text-xs text-muted-foreground pl-1">+ ещё {extraLeads}</p>
                  )}
                </div>
              </div>
            )}

            {/* Participants */}
            {participants.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  Участники
                </p>
                <div className="space-y-2">
                  {previewParticipants.map((m) => (
                    <MemberRow key={m.id} member={m} />
                  ))}
                  {extraParticipants > 0 && (
                    <p className="text-xs text-muted-foreground pl-1">+ ещё {extraParticipants} сотрудников</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              Подробнее →
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function MemberRow({ member }: { member: ProjectMember }) {
  const color = avatarColor(member.id)
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className={`bg-gradient-to-br ${color} text-white text-xs font-semibold`}>
          {member.first_name?.[0]}{member.last_name?.[0]}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {member.last_name} {member.first_name}
        </div>
        <div className="text-xs text-muted-foreground truncate">{member.position}</div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export function Projects() {
  const { user } = useAuthStore()
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
      const res = await fetch(`${API_BASE_URL}/projects?${params}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Не удалось загрузить проекты')
      setProjects(await res.json())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [statusFilter])

  // Client-side search for instant feedback
  const filtered = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  const handleCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev])
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Проекты</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? 'Загрузка…' : `${projects.length} проектов`}
          </p>
        </div>
        <Button className="gap-2 self-start sm:self-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Создать проект
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по названию или описанию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-muted/60 w-fit self-start">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                statusFilter === f.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
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
            <Button variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>
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
