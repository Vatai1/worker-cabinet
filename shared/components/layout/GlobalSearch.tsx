import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Loader2, Building2, FolderKanban } from 'lucide-react'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { cn, personName } from '@/shared/lib/utils'

interface UserResult {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position?: string | null
  department_name?: string | null
  avatar?: string | null
  skills?: string[]
}

interface DepartmentResult {
  id: number
  name: string
  manager_name?: string | null
}

interface ProjectResult {
  id: number
  name: string
  status?: string | null
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Активный',
  completed: 'Завершён',
  paused: 'Приостановлен',
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE_URL}${path}`, { headers: getAuthHeaders(), signal })
  if (!res.ok) throw new Error('Ошибка запроса')
  return res.json()
}

interface GlobalSearchProps {
  className?: string
  autoFocus?: boolean
  onNavigate?: () => void
}

export function GlobalSearch({ className, autoFocus, onNavigate }: GlobalSearchProps) {
  const navigate = useNavigate()
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const projectsEnabled = isModuleEnabled('projects')
  const currentOrgId = useOrgStore((s) => s.currentOrgId)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [employees, setEmployees] = useState<UserResult[]>([])
  const [departments, setDepartments] = useState<DepartmentResult[]>([])
  const [projects, setProjects] = useState<ProjectResult[]>([])
  const [deptCache, setDeptCache] = useState<DepartmentResult[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastDeptOrgRef = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    if (lastDeptOrgRef.current === currentOrgId) return
    lastDeptOrgRef.current = currentOrgId
    getJson<DepartmentResult[]>('/departments')
      .then(setDeptCache)
      .catch(() => setDeptCache([]))
  }, [currentOrgId])

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

  const runSearch = useCallback((q: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setSearched(false)

    const lower = q.toLowerCase()
    setDepartments(deptCache.filter((d) => d.name.toLowerCase().includes(lower)).slice(0, 3))

    Promise.allSettled([
      getJson<UserResult[]>(`/users/search?q=${encodeURIComponent(q)}`, controller.signal),
      projectsEnabled
        ? getJson<ProjectResult[]>(`/projects?search=${encodeURIComponent(q)}`, controller.signal)
        : Promise.resolve([] as ProjectResult[]),
    ]).then(([usersRes, projectsRes]) => {
      if (controller.signal.aborted) return
      setEmployees(usersRes.status === 'fulfilled' ? usersRes.value.slice(0, 5) : [])
      setProjects(projectsEnabled && projectsRes.status === 'fulfilled' ? projectsRes.value.slice(0, 3) : [])
      setLoading(false)
      setSearched(true)
    })
  }, [deptCache, projectsEnabled])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      abortRef.current?.abort()
      setEmployees([])
      setDepartments([])
      setProjects([])
      setLoading(false)
      setSearched(false)
      setOpen(false)
      return
    }
    setOpen(true)
    debounceRef.current = setTimeout(() => runSearch(q), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, runSearch])

  const closeAndClear = () => {
    setOpen(false)
    setQuery('')
    setEmployees([])
    setDepartments([])
    setProjects([])
    setSearched(false)
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
              {employees.map((u) => {
                const q = query.trim().toLowerCase()
                const matchedTag = q ? u.skills?.find((s) => s.toLowerCase().includes(q)) : undefined
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectEmployee(u.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={u.avatar || generateAvatarUrl(String(u.id))} alt={personName(u.last_name, u.first_name, u.middle_name)} />
                      <AvatarFallback className="text-xs">{u.first_name[0]}{u.last_name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{personName(u.last_name, u.first_name, u.middle_name)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[u.position, u.department_name].filter(Boolean).join(' · ')}
                      </p>
                      {matchedTag && (
                        <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {matchedTag}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {departments.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs uppercase text-muted-foreground">Отделы</p>
              {departments.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={handleSelectDepartment}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    {d.manager_name && <p className="truncate text-xs text-muted-foreground">{d.manager_name}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {projects.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs uppercase text-muted-foreground">Проекты</p>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={handleSelectProject}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <FolderKanban className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    {p.status && (
                      <p className="truncate text-xs text-muted-foreground">{PROJECT_STATUS_LABELS[p.status] ?? p.status}</p>
                    )}
                  </div>
                </button>
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
