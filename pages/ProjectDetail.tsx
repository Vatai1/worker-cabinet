import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import {
  ArrowLeft, Loader2, FolderKanban, Calendar, Users, Crown,
  CircleDot, CheckCircle2, Clock, Pencil, Trash2, UserPlus, FileText,
} from 'lucide-react'
import { EditProjectModal } from '@/components/modals/EditProjectModal'
import { AddMemberModal } from '@/components/modals/AddMemberModal'
import { MemberProjectInfoModal } from '@/components/modals/MemberProjectInfoModal'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { DocumentsSection } from '@/components/sections/DocumentsSection'

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
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
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

      {/* Documents */}
      <DocumentsSection
        projectId={project.id}
        canManage={canManage}
        isMember={project.members.some((m) => String(m.id) === String(user?.id))}
      />

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
