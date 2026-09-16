import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { Badge } from '@/shared/components/ui/Badge'
import { Input } from '@/shared/components/ui/Input'
import { useAuthStore } from '@/core/auth/store/authStore'

import { Users, Search, Mail, Phone, Building2, Sparkles, UserCheck, UserX, ArrowRight, Tag } from 'lucide-react'

import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { getAvatarColor as getAvatarGradient } from '@/shared/lib/constants'
import { getErrorMessage, personName } from '@/shared/lib/utils'

interface Employee {
  id: string
  first_name: string
  last_name: string
  middle_name?: string
  position: string
  department_name?: string
  phone?: string
  email: string
  status: 'active' | 'inactive' | 'on_leave'
  role: string
  gender?: 'male' | 'female' | 'other'
  avatar?: string
  skills?: string[]
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning'; dot: string; icon: typeof UserCheck; color: string }> = {
  active:   { label: 'Активен',   variant: 'success',     dot: 'bg-emerald-500', icon: UserCheck, color: 'text-emerald-500' },
  inactive: { label: 'Неактивен', variant: 'destructive', dot: 'bg-red-500',     icon: UserX,    color: 'text-red-500' },
  on_leave: { label: 'В отпуске', variant: 'warning',     dot: 'bg-amber-500',   icon: Users,    color: 'text-amber-500' },
}

export function Employees() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoading(true)
        const params = user?.departmentId ? `?departmentId=${user.departmentId}` : ''
        const response = await fetch(`${API_BASE_URL}/users${params}`, { headers: getAuthHeadersWithContentType() })
        if (!response.ok) throw new Error('Не удалось загрузить список работников')
        setEmployees(await response.json())
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    fetchEmployees()
  }, [user?.departmentId])

  useEffect(() => {
    fetch(`${API_BASE_URL}/users/skills/all`, { headers: getAuthHeadersWithContentType() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { name: string }[]) => setAllTags(data.map((s) => s.name)))
      .catch(() => setAllTags([]))
  }, [])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase()
    const matchesSearch = !q || (
      e.first_name?.toLowerCase().includes(q) ||
      e.last_name?.toLowerCase().includes(q) ||
      e.position?.toLowerCase().includes(q) ||
      e.department_name?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.skills?.some((s) => s.toLowerCase().includes(q))
    )
    const matchesTags = selectedTags.length === 0 || selectedTags.some((t) => e.skills?.includes(t))
    return matchesSearch && matchesTags
  })


  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="h-48 rounded-2xl gradient-primary animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-52 rounded-2xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center animate-fade-in">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-card/3 rounded-full blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-white/60" />
            <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Коллектив</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Работники</h1>
          <p className="mt-2 text-white/45 text-sm">
            {user?.department ? `Отдел: ${user.department}` : 'Все работники компании'}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span className="text-sm font-medium">{filtered.length} из {employees.length} работников</span>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            className="pl-10 h-10"
            placeholder="Поиск по имени, должности, тегам…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          {allTags.map((tag) => {
            const active = selectedTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/70'
                }`}
              >
                {tag}
              </button>
            )
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Сбросить
            </button>
          )}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="page-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((employee, index) => {
            const status = statusConfig[employee.status] ?? statusConfig.active
            const color = getAvatarGradient(employee.id)
            const staggerClass = index < 8 ? `stagger-${index + 1}` : ''

            return (
              <button
                key={employee.id}
                onClick={() => navigate(`/employees/${employee.id}`)}
                className={`group hover-lift text-left rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring animate-slide-up ${staggerClass}`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-3.5">
                    <div className="relative shrink-0">
                      <Avatar className="h-14 w-14 ring-2 ring-primary/10 transition-transform duration-200 group-hover:scale-105">
                        <AvatarImage
                          src={employee.avatar || generateAvatarUrl(employee.id, employee.gender)}
                          alt={personName(employee.last_name, employee.first_name, employee.middle_name)}
                        />
                        <AvatarFallback className={`bg-gradient-to-br ${color} text-white text-base font-bold`}>
                          {employee.first_name?.[0]}{employee.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${status.dot}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-[15px] truncate group-hover:text-primary transition-colors duration-200">
                            {employee.last_name} {employee.first_name}
                            {employee.middle_name ? ` ${employee.middle_name}` : ''}
                          </div>
                          <div className="text-sm text-muted-foreground truncate mt-0.5">{employee.position}</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200 shrink-0 mt-1" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 pl-0.5">
                    {employee.department_name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        <span className="truncate">{employee.department_name}</span>
                      </div>
                    )}
                    {employee.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        <span className="truncate">{employee.email}</span>
                      </div>
                    )}
                    {employee.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        <span>{employee.phone}</span>
                      </div>
                    )}
                  </div>

                  {employee.skills && employee.skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {employee.skills.slice(0, 4).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                      {employee.skills.length > 4 && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium text-muted-foreground/60">
                          +{employee.skills.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                    <Badge variant={status.variant} className="text-xs">
                      {status.label}
                    </Badge>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-20 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 mb-4">
            <Users className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground/70">
            {search ? 'Никого не нашли по запросу' : 'Работники не найдены'}
          </p>
        </div>
      )}
    </div>
  )
}
