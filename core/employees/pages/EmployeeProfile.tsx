import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { AddProjectModal, type Project } from '@/core/admin/components/modals/AddProjectModal'
import { SkillsCard } from '@/modules/skills/components/SkillsCard'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useModulesStore } from '@/shared/store/modulesStore'

import {
  Mail, Phone, Building2, Briefcase,
  User, Target, ChevronLeft, Sparkles,
  Clock, FolderKanban, Plus, MapPin,
} from 'lucide-react'

import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { getAvatarColor as getAvatarGradient } from '@/shared/lib/constants'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'

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
  gender?: 'male' | 'female' | 'other'
  avatar?: string
  office?: string
  cabinet?: string
}

const statusConfig = {
  active:   { label: 'Активен',   dot: 'bg-emerald-500', bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  inactive: { label: 'Неактивен', dot: 'bg-red-500',     bg: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  on_leave: { label: 'В отпуске', dot: 'bg-amber-500',   bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
}

const roleLabels: Record<string, string> = {
  employee: 'Сотрудник',
  manager:  'Руководитель',
  hr:       'HR',
  admin:    'Администратор',
}

const projectStatusConfig = {
  active:   { label: 'Активный',    bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  completed: { label: 'Завершён',   bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  paused:   { label: 'Приостановлен', bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}

function calculateWorkExperience(hireDate?: string): string {
  if (!hireDate) return '—'
  const hire = new Date(hireDate)
  const now = new Date()
  const years = now.getFullYear() - hire.getFullYear()
  const months = now.getMonth() - hire.getMonth()
  const totalMonths = years * 12 + months
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  if (y === 0) return `${m} ${m === 1 ? 'месяц' : m < 5 ? 'месяца' : 'месяцев'}`
  if (m === 0) return `${y} ${y === 1 ? 'год' : y < 5 ? 'года' : 'лет'}`
  return `${y} ${y === 1 ? 'год' : y < 5 ? 'года' : 'лет'} ${m} ${m === 1 ? 'мес.' : 'мес.'}`
}

export function EmployeeProfile() {
  const { id } = useParams<{ id: string }>()
  const { user: currentUser } = useAuthStore()
  const [employee, setEmployee] = useState<EmployeeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false)
  const [editingResponsibility, setEditingResponsibility] = useState(false)
  const [responsibilityText, setResponsibilityText] = useState('')

  const isOwnProfile = currentUser?.id === id
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)

  useEffect(() => {
    if (!id) return
    const fetchEmployee = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/users/${id}`, { headers: getAuthHeadersWithContentType() })
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
          office:  data.office,
          cabinet: data.cabinet,
        })
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    fetchEmployee()
  }, [id])

  const handleAddProject: (project: Omit<Project, 'id'>) => void | Promise<void> = (project) => {
    if (!employee) return

    const newProject: Project = { ...project, id: `temp-${Date.now()}` }
    setEmployee({ ...employee, projects: [...(employee.projects || []), newProject] })

    ;(async () => {
      try {
        await fetch(`${API_BASE_URL}/users/${id}/projects`, {
          method: 'POST',
          headers: getAuthHeadersWithContentType(),
          body: JSON.stringify(project),
        })
        toast.success('Проект добавлен')
      } catch {
        toast.error('Не удалось добавить проект')
        setEmployee(employee)
      }
    })()
  }

  const handleStartEditingResponsibility = () => {
    if (!isOwnProfile) return
    setResponsibilityText(employee?.responsibilityArea || '')
    setEditingResponsibility(true)
  }

  const handleSaveResponsibility = async () => {
    if (!employee) return
    setEmployee({ ...employee, responsibilityArea: responsibilityText.trim() || undefined })
    setEditingResponsibility(false)

    try {
      await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ responsibility_area: responsibilityText.trim() }),
      })
      toast.success('Зона ответственности обновлена')
    } catch {
      toast.error('Не удалось сохранить')
      setEmployee(employee)
    }
  }

  const handleCancelResponsibility = () => {
    setResponsibilityText(employee?.responsibilityArea || '')
    setEditingResponsibility(false)
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="h-48 rounded-2xl gradient-primary animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !employee) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Link to="/employees">
          <Button variant="outline"><ChevronLeft className="mr-2 h-4 w-4" />Назад</Button>
        </Link>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-destructive font-medium">{error ?? 'Сотрудник не найден'}</p>
        </div>
      </div>
    )
  }

  const initials = `${employee.firstName?.[0] ?? ''}${employee.lastName?.[0] ?? ''}`
  const avatarColor = getAvatarGradient(employee.id)
  const status = statusConfig[employee.status] ?? statusConfig.active
  const fullName = [employee.lastName, employee.firstName, employee.middleName].filter(Boolean).join(' ')
  const projects = employee.projects || []
  const activeProjects = projects.filter(p => p.status === 'active').length

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/employees" className="inline-block">
        <Button variant="outline" size="sm" className="gap-2 interactive">
          <ChevronLeft className="h-4 w-4" />
          Назад к списку
        </Button>
      </Link>

      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-white/3 rounded-full blur-2xl" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="relative shrink-0">
            <Avatar className="h-24 w-24 ring-4 ring-white/20 text-3xl shadow-2xl">
              <AvatarImage
                src={employee.avatar || generateAvatarUrl(employee.id, employee.gender)}
                alt={initials}
              />
              <AvatarFallback className={`bg-gradient-to-br ${avatarColor} text-white text-2xl font-bold`}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-white/30 ${status.dot}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-white/60" />
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Профиль сотрудника</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">{fullName}</h1>
            <p className="mt-1 text-white/60 text-sm font-medium">{employee.position}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium ${status.bg} bg-white/10`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-white/10 backdrop-blur-sm border border-white/10 text-white/80">
                {roleLabels[employee.role] ?? employee.role}
              </span>
              {employee.department && (
                <Link
                  to={employee.departmentId ? `/departments/${employee.departmentId}` : '/departments'}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-white/20 transition-colors"
                >
                  <Building2 className="h-3 w-3" />
                  {employee.department}
                </Link>
              )}
            </div>
          </div>
          <div className="hidden lg:flex flex-col items-end gap-1 shrink-0">
            <div className="flex flex-wrap justify-end gap-2">
              <div className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                <FolderKanban className="h-3.5 w-3.5" />{activeProjects} активных проектов
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                <Clock className="h-3.5 w-3.5" />{calculateWorkExperience(employee.hireDate)}
              </div>
              {(employee.office || employee.cabinet) && (
                <div className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                  <MapPin className="h-3.5 w-3.5" />{[employee.office, employee.cabinet].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover-lift stagger-1 animate-slide-up">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              Личная информация
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Фамилия" value={employee.lastName} />
            <InfoRow label="Имя" value={employee.firstName} />
            <InfoRow label="Отчество" value={employee.middleName} />
            <InfoRow label="Дата рождения" value={employee.birthDate ? formatDate(employee.birthDate) : undefined} />
          </CardContent>
        </Card>

        <Card className="hover-lift stagger-2 animate-slide-up">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              Контакты
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ContactRow icon={<Mail className="h-4 w-4 text-primary" />} value={employee.email} href={`mailto:${employee.email}`} />
            <ContactRow icon={<Phone className="h-4 w-4 text-primary" />} value={employee.phone} href={employee.phone ? `tel:${employee.phone}` : undefined} />
          </CardContent>
        </Card>

        <Card className="hover-lift stagger-3 animate-slide-up">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-primary/10">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              Работа
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Должность" value={employee.position} />
            <InfoRow label="Отдел" value={employee.department} />
            <InfoRow label="Дата найма" value={employee.hireDate ? formatDate(employee.hireDate) : undefined} />
            <InfoRow label="Стаж" value={calculateWorkExperience(employee.hireDate)} />
            <InfoRow label="Офис" value={employee.office} />
            <InfoRow label="Кабинет" value={employee.cabinet} />
          </CardContent>
        </Card>
      </div>

      <Card className="hover-lift stagger-4 animate-slide-up">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-primary/10">
                <Target className="h-4 w-4 text-primary" />
              </div>
              Зона ответственности
            </CardTitle>
            {isOwnProfile && !editingResponsibility && (
              <Button variant="ghost" size="sm" onClick={handleStartEditingResponsibility} className="h-7 text-xs interactive">
                Редактировать
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingResponsibility ? (
            <div>
              <textarea
                value={responsibilityText}
                onChange={(e) => setResponsibilityText(e.target.value)}
                maxLength={500}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleCancelResponsibility()
                  else if (e.key === 'Enter' && e.ctrlKey) handleSaveResponsibility()
                }}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">{responsibilityText.length}/500</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancelResponsibility} className="h-7 px-3 text-xs interactive">
                    Отмена
                  </Button>
                  <Button size="sm" onClick={handleSaveResponsibility} className="h-7 px-3 text-xs" disabled={!responsibilityText.trim()}>
                    Сохранить
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className={`text-sm leading-relaxed ${!employee.responsibilityArea ? 'text-muted-foreground' : ''}`}>
              {employee.responsibilityArea || 'Не указана'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="hover-lift stagger-5 animate-slide-up">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-primary/10">
                <FolderKanban className="h-4 w-4 text-primary" />
              </div>
              Проекты
              <span className="text-xs text-muted-foreground font-normal ml-1">({projects.length})</span>
            </CardTitle>
            {(isOwnProfile || currentUser?.role === 'hr' || currentUser?.role === 'admin') && (
              <Button variant="outline" size="sm" onClick={() => setIsAddProjectModalOpen(true)} className="h-7 gap-1.5 text-xs interactive">
                <Plus className="h-3.5 w-3.5" />
                Добавить
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
                <FolderKanban className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Нет проектов</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((project) => {
                const ps = projectStatusConfig[project.status] ?? projectStatusConfig.active
                return (
                  <div
                    key={project.id}
                    className="group flex items-start gap-3 p-3 rounded-xl border border-border/60 hover:border-primary/20 hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0 mt-0.5">
                      <FolderKanban className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{project.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${ps.bg}`}>
                          {ps.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {project.role === 'lead' ? 'Руководитель' : 'Участник'}
                        </span>
                      </div>
                      {project.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isModuleEnabled('skills') && (
        <SkillsCard
          skills={employee.skills || []}
          userId={id!}
          isOwnProfile={isOwnProfile}
          onSkillsChange={(skills) => setEmployee(prev => prev ? { ...prev, skills } : prev)}
        />
      )}

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
    <div className="flex items-center justify-between text-sm py-2 border-b border-border/30 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || '—'}</span>
    </div>
  )
}

function ContactRow({ icon, value, href }: { icon: React.ReactNode; value?: string; href?: string }) {
  const content = (
    <div className="flex items-center gap-3 text-sm py-1">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 shrink-0">
        {icon}
      </div>
      <span className="break-all">{value || '—'}</span>
    </div>
  )
  if (href && value) {
    return <a href={href} className="block hover:bg-primary/5 rounded-lg px-1 -mx-1 transition-colors">{content}</a>
  }
  return content
}
