import { create } from 'zustand'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'

interface ModulesState {
  enabledModules: Set<string>
  badges: Record<string, string>
  loaded: boolean
  fetchModules: () => Promise<void>
  isModuleEnabled: (code: string) => boolean
  modulesLoaded: boolean
}

const moduleChecker = (loaded: boolean, enabled: Set<string>) => (code: string) => !loaded || enabled.has(code)

export const useModulesStore = create<ModulesState>((set, get) => ({
  enabledModules: new Set<string>(),
  badges: {},
  loaded: false,
  modulesLoaded: false,

  fetchModules: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/modules`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const modules = (data.modules ?? []) as { code: string; dashboard_badge?: string | null }[]
        const badges: Record<string, string> = {}
        for (const m of modules) {
          if (m.dashboard_badge) badges[m.code] = m.dashboard_badge
        }
        const enabledModules = new Set(data.enabled as string[])
        set({ enabledModules, badges, loaded: true, modulesLoaded: true, isModuleEnabled: moduleChecker(true, enabledModules) })
      } else {
        set({ loaded: true, modulesLoaded: true, isModuleEnabled: moduleChecker(true, get().enabledModules) })
      }
    } catch {
      set({ loaded: true, modulesLoaded: true, isModuleEnabled: moduleChecker(true, get().enabledModules) })
    }
  },

  isModuleEnabled: moduleChecker(false, new Set<string>()),
}))

if (typeof window !== 'undefined') {
  window.addEventListener('org-changed', () => {
    useModulesStore.getState().fetchModules()
  })
}
