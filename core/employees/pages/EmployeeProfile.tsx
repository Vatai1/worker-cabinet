import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { PlannedVacationCard } from '@/shared/components/vacation/PlannedVacationCard'
import { AddProjectModal, type Project } from '@/core/admin/components/modals/AddProjectModal'
import { AvatarCropModal } from '@/shared/components/AvatarCropModal'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { SkillsCard } from '@/modules/skills/components/SkillsCard'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { hasAnyRole } from '@/shared/lib/permissions'

import {
  Mail, Phone, Building2, Briefcase,
  User, Target, ChevronLeft, Sparkles,
  Clock, FolderKanban, Plus, MapPin, UserCheck, Star, CalendarDays, Calendar,
  Camera, Loader2, X, CircleDot, CheckCircle2, Cake,
} from 'lucide-react'

import { API_BASE_URL } from '@/shared/lib/api'
import { apiGet, apiPatch } from '@/shared/lib/apiClient'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { getAvatarColor as getAvatarGradient } from '@/shared/lib/constants'
import { formatDate, getErrorMessage, personName } from '@/shared/lib/utils'

interface SubstituteInfo {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position: string
  avatar?: string
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
  organization_id?: number
  organization_name?: string
  organizationName?: string
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
  organizations?: Array<{
    id: number
    name: string
    org_role?: string
    department_name?: string
    is_primary: boolean
  }>
}

