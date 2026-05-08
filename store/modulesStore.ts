import { create } from 'zustand'
import { API_BASE_URL } from '@/lib/api'

interface ModulesState {
  enabledModules: Set<string>
  loaded: boolean
  fetchModules: () => Promise<void>
  isModuleEnabled: (code: string) => boolean
}

export const useModulesStore = create<ModulesState>((set, get) => ({
  enabledModules: new Set<string>(),
  loaded: false,

  fetchModules: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/modules`)
      if (res.ok) {
        const data = await res.json()
        set({ enabledModules: new Set(data.enabled as string[]), loaded: true })
      } else {
        console.error('[ModulesStore] fetch failed:', res.status)
        set({ loaded: true })
      }
    } catch (err) {
      console.error('[ModulesStore] fetch error:', err)
      set({ loaded: true })
    }
  },

  isModuleEnabled: (code: string) => {
    const state = get()
    if (!state.loaded) return true
    return state.enabledModules.has(code)
  },
}))
