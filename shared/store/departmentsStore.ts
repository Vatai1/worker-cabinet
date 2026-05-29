import { create } from 'zustand'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'

interface DepartmentsState {
  departments: any[]
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
      const res = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
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
