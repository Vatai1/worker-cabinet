import { create } from 'zustand'
import { API_BASE_URL } from '@/shared/lib/api'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getAuthHeaders } from '@/shared/lib/authHeaders'

export interface Department {
  id: number
  name: string
  manager_name?: string | null
  employee_count?: string | number
  vacation_requests_blocked?: boolean
}

interface DepartmentsState {
  departments: Department[]
  loaded: boolean
  fetchDepartments: () => Promise<void>
  invalidateDepartments: () => void
}

export const useDepartmentsStore = create<DepartmentsState>((set, get) => ({
  departments: [],
  loaded: false,

  fetchDepartments: async () => {
    if (get().loaded) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ departments: data, loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },

  invalidateDepartments: () => {
    set({ departments: [], loaded: false })
  },
}))
