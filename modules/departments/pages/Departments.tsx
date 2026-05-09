import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/shared/components/ui/Input'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAvatarColor as getAvatarGradient } from '@/shared/lib/constants'
import { getErrorMessage } from '@/shared/lib/utils'
import { Building2, Loader2, Search, Users, User, ChevronRight } from 'lucide-react'

interface Department {
  id: number
  name: string
  manager_id: number | null
  manager_name: string | null
  employee_count: string
}

export function Departments() {
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
        if (!response.ok) throw new Error('Не удалось загрузить список отделов')
        setDepartments(await response.json())
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    fetchDepartments()
  }, [])

  const filtered = departments.filter((d) => {
    const q = search.toLowerCase()
    return d.name?.toLowerCase().includes(q) || d.manager_name?.toLowerCase().includes(q)
  })

  const totalEmployees = departments.reduce((sum, d) => sum + parseInt(d.employee_count || '0'), 0)

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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Отделы</h1>
          <p className="text-muted-foreground mt-1">
            {departments.length} отделов · {totalEmployees} сотрудников
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по названию отдела..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((department) => {
            const color = getAvatarGradient(department.id.toString())

            return (
              <button
                key={department.id}
                onClick={() => navigate(`/departments/${department.id}`)}
                className="group text-left rounded-2xl border border-border/60 bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{department.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {department.employee_count} сотрудников
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {department.manager_name && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Руководитель: {department.manager_name}</span>
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <Building2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            {search ? 'Отделы не найдены по запросу' : 'Отделы не найдены'}
          </p>
        </div>
      )}
    </div>
  )
}
