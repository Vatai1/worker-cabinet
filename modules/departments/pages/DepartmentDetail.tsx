import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { Input } from '@/shared/components/ui/Input'
import { Loader2, Search, Users, ArrowLeft, Crown, Mail, Phone, UserCircle, ChevronRight } from 'lucide-react'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { getErrorMessage } from '@/shared/lib/utils'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'

interface Employee {
  id: number
  first_name: string
  last_name: string
  middle_name?: string
  position: string
  email: string
  phone?: string
  status: string
  role: string
  gender?: 'male' | 'female' | 'other'
  avatar?: string
}

interface Department {
  id: number
  name: string
  manager_id: number | null
  manager_name: string | null
  employees: Employee[]
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning'; dot: string }> = {
  active:   { label: 'Активен',   variant: 'success',     dot: 'bg-emerald-500' },
  inactive: { label: 'Неактивен', variant: 'destructive', dot: 'bg-red-500' },
  on_leave: { label: 'В отпуске', variant: 'warning',     dot: 'bg-amber-500' },
}

export function DepartmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [department, setDepartment] = useState<Department | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchDepartment = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/departments/${id}`, { headers: getAuthHeaders() })
        if (!response.ok) throw new Error('Не удалось загрузить информацию об отделе')
        setDepartment(await response.json())
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchDepartment()
  }, [id])

  const filtered = department?.employees.filter((e) => {
    const q = search.toLowerCase()
    return (
      e.first_name?.toLowerCase().includes(q) ||
      e.last_name?.toLowerCase().includes(q) ||
      e.position?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q)
    )
  }) || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  if (!department) return null

  const manager = department.employees.find((e) => e.id === department.manager_id)
  const members = filtered.filter((e) => e.id !== department.manager_id)
  const activeCount = department.employees.filter((e) => e.status === 'active').length
  const onLeaveCount = department.employees.filter((e) => e.status === 'on_leave').length

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="page-header">
        <Link
          to="/departments"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Все отделы
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-card/3 rounded-full blur-2xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 bg-card/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/15 shrink-0">
            <Users className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">{department.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-white/50">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {department.employees.length} сотрудников
              </span>
              {activeCount > 0 && <span>{activeCount} активно</span>}
              {onLeaveCount > 0 && <span>{onLeaveCount} в отпуске</span>}
            </div>
          </div>
        </div>
      </div>

      {manager && (
        <Card className="hover-lift animate-slide-up stagger-1 border-primary/10">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-primary/5 to-transparent p-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary/60 mb-3">
                <Crown className="h-3.5 w-3.5" />
                Руководитель отдела
              </div>
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 ring-2 ring-primary/15 shadow-md shrink-0">
                  <AvatarImage src={manager.avatar || generateAvatarUrl(manager.id.toString(), manager.gender)} alt={`${manager.first_name} ${manager.last_name}`} />
                  <AvatarFallback className="text-base font-bold bg-primary/10 text-primary">
                    {manager.first_name?.[0]}{manager.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-lg leading-tight">
                    {manager.last_name} {manager.first_name}{manager.middle_name ? ` ${manager.middle_name}` : ''}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{manager.position}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                      <Mail className="h-3 w-3" />
                      {manager.email}
                    </span>
                    {manager.phone && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                        <Phone className="h-3 w-3" />
                        {manager.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {members.length} {members.length === 1 ? 'сотрудник' : members.length < 5 ? 'сотрудника' : 'сотрудников'}
          </span>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            className="pl-10 h-10"
            placeholder="Поиск по имени, должности..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {members.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 page-grid">
          {members.map((employee, index) => {
            const status = statusConfig[employee.status] ?? statusConfig.active
            const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'

            return (
              <Card
                key={employee.id}
                className={`hover-lift group cursor-pointer animate-slide-up ${staggerClass}`}
                onClick={() => navigate(`/employees/${employee.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-center gap-3.5">
                    <div className="relative shrink-0">
                      <Avatar className="h-12 w-12 ring-2 ring-border/50 transition-all duration-200 group-hover:ring-primary/20">
                        <AvatarImage
                          src={employee.avatar || generateAvatarUrl(employee.id.toString(), employee.gender)}
                          alt={`${employee.first_name} ${employee.last_name}`}
                        />
                        <AvatarFallback className="bg-primary/8 text-primary text-sm font-bold">
                          {employee.first_name?.[0]}{employee.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ${status.dot} ring-2 ring-card`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-sm leading-tight truncate group-hover:text-primary transition-colors duration-200">
                        {employee.last_name} {employee.first_name}{employee.middle_name ? ` ${employee.middle_name}` : ''}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{employee.position}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 mb-4">
            <Users className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground/70">
            {search ? 'Сотрудники не найдены по запросу' : 'Сотрудники не найдены'}
          </p>
        </div>
      )}
    </div>
  )
}
