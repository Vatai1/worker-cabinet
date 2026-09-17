import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useGlobalSearch } from '@/shared/hooks/useGlobalSearch'
import { EmployeeResultRow, DepartmentResultRow, ProjectResultRow } from '@/shared/components/search/SearchResultRows'

interface GlobalSearchProps {
  className?: string
  autoFocus?: boolean
  onNavigate?: () => void
}

export function GlobalSearch({ className, autoFocus, onNavigate }: GlobalSearchProps) {
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const { employees, departments, projects, loading, searched } = useGlobalSearch(query, {
    employees: 5,
    departments: 3,
    projects: 3,
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setOpen(false)
    }
  }, [query])

  const closeAndClear = () => {
    setOpen(false)
    setQuery('')
    onNavigate?.()
  }

  const handleSelectEmployee = (id: number) => {
    navigate(`/employees/${id}`)
    closeAndClear()
  }

  const handleSelectDepartment = () => {
    navigate('/departments')
    closeAndClear()
  }

  const handleSelectProject = () => {
    navigate('/projects')
    closeAndClear()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
    if (e.key === 'Enter') {
      const q = query.trim()
      if (q.length < 2) return
      navigate(`/search?q=${encodeURIComponent(q)}`)
      closeAndClear()
    }
  }

  const nothingFound = searched && !loading && employees.length === 0 && departments.length === 0 && projects.length === 0

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        {loading ? (
          <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
          onKeyDown={handleInputKeyDown}
          placeholder="Поиск: работники, отделы, проекты…"
          className="w-full rounded-xl border border-input bg-card py-2 pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {employees.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs uppercase text-muted-foreground">Работники</p>
              {employees.map((u) => (
                <EmployeeResultRow key={u.id} user={u} query={query} onClick={() => handleSelectEmployee(u.id)} />
              ))}
            </div>
          )}

          {departments.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs uppercase text-muted-foreground">Отделы</p>
              {departments.map((d) => (
                <DepartmentResultRow key={d.id} department={d} onClick={handleSelectDepartment} />
              ))}
            </div>
          )}

          {projects.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs uppercase text-muted-foreground">Проекты</p>
              {projects.map((p) => (
                <ProjectResultRow key={p.id} project={p} onClick={handleSelectProject} />
              ))}
            </div>
          )}

          {nothingFound && (
            <p className="py-6 text-center text-sm text-muted-foreground">Ничего не найдено</p>
          )}
        </div>
      )}
    </div>
  )
}
