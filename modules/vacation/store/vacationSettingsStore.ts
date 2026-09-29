import { useEffect } from 'react'
import { create } from 'zustand'
import { apiGet, apiPut } from '@/shared/lib/apiClient'

interface VacationSettingsState {
  allowOverBalance: boolean
  loaded: boolean
  load: () => Promise<void>
  setAllowOverBalance: (value: boolean) => Promise<void>
}

export const useVacationSettingsStore = create<VacationSettingsState>((set) => ({
  allowOverBalance: false,
  loaded: false,
  load: async () => {
    try {
      const res = await apiGet<{ allowOverBalance: boolean }>('/vacation/settings')
      set({ allowOverBalance: res.allowOverBalance, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  setAllowOverBalance: async (value) => {
    const res = await apiPut<{ allowOverBalance: boolean }>('/vacation/settings', { allowOverBalance: value })
    set({ allowOverBalance: res.allowOverBalance, loaded: true })
  },
}))

export function useAllowOverBalance() {
  const allow = useVacationSettingsStore((s) => s.allowOverBalance)
  const loaded = useVacationSettingsStore((s) => s.loaded)
  const load = useVacationSettingsStore((s) => s.load)
  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])
  return allow
}

if (typeof window !== 'undefined') {
  window.addEventListener('org-changed', () => {
    useVacationSettingsStore.getState().load()
  })
}
