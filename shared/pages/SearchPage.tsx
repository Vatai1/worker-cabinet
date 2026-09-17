import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { useGlobalSearch } from '@/shared/hooks/useGlobalSearch'
import { EmployeeResultRow, DepartmentResultRow, ProjectResultRow } from '@/shared/components/search/SearchResultRows'

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
  const hasResults = employees.length > 0 || departments.length > 0 || projects.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Поиск</h1>
        <p className="mt-1 text-sm text-muted-foreground">Работники, отделы и проекты по одному запросу</p>
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
        <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center text-sm text-muted-foreground">
          Введите запрос (минимум 2 символа) и нажмите Enter
        </div>
      ) : loading && !hasResults ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasResults ? (
        searched ? (
          <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center text-sm text-muted-foreground">
            По запросу «{query}» ничего не найдено
          </div>
        ) : null
      ) : (
        <div className="space-y-4">
          {employees.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-2 px-1 text-xs uppercase tracking-wide text-muted-foreground">
                Работники
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{employees.length}</span>
              </p>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {employees.map((u) => (
                  <EmployeeResultRow key={u.id} user={u} query={query} onClick={() => handleSelectEmployee(u.id)} />
                ))}
              </div>
            </section>
          )}

          {departments.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-2 px-1 text-xs uppercase tracking-wide text-muted-foreground">
                Отделы
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{departments.length}</span>
              </p>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {departments.map((d) => (
                  <DepartmentResultRow key={d.id} department={d} onClick={handleSelectDepartment} />
                ))}
              </div>
            </section>
          )}

          {projects.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-2 px-1 text-xs uppercase tracking-wide text-muted-foreground">
                Проекты
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{projects.length}</span>
              </p>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {projects.map((p) => (
                  <ProjectResultRow key={p.id} project={p} onClick={handleSelectProject} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
