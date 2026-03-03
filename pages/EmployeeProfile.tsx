import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { formatDate } from '@/lib/utils'
import { AddSkillModal } from '@/components/modals/AddSkillModal'
import { AddProjectModal } from '@/components/modals/AddProjectModal'
import { useAuthStore } from '@/store/authStore'
import {
  Mail, Phone, Calendar, Building2, Briefcase, ArrowLeft, Loader2,
  FolderKanban, Wrench, User, CheckCircle2, Clock, CircleDot, Plus, Trash, Target, Crown,
} from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch (e) {
      console.error('[EmployeeProfile] Error parsing auth storage:', e)
    }
  }
  return headers
}

interface EmployeeData {
  id: string
  email: string
  firstName: string
  lastName: string
  middleName?: string
  position: string
  department?: string
  department_name?: string
  departmentId?: string
  phone?: string
  birthDate?: string
  birth_date?: string
  hireDate?: string
  hire_date?: string
  status: 'active' | 'inactive' | 'on_leave'
  role: string
  skills?: string[]
  projects?: Project[]
  responsibilityArea?: string
  responsibility_area?: string
}

interface Project {
  id: string
  name: string
  role: 'lead' | 'member'
  status: 'active' | 'completed' | 'paused'
  startDate?: string
  endDate?: string
  description?: string
  joined_at?: string
}

const statusConfig = {
  active:   { label: 'Активен',   variant: 'success'     as const, dot: 'bg-emerald-500' },
  inactive: { label: 'Неактивен', variant: 'destructive' as const, dot: 'bg-red-500' },
  on_leave: { label: 'В отпуске', variant: 'warning'     as const, dot: 'bg-amber-500' },
}

