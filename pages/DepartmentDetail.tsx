import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { getAuthHeaders } from '@/lib/authHeaders'
import { API_BASE_URL } from '@/lib/api'
import { getAvatarColor as getAvatarGradient } from '@/lib/constants'
import { getErrorMessage } from '@/lib/utils'
import { Loader2, Search, Users, User, ChevronRight, ArrowLeft } from 'lucide-react'

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
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  if (!department) return null

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          to="/departments"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{department.name}</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <Users className="h-4 w-4" />
            {department.employees.length} сотрудников
          </p>
        </div>
      </div>

      {department.manager_name && (
        <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Руководитель</div>
            <div className="font-medium">{department.manager_name}</div>
          </div>
        </div>
      )}

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Поиск по имени, должности..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((employee) => {
            const status = statusConfig[employee.status] ?? statusConfig.active
            const color = getAvatarGradient(employee.id.toString())

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
            {search ? 'Сотрудники не найдены по запросу' : 'Сотрудники не найдены'}
          </p>
        </div>
      )}
    </div>
  )
}