const statusConfig = {
  active:   { label: 'Активен',   dot: 'bg-emerald-500', bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  inactive: { label: 'Неактивен', dot: 'bg-red-500',     bg: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  on_leave: { label: 'В отпуске', dot: 'bg-amber-500',   bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
}

const roleLabels: Record<string, string> = {
  employee: 'Работник',
  manager:  'Руководитель',
  hr:       'HR',
  admin:    'Администратор',
}

const projectStatusConfig = {
  active:    { label: 'Активный',      icon: CircleDot,    bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  completed: { label: 'Завершён',      icon: CheckCircle2, bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  paused:    { label: 'Приостановлен', icon: Clock,        bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
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
  const [substitutes, setSubstitutes] = useState<SubstituteInfo[]>([])
  const [settingPrimaryOrg, setSettingPrimaryOrg] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarBust, setAvatarBust] = useState(() => Date.now())
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const isOwnProfile = currentUser?.id === id
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const canEditProfile = isOwnProfile || hasAnyRole('hr', 'admin')
  const canManageOrganizations = hasAnyRole('hr', 'admin')
  const canManageAvatar = hasAnyRole('hr', 'admin')

  useEffect(() => {
    if (!id) return
    const fetchEmployee = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/users/${id}`, { headers: getAuthHeadersWithContentType() })
        if (!response.ok) throw new Error('Не удалось загрузить данные работника')
        const data = await response.json()
        setEmployee({
          ...data,
          firstName:  data.firstName  || data.first_name  || '',
          lastName:   data.lastName   || data.last_name   || '',
          middleName: data.middleName || data.middle_name,
          department: data.department || data.department_name || '',
          organizationName: data.organization_name || data.organizationName,
          birthDate:  data.birthDate  || data.birth_date,
          hireDate:   data.hireDate   || data.hire_date   || '',
          status:     data.status     || 'active',
          role:       data.role       || 'employee',
          skills:     data.skills     || [],
          projects:   data.projects   || [],
          organizations: data.organizations || [],
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

  useEffect(() => {
    if (!id || employee?.status !== 'on_leave') return
    apiGet<{ substitutes?: SubstituteInfo[] }[]>(`/vacation/requests?userId=${id}&status=approved`)
      .then((data) => {
        const subs = (data || []).flatMap((r) => r.substitutes || [])
        setSubstitutes(subs)
      })
      .catch(() => {})
  }, [id, employee?.status])

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

  const handleSetPrimaryOrg = async (orgId: number, orgName: string) => {
    if (!id) return
    setSettingPrimaryOrg(true)
    try {
      await apiPatch(`/users/${id}/primary-org`, { orgId })
      setEmployee(prev => prev ? {
        ...prev,
        organizationName: orgName,
        organizations: (prev.organizations || []).map(o => ({ ...o, is_primary: o.id === orgId })),
      } : prev)
      toast.success('Основная организация обновлена')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setSettingPrimaryOrg(false)
    }
  }

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (avatarInputRef.current) avatarInputRef.current.value = ''
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (максимум 5 МБ)')
      return
    }

    setCropImageSrc(URL.createObjectURL(file))
    setCropModalOpen(true)
  }

  const closeCropModal = () => {
    setCropModalOpen(false)
    setCropImageSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const handleCropConfirm = async (blob: Blob) => {
    if (!id) return
    const confirmed = await confirmDialog({
      title: 'Сменить фото?',
      message: 'Текущая фотография профиля будет заменена выбранным изображением.',
      confirmText: 'Сменить фото',
    })
    if (!confirmed) return

    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', blob, 'avatar.jpg')
      const res = await fetch(`${API_BASE_URL}/users/${id}/avatar`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Не удалось загрузить фото')
      }
      const data = await res.json()
      setEmployee((prev) => (prev ? { ...prev, avatar: data.avatar } : prev))
      setAvatarBust(Date.now())
      toast.success('Аватар обновлён')
      closeCropModal()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleAvatarReset = async () => {
    if (!id) return
    const confirmed = await confirmDialog({
      title: 'Сбросить аватар?',
      message: 'Фото профиля будет удалено, вместо него будет показана автоматическая аватарка.',
      confirmText: 'Сбросить',
      variant: 'danger',
    })
    if (!confirmed) return

    try {
      const res = await fetch(`${API_BASE_URL}/users/${id}/avatar`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Не удалось сбросить аватар')
      }
      setEmployee((prev) => (prev ? { ...prev, avatar: undefined } : prev))
      toast.success('Аватар сброшен')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
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
          <p className="text-destructive font-medium">{error ?? 'Работник не найден'}</p>
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
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-card/3 rounded-full blur-2xl" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="group relative">
              <Avatar className="h-24 w-24 ring-4 ring-white/20 text-3xl shadow-2xl">
                <AvatarImage
                  src={employee.avatar ? `${employee.avatar}?v=${avatarBust}` : generateAvatarUrl(employee.id, employee.gender)}
                  alt={initials}
                />
                <AvatarFallback className={`bg-gradient-to-br ${avatarColor} text-white text-2xl font-bold`}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-white/30 ${status.dot}`} />
              {canManageAvatar && (
                <button
                  type="button"
                  disabled={avatarUploading}
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-200 cursor-pointer group-hover:opacity-100 disabled:cursor-wait"
                >
                  {avatarUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="h-5 w-5" />
                      <span className="text-[11px] font-medium">Фото</span>
                    </>
                  )}
                </button>
              )}
            </div>
            {canManageAvatar && (
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarFileSelect}
              />
            )}
            {canManageAvatar && employee.avatar && (
              <button
                type="button"
                onClick={handleAvatarReset}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-white/60 transition-colors hover:text-white"
              >
                <X className="h-3 w-3" />
                Сбросить
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-white/60" />
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Профиль работника</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">{fullName}</h1>
            <p className="mt-1 text-white/60 text-sm font-medium">{employee.position}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium ${status.bg} bg-card/10`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-card/10 backdrop-blur-sm border border-white/10 text-white/80">
                {roleLabels[employee.role] ?? employee.role}
              </span>
              {employee.department && (
                <Link
                  to={employee.departmentId ? `/departments/${employee.departmentId}` : '/departments'}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-card/10 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-card/20 transition-colors"
                >
                  <Building2 className="h-3 w-3" />
                  {employee.department}
                </Link>
              )}
              {employee.status === 'on_leave' && substitutes.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-card/10 backdrop-blur-sm border border-white/10 text-white/80">
                  <UserCheck className="h-3 w-3" />
                  Замещают: {' '}
                  {substitutes.map((s, i) => (
                    <span key={s.id}>
                      <Link to={`/employees/${s.id}`} className="underline hover:text-white">
                        {personName(s.last_name, s.first_name, s.middle_name)}
                      </Link>
                      {i < substitutes.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
          <div className="hidden lg:flex flex-col items-end gap-1 shrink-0">
            <div className="flex flex-wrap justify-end gap-2">
              <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                <FolderKanban className="h-3.5 w-3.5" />{activeProjects} активных проектов
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                <Clock className="h-3.5 w-3.5" />{calculateWorkExperience(employee.hireDate)}
              </div>
              {(employee.office || employee.cabinet) && (
                <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                  <MapPin className="h-3.5 w-3.5" />{[employee.office, employee.cabinet].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="animate-slide-up stagger-1 overflow-hidden p-0">
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">Личная информация</h2>
          </div>
          <div className="space-y-1 p-5">
            <InfoRow icon={<User className="h-4 w-4" />} label="Фамилия" value={employee.lastName} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Имя" value={employee.firstName} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Отчество" value={employee.middleName} />
            <InfoRow icon={<Cake className="h-4 w-4" />} label="Дата рождения" value={employee.birthDate ? formatDate(employee.birthDate) : undefined} />
          </div>
        </Card>

        <Card className="animate-slide-up stagger-2 overflow-hidden p-0">
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">Контакты</h2>
          </div>
          <div className="space-y-1 p-5">
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={employee.email} href={`mailto:${employee.email}`} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Телефон" value={employee.phone} href={employee.phone ? `tel:${employee.phone}` : undefined} />
          </div>
        </Card>

        <Card className="animate-slide-up stagger-3 overflow-hidden p-0">
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Briefcase className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">Работа</h2>
          </div>
          <div className="space-y-1 p-5">
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Организация" value={employee.organizationName} />
            <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Должность" value={employee.position} />
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Отдел" value={employee.department} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Дата найма" value={employee.hireDate ? formatDate(employee.hireDate) : undefined} />
            <InfoRow icon={<Clock className="h-4 w-4" />} label="Стаж" value={calculateWorkExperience(employee.hireDate)} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Офис" value={employee.office} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Кабинет" value={employee.cabinet} />
            {(employee.organizations?.length ?? 0) > 1 && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Другие организации</p>
                <div className="mt-2 space-y-1.5">
                  {employee.organizations!.filter(o => !o.is_primary).map(o => (
                    <div key={o.id} className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium truncate">{o.name}</span>
                      {employee.position && (
                        <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate">
                          {employee.position}
                        </span>
                      )}
                      {o.department_name && (
                        <span className="text-xs text-muted-foreground truncate">{o.department_name}</span>
                      )}
                      {canManageOrganizations && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 ml-auto gap-1.5 px-2.5 text-xs interactive"
                          disabled={settingPrimaryOrg}
                          onClick={() => handleSetPrimaryOrg(o.id, o.name)}
                        >
                          <Star className="h-3.5 w-3.5" />
                          Сделать основной
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="animate-slide-up stagger-4 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">Зона ответственности</h2>
          </div>
          {isOwnProfile && !editingResponsibility && (
            <Button variant="ghost" size="sm" onClick={handleStartEditingResponsibility} className="h-7 text-xs interactive">
              Редактировать
            </Button>
          )}
        </div>
        <div className="p-5">
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
        </div>
      </Card>

      {isModuleEnabled('vacation') && (
        <PlannedVacationsBlock userId={id!} />
      )}

      <Card className="animate-slide-up stagger-6 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FolderKanban className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Проекты</h2>
              <p className="text-xs text-muted-foreground">{projects.length} всего</p>
            </div>
          </div>
          {canEditProfile && (
            <Button variant="outline" size="sm" onClick={() => setIsAddProjectModalOpen(true)} className="h-7 gap-1.5 text-xs interactive">
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </Button>
          )}
        </div>
        <div className="p-5">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-10 text-center">
              <FolderKanban className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">Нет проектов</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((project) => {
                const ps = projectStatusConfig[project.status] ?? projectStatusConfig.active
                const StatusIcon = ps.icon
                return (
                  <div
                    key={project.id}
                    className="group flex items-start gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-primary/20 hover:bg-primary/5"
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ps.bg}`}>
                      <StatusIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{project.name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium ${ps.bg}`}>
                          {ps.label}
                        </span>
                        <span className="text-[10px] capitalize text-muted-foreground">
                          {project.role === 'lead' ? 'Руководитель' : 'Участник'}
                        </span>
                      </div>
                      {project.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
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

      <AvatarCropModal
        isOpen={cropModalOpen}
        imageSrc={cropImageSrc}
        uploading={avatarUploading}
        onCancel={closeCropModal}
        onConfirm={handleCropConfirm}
      />
    </div>
  )
}

interface PlannedVacationSubstitute {
  id: number
  last_name: string
  first_name: string
  middle_name?: string | null
}

interface PlannedVacation {
  id: number
  start_date: string
  end_date: string
  status: 'approved' | 'on_approval'
  created_at?: string
  substitutes: PlannedVacationSubstitute[]
}

function PlannedVacationsBlock({ userId }: { userId: string }) {
  const [nearest, setNearest] = useState<PlannedVacation | null>(null)

  useEffect(() => {
    let cancelled = false
    apiGet<PlannedVacation[]>(`/vacation/upcoming/${userId}`)
      .then((data) => { if (!cancelled) setNearest(data[0] ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  if (!nearest) return null

  return (
    <Card className="animate-slide-up stagger-5 overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarDays className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold leading-tight">Запланированные отпуска</h2>
      </div>
      <div className="p-5">
        <PlannedVacationCard
          start={nearest.start_date}
          end={nearest.end_date}
          createdAt={nearest.created_at}
          status={nearest.status}
          substitutes={nearest.substitutes}
        />
      </div>
    </Card>
  )
}

function InfoRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value?: string | null; href?: string }) {
  const content = (
    <div className="flex items-center gap-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value || '—'}</p>
      </div>
    </div>
  )
  if (href && value) {
    return (
      <a href={href} className="-mx-2 block rounded-lg px-2 transition-colors hover:bg-muted/40">
        {content}
      </a>
    )
  }
  return content
}
