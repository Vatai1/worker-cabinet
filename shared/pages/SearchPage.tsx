import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { useGlobalSearch } from '@/shared/hooks/useGlobalSearch'
import { EmployeeResultRow, DepartmentResultRow, ProjectResultRow } from '@/shared/components/search/SearchResultRows'

function pluralize(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const query = searchParams.get('q') ?? ''
  const [input, setInput] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInput(query)
  }, [query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { employees, departments, projects, loading, searched } = useGlobalSearch(query, {
    employees: 10,
    departments: 5,
    projects: 5,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = input.trim()
    if (value.length >= 2) setSearchParams({ q: value })
  }

  const handleSelectEmployee = (id: number) => navigate(`/employees/${id}`)
  const handleSelectDepartment = () => navigate('/departments')
  const handleSelectProject = () => navigate('/projects')

  const hasQuery = query.trim().length >= 2
  const total = employees.length + departments.length + projects.length
  const hasResults = total > 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Поиск</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasQuery
            ? loading
              ? 'Ищем…'
              : `${total} ${pluralize(total, 'результат', 'результата', 'результатов')} по запросу «${query}»`
            : 'Работники, отделы и проекты по одному запросу'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          {loading ? (
            <Loader2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Поиск: работники, отделы, проекты…"
            className="h-12 w-full rounded-2xl border border-input bg-card py-3 pl-12 pr-4 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <Button type="submit" disabled={input.trim().length < 2} className="h-12 rounded-2xl px-6">
          Найти
        </Button>
      </form>

      {!hasQuery ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Search className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-medium">Начните вводить запрос</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Имя работника, название отдела или проекта — минимум 2 символа
          </p>
        </div>
      ) : loading && !hasResults ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasResults ? (
        searched ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground/60">
              <Search className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium">Ничего не найдено</p>
            <p className="mt-1 text-sm text-muted-foreground">По запросу «{query}» нет совпадений</p>
          </div>
        ) : null
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
            <span className="text-2xl font-bold tabular-nums">{total}</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {employees.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {employees.length} {pluralize(employees.length, 'работник', 'работника', 'работников')}
                </span>
              )}
              {departments.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {departments.length} {pluralize(departments.length, 'отдел', 'отдела', 'отделов')}
                </span>
              )}
              {projects.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {projects.length} {pluralize(projects.length, 'проект', 'проекта', 'проектов')}
                </span>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {employees.length > 0 && (
              <div className="border-l-[3px] border-accent">
                <p className="px-4 pb-1 pt-3 text-xs font-medium text-muted-foreground">Работники</p>
                <div className="pb-1">
                  {employees.map((u) => (
                    <EmployeeResultRow key={u.id} user={u} query={query} onClick={() => handleSelectEmployee(u.id)} variant="cozy" />
                  ))}
                </div>
              </div>
            )}

            {departments.length > 0 && (
              <div className={`border-l-[3px] border-primary ${employees.length > 0 ? 'border-t border-t-border' : ''}`}>
                <p className="px-4 pb-1 pt-3 text-xs font-medium text-muted-foreground">Отделы</p>
                <div className="pb-1">
                  {departments.map((d) => (
                    <DepartmentResultRow key={d.id} department={d} query={query} onClick={handleSelectDepartment} variant="cozy" />
                  ))}
                </div>
              </div>
            )}

            {projects.length > 0 && (
              <div className={`border-l-[3px] border-amber-500 ${employees.length > 0 || departments.length > 0 ? 'border-t border-t-border' : ''}`}>
                <p className="px-4 pb-1 pt-3 text-xs font-medium text-muted-foreground">Проекты</p>
                <div className="pb-1">
                  {projects.map((p) => (
                    <ProjectResultRow key={p.id} project={p} query={query} onClick={handleSelectProject} variant="cozy" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