const projectStatusConfig = {
  active:    { label: 'Активный',   icon: CircleDot,     color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  completed: { label: 'Завершён',   icon: CheckCircle2,  color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
  paused:    { label: 'На паузе',   icon: Clock,         color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
}

const projectRoleConfig = {
  lead:   { label: 'Руководитель', icon: Crown,    color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  member: { label: 'Участник',    icon: User,      color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
}

const SKILL_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
]

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
]

function getAvatarColor(id: string) {
  const n = parseInt(id, 10) || 0
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

const roleLabels: Record<string, string> = {
  employee: 'Сотрудник',
  manager:  'Руководитель',
  hr:       'HR',
  admin:    'Администратор',
}

export function EmployeeProfile() {
  const { id } = useParams<{ id: string }>()
  const { user: currentUser } = useAuthStore()
  const [employee, setEmployee] = useState<EmployeeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAddSkillModalOpen, setIsAddSkillModalOpen] = useState(false)
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; skill: string } | null>(null)
  const [editingResponsibility, setEditingResponsibility] = useState(false)
  const [responsibilityText, setResponsibilityText] = useState('')
  const [addingSkill, setAddingSkill] = useState(false)
  const [removingSkill, setRemovingSkill] = useState<string | null>(null)

  const isOwnProfile = currentUser?.id === id

  useEffect(() => {
    if (!id) return
    const fetchEmployee = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/users/${id}`, { headers: getAuthHeaders() })
        if (!response.ok) throw new Error('Не удалось загрузить данные сотрудника')
        const data = await response.json()
        setEmployee({
          ...data,
          firstName:  data.firstName  || data.first_name  || '',
          lastName:   data.lastName   || data.last_name   || '',
          middleName: data.middleName || data.middle_name,
          department: data.department || data.department_name || '',
          birthDate:  data.birthDate  || data.birth_date,
          hireDate:   data.hireDate   || data.hire_date   || '',
          status:     data.status     || 'active',
          role:       data.role       || 'employee',
          skills:     data.skills     || [],
          projects:   data.projects   || [],
          responsibilityArea: data.responsibilityArea || data.responsibility_area,
        })
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchEmployee()
  }, [id])

  const handleAddSkill = async (skill: string) => {
    if (!employee) return

    setAddingSkill(true)
    const newSkills = [...(employee.skills || []), skill]
    const updatedEmployee = { ...employee, skills: newSkills }
    setEmployee(updatedEmployee)

    try {
      await fetch(`${API_BASE_URL}/users/${id}/skills`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ skill }),
      })
    } catch (err) {
      console.error('Failed to add skill:', err)
      setEmployee(employee)
    } finally {
      setAddingSkill(false)
    }
  }

  const handleAddProject = async (project: Omit<Project, 'id'>) => {
    if (!employee) return

    const newProject: Project = {
      ...project,
      id: `temp-${Date.now()}`,
    }
    const newProjects = [...(employee.projects || []), newProject]
    const updatedEmployee = { ...employee, projects: newProjects }
    setEmployee(updatedEmployee)

    try {
      await fetch(`${API_BASE_URL}/users/${id}/projects`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(project),
      })
    } catch (err) {
      console.error('Failed to add project:', err)
      setEmployee(employee)
    }
  }

  const handleRemoveSkill = async (skill: string) => {
    if (!employee) return

    setRemovingSkill(skill)
    setContextMenu(null)
    const newSkills = employee.skills?.filter(s => s !== skill) || []
    const updatedEmployee = { ...employee, skills: newSkills }
    setEmployee(updatedEmployee)

    try {
      await fetch(`${API_BASE_URL}/users/${id}/skills`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ skill }),
      })
    } catch (err) {
      console.error('Failed to remove skill:', err)
      setEmployee(employee)
    } finally {
      setRemovingSkill(null)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, skill: string) => {
    e.preventDefault()
    if (!isOwnProfile) return

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      skill,
    })
  }

  const handleStartEditingResponsibility = () => {
    if (!isOwnProfile) return
    setResponsibilityText(employee?.responsibilityArea || '')
    setEditingResponsibility(true)
  }

  const handleSaveResponsibility = async () => {
    if (!employee) return

    const updatedEmployee = { ...employee, responsibilityArea: responsibilityText.trim() || undefined }
    setEmployee(updatedEmployee)
    setEditingResponsibility(false)

    try {
      await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ responsibility_area: responsibilityText.trim() }),
      })
    } catch (err) {
      console.error('Failed to update responsibility:', err)
      setEmployee(employee)
    }
  }

  const handleCancelResponsibility = () => {
    setResponsibilityText(employee?.responsibilityArea || '')
    setEditingResponsibility(false)
  }

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !employee) {
    return (
      <div className="space-y-4">
        <Link to="/employees">
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Назад</Button>
        </Link>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-destructive font-medium">{error ?? 'Сотрудник не найден'}</p>
        </div>
      </div>
    )
  }

  const initials = `${employee.firstName?.[0] ?? ''}${employee.lastName?.[0] ?? ''}`
  const avatarColor = getAvatarColor(employee.id)
  const status = statusConfig[employee.status] ?? statusConfig.active
  const fullName = [employee.lastName, employee.firstName, employee.middleName].filter(Boolean).join(' ')

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
      <Link to="/employees">
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Назад к списку
        </Button>
      </Link>

      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-6 text-white shadow-glow">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }}
        />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Avatar className="h-20 w-20 ring-4 ring-white/30 shrink-0">
            <AvatarFallback className={`bg-gradient-to-br ${avatarColor} text-white text-2xl font-bold`}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{fullName}</h1>
            <p className="text-white/80 mt-0.5">{employee.position}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm">
                {roleLabels[employee.role] ?? employee.role}
              </span>
              {employee.department && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm">
                  <Building2 className="h-3 w-3" />
                  {employee.department}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Информация о сотруднике */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Личные данные */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Личная информация
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Фамилия"    value={employee.lastName} />
            <InfoRow label="Имя"        value={employee.firstName} />
            <InfoRow label="Отчество"   value={employee.middleName} />
            <InfoRow label="Дата рождения" value={employee.birthDate ? formatDate(employee.birthDate) : undefined} />
          </CardContent>
        </Card>

        {/* Контакты */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Контакты
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <span className="break-all">{employee.email || '—'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <span>{employee.phone || '—'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Рабочая информация */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              Информация о работе
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Должность</div>
                <div className="font-medium">{employee.position || '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Отдел</div>
                <div className="font-medium">{employee.department || '—'}</div>
              </div>
            </div>
             <div className="flex items-center gap-3 text-sm">
               <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
                 <Calendar className="h-4 w-4 text-primary" />
               </div>
               <div>
                 <div className="text-xs text-muted-foreground">Дата найма</div>
                 <div className="font-medium">{employee.hireDate ? formatDate(employee.hireDate) : '—'}</div>
               </div>
             </div>
             <div className="flex items-start gap-3 text-sm sm:col-span-2">
               <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
                 <Target className="h-4 w-4 text-primary" />
               </div>
               <div className="flex-1">
                 <div className="text-xs text-muted-foreground">Зона ответственности</div>
                 {editingResponsibility ? (
                   <div className="mt-1">
                     <textarea
                       value={responsibilityText}
                       onChange={(e) => setResponsibilityText(e.target.value)}
                       maxLength={500}
                       className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                       rows={3}
                       autoFocus
                       onBlur={handleSaveResponsibility}
                       onKeyDown={(e) => {
                         if (e.key === 'Escape') {
                           handleCancelResponsibility()
                         } else if (e.key === 'Enter' && e.ctrlKey) {
                           handleSaveResponsibility()
                         }
                       }}
                     />
                     <div className="flex items-center justify-between mt-1">
                       <div className="text-xs text-muted-foreground">
                         {responsibilityText.length}/500 символов
                       </div>
                       <div className="flex gap-2">
                         <Button
                           type="button"
                           variant="ghost"
                           size="sm"
                           onClick={handleCancelResponsibility}
                           className="h-7 px-2 text-xs"
                         >
                           Отмена
                         </Button>
                         <Button
                           type="button"
                           size="sm"
                           onClick={handleSaveResponsibility}
                           className="h-7 px-2 text-xs"
                           disabled={!responsibilityText.trim()}
                         >
                           Сохранить
                         </Button>
                       </div>
                     </div>
                   </div>
                 ) : (
                   <div
                     onClick={handleStartEditingResponsibility}
                     className={`mt-1 font-medium cursor-pointer hover:text-primary transition-colors ${isOwnProfile ? 'hover:bg-primary/5 rounded px-2 py-1' : ''}`}
                   >
                     {employee.responsibilityArea || '—'}
                   </div>
                 )}
               </div>
             </div>
           </CardContent>
         </Card>

        {/* Навыки */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Навыки и компетенции
              </CardTitle>
              {isOwnProfile && (
                <Button size="sm" onClick={() => setIsAddSkillModalOpen(true)} disabled={addingSkill}>
                  {addingSkill ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Добавить
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {employee.skills && employee.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {employee.skills.map((skill, i) => (
                  <span
                    key={skill}
                    onContextMenu={(e) => handleContextMenu(e, skill)}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-transform hover:scale-105 cursor-pointer ${removingSkill === skill ? 'opacity-50' : ''} ${SKILL_COLORS[i % SKILL_COLORS.length]}`}
                  >
                    {removingSkill === skill && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <EmptySection
                icon={<Wrench className="h-8 w-8 text-muted-foreground/40" />}
                text="Навыки не указаны"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            style={{ background: 'transparent' }}
          />
          <div
            className="fixed z-50 min-w-[200px] rounded-lg border bg-popover shadow-md animate-in fade-in zoom-in-95"
            style={{
              left: `${Math.min(contextMenu.x, window.innerWidth - 220)}px`,
              top: `${Math.min(contextMenu.y, window.innerHeight - 100)}px`,
            }}
          >
            <div className="p-1">
              <button
                onClick={() => handleRemoveSkill(contextMenu.skill)}
                disabled={removingSkill !== null}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md disabled:opacity-50"
              >
                {removingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                Удалить навык
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <AddSkillModal
        open={isAddSkillModalOpen}
        onClose={() => setIsAddSkillModalOpen(false)}
        onAdd={handleAddSkill}
        userId={id}
      />
      <AddProjectModal
        open={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        onAdd={handleAddProject}
      />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '—'}</span>
    </div>
  )
}

function EmptySection({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-3">
        {icon}
      </div>
      <p className="text-muted-foreground text-sm">{text}</p>
    </div>
  )
}
