import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useOrgStore } from '@/shared/store/orgStore'

export interface GlobalSearchUser {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position?: string | null
  department_name?: string | null
  avatar?: string | null
  skills?: string[]
}

export interface GlobalSearchDepartment {
  id: number
  name: string
  manager_name?: string | null
}

export interface GlobalSearchProject {
  id: number
  name: string
  status?: string | null
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Активный',
  completed: 'Завершён',
  paused: 'Приостановлен',
}

export interface GlobalSearchLimits {
  employees: number
  departments: number
  projects: number
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE_URL}${path}`, { headers: getAuthHeaders(), signal })
  if (!res.ok) throw new Error('Ошибка запроса')
  return res.json()
}

export function useGlobalSearch(query: string, limits: GlobalSearchLimits) {
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const projectsEnabled = isModuleEnabled('projects')
  const currentOrgId = useOrgStore((s) => s.currentOrgId)

  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [employees, setEmployees] = useState<GlobalSearchUser[]>([])
  const [departments, setDepartments] = useState<GlobalSearchDepartment[]>([])
  const [projects, setProjects] = useState<GlobalSearchProject[]>([])
  const [deptCache, setDeptCache] = useState<GlobalSearchDepartment[]>([])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastDeptOrgRef = useRef<number | null | undefined>(undefined)
  const limitsRef = useRef(limits)
  limitsRef.current = limits

  useEffect(() => {
    if (lastDeptOrgRef.current === currentOrgId) return
    lastDeptOrgRef.current = currentOrgId
    getJson<GlobalSearchDepartment[]>('/departments')
      .then(setDeptCache)
      .catch(() => setDeptCache([]))
  }, [currentOrgId])

  const runSearch = useCallback((q: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { employees: empLimit, departments: deptLimit, projects: projLimit } = limitsRef.current

    setLoading(true)
    setSearched(false)

    const lower = q.toLowerCase()
    setDepartments(deptCache.filter((d) => d.name.toLowerCase().includes(lower)).slice(0, deptLimit))

    Promise.allSettled([
      getJson<GlobalSearchUser[]>(`/users/search?q=${encodeURIComponent(q)}`, controller.signal),
      projectsEnabled
        ? getJson<GlobalSearchProject[]>(`/projects?search=${encodeURIComponent(q)}`, controller.signal)
        : Promise.resolve([] as GlobalSearchProject[]),
    ]).then(([usersRes, projectsRes]) => {
      if (controller.signal.aborted) return
      setEmployees(usersRes.status === 'fulfilled' ? usersRes.value.slice(0, empLimit) : [])
      setProjects(projectsEnabled && projectsRes.status === 'fulfilled' ? projectsRes.value.slice(0, projLimit) : [])
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
      return
    }
    debounceRef.current = setTimeout(() => runSearch(q), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, runSearch])

  return { employees, departments, projects, loading, searched }
}
