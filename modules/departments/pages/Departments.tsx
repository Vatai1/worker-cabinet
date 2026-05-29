import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { Input } from '@/shared/components/ui/Input'
import { Building2, Loader2, Search, Users, ArrowRight, Crown, Sparkles } from 'lucide-react'
import { getErrorMessage } from '@/shared/lib/utils'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'

interface Department {
  id: number
  name: string
  manager_id: number | null
  manager_name: string | null
  employee_count: string
}

const deptColors = [
  { bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', accent: 'from-indigo-500/20 to-indigo-500/0', border: 'border-indigo-500/15' },
  { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', accent: 'from-violet-500/20 to-violet-500/0', border: 'border-violet-500/15' },
  { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', accent: 'from-blue-500/20 to-blue-500/0', border: 'border-blue-500/15' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', accent: 'from-cyan-500/20 to-cyan-500/0', border: 'border-cyan-500/15' },
  { bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', accent: 'from-teal-500/20 to-teal-500/0', border: 'border-teal-500/15' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', accent: 'from-emerald-500/20 to-emerald-500/0', border: 'border-emerald-500/15' },
  { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', accent: 'from-amber-500/20 to-amber-500/0', border: 'border-amber-500/15' },
  { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', accent: 'from-rose-500/20 to-rose-500/0', border: 'border-rose-500/15' },
]

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

  const topDepts = useMemo(() =>
    [...departments].sort((a, b) => parseInt(b.employee_count || '0') - parseInt(a.employee_count || '0')).slice(0, 3),
    [departments]
  )

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

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-white/3 rounded-full blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-white/60" />
            <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Структура компании</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Отделы</h1>
          <p className="mt-2 text-white/45 text-sm">
            {departments.length} {departments.length === 1 ? 'отдел' : 'отделов'} · {totalEmployees} сотрудников в компании
          </p>
          {topDepts.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              {topDepts.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => navigate(`/departments/${d.id}`)}
                  className="flex items-center gap-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                >
                  <span className="text-white/40">#{i + 1}</span>
                  {d.name}
                  <span className="text-white/40 ml-1">{d.employee_count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-sm font-medium">{filtered.length} {filtered.length === 1 ? 'отдел' : 'отделов'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {filtered.reduce((s, d) => s + parseInt(d.employee_count || '0'), 0)} сотрудников
          </div>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            className="pl-10 h-10"
            placeholder="Поиск по названию или руководителю..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 page-grid">
          {filtered.map((department, index) => {
            const color = deptColors[department.id % deptColors.length]
            const count = parseInt(department.employee_count || '0')
            const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'
            return (
              <Card
                key={department.id}
                className={`hover-lift group cursor-pointer animate-slide-up ${staggerClass}`}
                onClick={() => navigate(`/departments/${department.id}`)}
              >
                <CardContent className="p-0">
                  <div className={`h-1.5 rounded-t-2xl bg-gradient-to-r ${color.accent}`} />
                  <div className="p-5 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`h-12 w-12 shrink-0 rounded-xl ${color.bg} flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
                        <Building2 className={`h-6 w-6 ${color.text}`} />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200 mt-1" />
                    </div>

                    <div className="mt-4">
                      <h3 className="font-bold text-[15px] leading-tight group-hover:text-primary transition-colors duration-200">{department.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {count} {count === 1 ? 'сотрудник' : count < 5 ? 'сотрудника' : 'сотрудников'}
                      </div>
                    </div>

                    {department.manager_name && (
                      <div className="mt-4 pt-3 border-t border-border/40">
                        <div className="flex items-center gap-2">
                          <Crown className="h-3.5 w-3.5 text-primary/50" />
                          <span className="text-xs text-muted-foreground truncate">{department.manager_name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 mb-4">
            <Building2 className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground/70">
            {search ? 'Отделы не найдены по запросу' : 'Отделы не найдены'}
          </p>
        </div>
      )}
    </div>
  )
}
