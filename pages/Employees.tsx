import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Users, Loader2, Search, Mail, Phone, Building2, ChevronRight } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

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
}

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch (e) {
      console.error('[Employees] Error parsing auth storage:', e)
    }
  }
  return headers
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning'; dot: string }> = {
  active:   { label: 'Активен',   variant: 'success',     dot: 'bg-emerald-500' },
  inactive: { label: 'Неактивен', variant: 'destructive', dot: 'bg-red-500' },
  on_leave: { label: 'В отпуске', variant: 'warning',     dot: 'bg-amber-500' },
}

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

export function Employees() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoading(true)
        const params = user?.departmentId ? `?departmentId=${user.departmentId}` : ''
        const response = await fetch(`${API_BASE_URL}/users${params}`, { headers: getAuthHeaders() })
        if (!response.ok) throw new Error('Не удалось загрузить список сотрудников')
        setEmployees(await response.json())
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchEmployees()
  }, [user?.departmentId])

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase()
    return (
      e.first_name?.toLowerCase().includes(q) ||
      e.last_name?.toLowerCase().includes(q) ||
      e.position?.toLowerCase().includes(q) ||
      e.department_name?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
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
          <h1 className="text-3xl font-bold tracking-tight">Сотрудники</h1>
          <p className="text-muted-foreground mt-1">
            {user?.department ? `Отдел: ${user.department}` : 'Все сотрудники'} · {employees.length} чел.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по имени, должности…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((employee) => {
            const status = statusConfig[employee.status] ?? statusConfig.active
            const color = getAvatarColor(employee.id)

            return (
              <button
                key={employee.id}
                onClick={() => navigate(`/employees/${employee.id}`)}
                className="group text-left rounded-2xl border border-border/60 bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-12 w-12 shrink-0 ring-2 ring-primary/10">
                      <AvatarFallback className={`bg-gradient-to-br ${color} text-white text-sm font-bold`}>
                        {employee.first_name?.[0]}{employee.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {employee.last_name} {employee.first_name}
                        {employee.middle_name ? ` ${employee.middle_name}` : ''}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">{employee.position}</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <div className="mt-4 space-y-2">
                  {employee.department_name && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{employee.department_name}</span>
                    </div>
                  )}
                  {employee.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{employee.email}</span>
                    </div>
                  )}
                  {employee.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{employee.phone}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                  <Badge variant={status.variant} className="text-xs">
                    {status.label}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            {search ? 'Никого не нашли по запросу' : 'Сотрудники не найдены'}
          </p>
        </div>
      )}
    </div>
  )
}
