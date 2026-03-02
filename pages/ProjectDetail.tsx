import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import {
  ArrowLeft, Loader2, FolderKanban, Calendar, Users, Crown,
  CircleDot, CheckCircle2, Clock, Pencil, Trash2, UserPlus, FileText,
  Map, CalendarDays, LayoutGrid, Info, X, Flag, Diamond,
} from 'lucide-react'
import { EditProjectModal } from '@/components/modals/EditProjectModal'
import { AddMemberModal } from '@/components/modals/AddMemberModal'
import { MemberProjectInfoModal } from '@/components/modals/MemberProjectInfoModal'
import { ContextMenu } from '@/components/ui/ContextMenu'

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

interface Member {
  id: string
  first_name: string
  last_name: string
  position: string
  department_name?: string
  role: 'lead' | 'member'
  joined_at?: string
  description?: string
}

interface ProjectDetail {
  id: string
  name: string
  full_name?: string
  description?: string
  status: 'active' | 'completed' | 'paused'
  start_date?: string
  end_date?: string
  created_by: string
  created_at: string
  creator_first_name?: string
  creator_last_name?: string
  leads: Member[]
  participants: Member[]
  members: Member[]
}


const statusConfig = {
  active:    { label: 'Активный', icon: CircleDot,    color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', variant: 'success'   as const },
  completed: { label: 'Завершён', icon: CheckCircle2, color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30',       variant: 'default'   as const },
  paused:    { label: 'На паузе', icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30',     variant: 'warning'   as const },
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

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  // Parse date string considering local timezone
  const date = new Date(dateStr)
  // If the date string is in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS),
  // we need to ensure we display the correct local date
  if (dateStr.includes('T')) {
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
  }
  // For YYYY-MM-DD format, parse as local date to avoid timezone shift
  const [year, month, day] = dateStr.split('-').map(Number)
  const localDate = new Date(year, month - 1, day)
  return localDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}

function MemberCard({ member, canRemove, onRemove, onContextMenu }: {
  member: Member
  canRemove: boolean
  onRemove: (id: string) => void
  onContextMenu: (e: React.MouseEvent, member: Member) => void
}) {
  const color = avatarColor(member.id)
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:border-primary/20 transition-colors group cursor-pointer"
      onContextMenu={(e) => onContextMenu(e, member)}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className={`bg-gradient-to-br ${color} text-white text-xs font-bold`}>
            {member.first_name?.[0]}{member.last_name?.[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {member.last_name} {member.first_name}
          </div>
          <div className="text-xs text-muted-foreground truncate">{member.position}</div>
          {member.department_name && (
            <div className="text-xs text-muted-foreground/70 truncate">{member.department_name}</div>
          )}
        </div>
      </div>
      {canRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(member.id) }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
          title="Удалить из проекта"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [memberInfoOpen, setMemberInfoOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: Member } | null>(null)

  const fetchProject = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/projects/${id}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Проект не найден')
      const data = await res.json()
      setProject({
        ...data,
        leads:        data.members?.filter((m: Member) => m.role === 'lead') ?? [],
        participants: data.members?.filter((m: Member) => m.role === 'member') ?? [],
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (id) fetchProject() }, [id])

  const isLead = project?.leads.some((m) => String(m.id) === String(user?.id))
  const isAdmin = user?.role === 'admin' || user?.role === 'hr'
  const canManage = isLead || isAdmin

  const handleRemoveMember = async (memberId: string) => {
    if (!id) return
    try {
      await fetch(`${API_BASE_URL}/projects/${id}/members/${memberId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      fetchProject()
    } catch (err) {
      console.error('Error removing member:', err)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, member: Member) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, member })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleViewProfile = () => {
    if (contextMenu?.member) {
      navigate(`/employees/${contextMenu.member.id}`)
    }
  }

  const handleViewRole = () => {
    if (contextMenu?.member) {
      setSelectedMember(contextMenu.member)
      setMemberInfoOpen(true)
    }
  }

  const handleDelete = async () => {
    if (!id || !confirm('Удалить проект?')) return
    setDeleting(true)
    try {
      await fetch(`${API_BASE_URL}/projects/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      navigate('/projects')
    } catch (err) {
      console.error('Error deleting project:', err)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link to="/projects">
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Назад</Button>
        </Link>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-destructive font-medium">{error ?? 'Проект не найден'}</p>
        </div>
      </div>
    )
  }

  const cfg = statusConfig[project.status] ?? statusConfig.active
  const StatusIcon = cfg.icon

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
      <Link to="/projects">
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          К списку проектов
        </Button>
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-6 text-white shadow-glow">
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }}
        />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm shrink-0">
            <FolderKanban className="h-8 w-8 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.full_name && (
              <p className="text-white/80 text-sm mt-1">{project.full_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm`}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm">
                <Users className="h-3 w-3" />
                {project.members.length} участников
              </span>
              {project.start_date && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm">
                  <Calendar className="h-3 w-3" />
                  {formatDate(project.start_date)}
                  {project.end_date && ` — ${formatDate(project.end_date)}`}
                </span>
              )}
            </div>
          </div>

          {canManage && (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm"
                variant="outline"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Изменить
              </Button>
              <Button
                size="sm"
                className="bg-white/20 hover:bg-red-500/40 text-white border-white/30 backdrop-blur-sm"
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <InfoChip icon={<CircleDot className={`h-4 w-4 ${cfg.color}`} />} label="Статус" value={cfg.label} />
        <InfoChip icon={<Calendar className="h-4 w-4 text-primary" />} label="Начало" value={formatDate(project.start_date)} />
        <InfoChip icon={<Calendar className="h-4 w-4 text-primary" />} label="Окончание" value={formatDate(project.end_date)} />
      </div>

      {/* Description + Documents button */}
      {project.description ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Описание</CardTitle>
              <Link to={`/projects/${project.id}/documents`}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Документы
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-end">
          <Link to={`/projects/${project.id}/documents`}>
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Документы проекта
            </Button>
          </Link>
        </div>
      )}

      {/* Roadmap */}
      <RoadmapSection
        projectId={project.id}
        canManage={canManage}
        projectStartDate={project.start_date}
        projectEndDate={project.end_date}
      />

      {/* Members */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Leads */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />
                Руководители проекта
                <Badge variant="outline" className="ml-1 text-xs">{project.leads.length}</Badge>
              </CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddMemberOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Добавить
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {project.leads.length > 0 ? (
              project.leads.map((m) => (
                <MemberCard
                  key={m.id}
                  member={m}
                  canRemove={canManage && project.leads.length > 1}
                  onRemove={handleRemoveMember}
                  onContextMenu={handleContextMenu}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Руководители не назначены</p>
            )}
          </CardContent>
        </Card>

        {/* Participants */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Участники
                <Badge variant="outline" className="ml-1 text-xs">{project.participants.length}</Badge>
              </CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddMemberOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Добавить
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {project.participants.length > 0 ? (
              project.participants.map((m) => (
                <MemberCard
                  key={m.id}
                  member={m}
                  canRemove={canManage}
                  onRemove={handleRemoveMember}
                  onContextMenu={handleContextMenu}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Участников пока нет</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      {editOpen && (
        <EditProjectModal
          project={project}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onUpdated={(updated) => {
            setProject({
              ...updated,
              leads:        updated.members?.filter((m: Member) => m.role === 'lead') ?? [],
              participants: updated.members?.filter((m: Member) => m.role === 'member') ?? [],
            })
          }}
        />
      )}
      {addMemberOpen && (
        <AddMemberModal
          projectId={project.id}
          existingMemberIds={project.members.map((m) => m.id)}
          open={addMemberOpen}
          onClose={() => setAddMemberOpen(false)}
          onAdded={() => fetchProject()}
        />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onViewProfile={handleViewProfile}
          onViewRole={handleViewRole}
        />
      )}
      {memberInfoOpen && selectedMember && (
        <MemberProjectInfoModal
          member={selectedMember}
          projectId={project.id}
          open={memberInfoOpen}
          onClose={() => setMemberInfoOpen(false)}
          onUpdated={() => fetchProject()}
        />
      )}
    </div>
  )
}

function InfoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium text-sm">{value}</div>
      </div>
    </div>
  )
}

// ── Task Context Menu Popup ─────────────────────────────────────────────────

function TaskCtxMenuPopup({
  x, y, onClose, onDetails,
}: { x: number; y: number; onClose: () => void; onDetails: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] bg-background rounded-lg shadow-2xl border border-border/50 py-1 animate-in fade-in zoom-in duration-100"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => { onDetails(); onClose() }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Info className="h-4 w-4" />
        Подробнее о задаче
      </button>
    </div>
  )
}

// ── Task Detail Modal ────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: 'В ожидании',
  in_progress: 'В процессе',
  completed: 'Завершена',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-blue-500',
  completed: 'text-emerald-500',
}
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-emerald-500',
  medium: 'text-amber-500',
  high: 'text-red-500',
}

function fmtMonth(mk: string) {
  const [y, m] = mk.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

function TaskDetailModal({
  task,
  row,
  onClose,
}: {
  task: RoadmapTask
  row: RoadmapRow | null
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: task.color || row?.color || '#6366f1' }}
        />
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            {task.is_milestone && (
              <Diamond className="h-4 w-4 shrink-0 text-amber-500" />
            )}
            <h2 className="font-semibold text-base leading-snug">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-3">
          {/* Row */}
          {row && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
              <span className="text-muted-foreground">Группа:</span>
              <span className="font-medium">{row.title}</span>
            </div>
          )}

          {/* Period */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Период:</span>
            <span className="font-medium">
              {fmtMonth(task.start_month)}
              {task.end_month !== task.start_month && ` — ${fmtMonth(task.end_month)}`}
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 text-sm">
            <CircleDot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Статус:</span>
            <span className={`font-medium ${STATUS_COLORS[task.status] ?? ''}`}>
              {STATUS_LABELS[task.status] ?? task.status}
            </span>
          </div>

          {/* Priority */}
          {task.priority && (
            <div className="flex items-center gap-2 text-sm">
              <Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Приоритет:</span>
              <span className={`font-medium ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                {PRIORITY_LABELS[task.priority] ?? task.priority}
              </span>
            </div>
          )}

          {/* Milestone badge */}
          {task.is_milestone && (
            <div className="flex items-center gap-2 text-sm">
              <Diamond className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-amber-600 font-medium">Веха (milestone)</span>
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div className="mt-3 p-3 rounded-xl bg-muted/50 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {task.description}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Roadmap Section (read-only Gantt preview) ──────────────────────────────

const ROW_H_PREVIEW    = 40
const MIN_CELL_W       = 44   // minimum column width (px)
const MIN_LABEL_W_PRV  = 100
const MAX_LABEL_W_PRV  = 280
const CHAR_W_PRV       = 7

interface RoadmapRow  { id: string; title: string; color: string; order_index: number }
interface RoadmapTask {
  id: string; row_id: string; title: string; description?: string
  start_month: string; end_month: string
  status: 'pending' | 'in_progress' | 'completed'; color?: string
  priority?: 'low' | 'medium' | 'high'
  is_milestone?: boolean
}

function monthKeyP(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}
function parseMK(key: string) { const [y, m] = key.split('-'); return { year: +y, month: +m } }
function monthPartsP(key: string) {
  const { year, month } = parseMK(key)
  const d = new Date(year, month - 1, 1)
  return {
    mon: d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''),
    yr: `${year}`,
  }
}
function genMonths(start: string, end: string) {
  const months: string[] = []
  let { year, month } = parseMK(start)
  const e = parseMK(end)
  while (year < e.year || (year === e.year && month <= e.month)) {
    months.push(monthKeyP(year, month))
    if (++month > 12) { month = 1; year++ }
  }
  return months
}

function qkP(y: number, q: number) { return `${y}-Q${q}` }
function monthToQP(mk: string) { const { year, month } = parseMK(mk); return qkP(year, Math.ceil(month / 3)) }

function genQuartersP(start: string, end: string) {
  const qs: string[] = []
  const { year: sy, month: sm } = parseMK(start)
  const { year: ey, month: em } = parseMK(end)
  let year = sy, q = Math.ceil(sm / 3)
  const endQ = Math.ceil(em / 3)
  while (year < ey || (year === ey && q <= endQ)) {
    qs.push(qkP(year, q))
    if (++q > 4) { q = 1; year++ }
  }
  return qs
}

function RoadmapSection({
  projectId,
  canManage,
  projectStartDate,
  projectEndDate,
}: {
  projectId: string
  canManage: boolean
  projectStartDate?: string
  projectEndDate?: string
}) {
  const navigate = useNavigate()
  const [rows, setRows]         = useState<RoadmapRow[]>([])
  const [tasks, setTasks]       = useState<RoadmapTask[]>([])
  const [loading, setLoading]   = useState(true)
  const [allMonths, setAllMonths] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'months' | 'quarters'>('months')
  const [containerW, setContainerW] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [taskCtxMenu, setTaskCtxMenu] = useState<{ x: number; y: number; task: RoadmapTask } | null>(null)
  const [taskDetail, setTaskDetail] = useState<RoadmapTask | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const now = new Date()
    const start = projectStartDate?.slice(0, 7) || monthKeyP(now.getFullYear(), 1)
    const end   = projectEndDate?.slice(0, 7)   || monthKeyP(now.getFullYear(), 12)
    setAllMonths(genMonths(start, end))
  }, [projectStartDate, projectEndDate])

  const cols = useMemo(() => {
    if (allMonths.length === 0) return []
    return viewMode === 'months'
      ? allMonths
      : genQuartersP(allMonths[0], allMonths[allMonths.length - 1])
  }, [allMonths, viewMode])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [rRes, tRes] = await Promise.all([
          fetch(`${API_BASE_URL}/projects/${projectId}/roadmap/rows`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE_URL}/projects/${projectId}/roadmap/tasks`, { headers: getAuthHeaders() }),
        ])
        if (rRes.ok) setRows(await rRes.json())
        if (tRes.ok) setTasks(await tRes.json())
      } catch {}
      setLoading(false)
    }
    load()
  }, [projectId])

  const totalTasks     = tasks.length
  const completedTasks = tasks.filter((t) => t.status === 'completed').length
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  // Dynamic column widths
  const labelW = useMemo(() => {
    const maxLen = rows.reduce((m, r) => Math.max(m, r.title.length), 6)
    return Math.min(MAX_LABEL_W_PRV, Math.max(MIN_LABEL_W_PRV, maxLen * CHAR_W_PRV + 40))
  }, [rows])

  const cellW = useMemo(() => {
    if (containerW <= 0 || cols.length === 0) return MIN_CELL_W
    return Math.max(MIN_CELL_W, (containerW - labelW) / cols.length)
  }, [containerW, labelW, cols])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Map className="h-4 w-4 text-primary" />
            Дорожная карта
            {totalTasks > 0 && (
              <Badge variant="outline" className="ml-1 text-xs">{completedTasks}/{totalTasks}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('months')}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'months' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
                title="По месяцам"
              >
                <CalendarDays className="h-3 w-3" />
                <span className="hidden sm:inline">Мес</span>
              </button>
              <button
                onClick={() => setViewMode('quarters')}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors border-l border-border ${viewMode === 'quarters' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
                title="По кварталам"
              >
                <LayoutGrid className="h-3 w-3" />
                <span className="hidden sm:inline">Кв</span>
              </button>
            </div>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => navigate(`/projects/${projectId}/roadmap`)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Редактировать
              </Button>
            )}
          </div>
        </div>
        {totalTasks > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Прогресс</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 pb-3">
        {/* containerRef always in DOM so ResizeObserver fires on mount */}
        <div ref={containerRef} className="w-full">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Map className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Дорожная карта пуста</p>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => navigate(`/projects/${projectId}/roadmap`)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Открыть редактор
              </Button>
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <div style={{ minWidth: labelW + cols.length * MIN_CELL_W }}>
              {/* Column header */}
              <div className="flex border-b border-border sticky top-0 bg-card z-10">
                <div
                  className="shrink-0 px-3 flex items-center text-xs font-semibold text-muted-foreground border-r border-border"
                  style={{ width: labelW, minWidth: labelW, height: 40 }}
                >
                  Задача
                </div>
                {cols.map((c) => {
                  const isCur = viewMode === 'months'
                    ? c === monthKeyP(new Date().getFullYear(), new Date().getMonth() + 1)
                    : c === monthToQP(monthKeyP(new Date().getFullYear(), new Date().getMonth() + 1))
                  let label: string, sub: string
                  if (viewMode === 'months') {
                    const { mon, yr } = monthPartsP(c)
                    label = mon; sub = yr
                  } else {
                    const [y, q] = c.split('-Q')
                    label = `Q${q}`; sub = y
                  }
                  return (
                    <div
                      key={c}
                      className={`shrink-0 flex flex-col items-center justify-center border-r border-border/40 ${isCur ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                      style={{ width: cellW, minWidth: MIN_CELL_W, height: 40, flexShrink: 0 }}
                    >
                      <span className="text-xs leading-tight font-medium truncate px-0.5">{label}</span>
                      <span className="text-[10px] leading-tight opacity-60">{sub}</span>
                    </div>
                  )
                })}
              </div>

              {/* Rows */}
              {rows.map((row) => {
                const rowTasks = tasks.filter((t) => t.row_id === row.id)
                return (
                  <div key={row.id} className="flex border-b border-border/40" style={{ minHeight: ROW_H_PREVIEW }}>
                    <div
                      className="shrink-0 flex items-center gap-2 px-3 border-r border-border"
                      style={{ width: labelW, minWidth: labelW }}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                      <span className="text-xs font-medium truncate">{row.title}</span>
                    </div>
                    <div className="relative flex-1 flex" style={{ height: ROW_H_PREVIEW }}>
                      {cols.map((c) => {
                        const isCur = viewMode === 'months'
                          ? c === monthKeyP(new Date().getFullYear(), new Date().getMonth() + 1)
                          : c === monthToQP(monthKeyP(new Date().getFullYear(), new Date().getMonth() + 1))
                        return (
                          <div
                            key={c}
                            className={`border-r border-border/30 ${isCur ? 'bg-primary/5' : ''}`}
                            style={{ width: cellW, minWidth: MIN_CELL_W, height: ROW_H_PREVIEW, flexShrink: 0 }}
                          />
                        )
                      })}
                      {rowTasks.map((task) => {
                        let s: number, e: number
                        if (viewMode === 'months') {
                          const si = cols.indexOf(task.start_month)
                          const ei = cols.indexOf(task.end_month)
                          if (si === -1 && ei === -1) return null
                          s = si === -1 ? 0 : si
                          e = ei === -1 ? cols.length - 1 : ei
                        } else {
                          const sq = monthToQP(task.start_month)
                          const eq = monthToQP(task.end_month)
                          const si = cols.indexOf(sq)
                          const ei = cols.indexOf(eq)
                          if (si === -1 && ei === -1) return null
                          s = si === -1 ? 0 : si
                          e = ei === -1 ? cols.length - 1 : ei
                        }
                        const isMilestone = task.is_milestone
                        return isMilestone ? (
                          <div
                            key={task.id}
                            className="absolute cursor-context-menu"
                            style={{
                              left: s * cellW + cellW / 2 - 7,
                              top: 8,
                              width: 14, height: 14,
                              transform: 'rotate(45deg)',
                              borderRadius: 2,
                              backgroundColor: task.color || row.color,
                              opacity: task.status === 'completed' ? 0.6 : 1,
                            }}
                            title={task.title}
                            onContextMenu={(ev) => {
                              ev.preventDefault()
                              ev.stopPropagation()
                              setTaskCtxMenu({ x: ev.clientX, y: ev.clientY, task })
                            }}
                          />
                        ) : (
                          <div
                            key={task.id}
                            className="absolute flex items-center rounded text-white text-xs font-medium px-1.5 overflow-hidden cursor-context-menu"
                            style={{
                              left: s * cellW + 2,
                              width: (e - s + 1) * cellW - 4,
                              top: 6,
                              height: ROW_H_PREVIEW - 12,
                              backgroundColor: task.color || row.color,
                              borderLeft: `3px solid ${task.priority === 'high' ? '#ef4444' : task.priority === 'low' ? '#22c55e' : '#f59e0b'}`,
                              opacity: task.status === 'completed' ? 0.6 : 1,
                            }}
                            title={task.title}
                            onContextMenu={(ev) => {
                              ev.preventDefault()
                              ev.stopPropagation()
                              setTaskCtxMenu({ x: ev.clientX, y: ev.clientY, task })
                            }}
                          >
                            <span className="truncate">{task.title}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        </div>{/* /containerRef */}
      </CardContent>
      {taskCtxMenu && (
        <TaskCtxMenuPopup
          x={taskCtxMenu.x}
          y={taskCtxMenu.y}
          onClose={() => setTaskCtxMenu(null)}
          onDetails={() => { setTaskDetail(taskCtxMenu.task); setTaskCtxMenu(null) }}
        />
      )}
      {taskDetail && (
        <TaskDetailModal
          task={taskDetail}
          row={rows.find((r) => r.id === taskDetail.row_id) ?? null}
          onClose={() => setTaskDetail(null)}
        />
      )}
    </Card>
  )
}
