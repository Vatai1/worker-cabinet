import { useEffect } from 'react'
import { create } from 'zustand'
import { apiGet, apiPut } from '@/shared/lib/apiClient'

interface VacationSettingsState {
  allowOverBalance: boolean
  load: () => Promise<void>
  setAllowOverBalance: (value: boolean) => Promise<void>
}

export const useVacationSettingsStore = create<VacationSettingsState>((set) => ({
  allowOverBalance: false,
  load: async () => {
    try {
      const res = await apiGet<{ allowOverBalance: boolean }>('/vacation/settings')
      set({ allowOverBalance: res.allowOverBalance })
    } catch {
      set({ allowOverBalance: false })
    }
  },
  setAllowOverBalance: async (value) => {
    const res = await apiPut<{ allowOverBalance: boolean }>('/vacation/settings', { allowOverBalance: value })
    set({ allowOverBalance: res.allowOverBalance })
  },
}))

export function useAllowOverBalance(isOpen: boolean) {
  const allow = useVacationSettingsStore((s) => s.allowOverBalance)
  const load = useVacationSettingsStore((s) => s.load)
  useEffect(() => {
    if (isOpen) load()
  }, [isOpen, load])
  return allow
}

if (typeof window !== 'undefined') {
  window.addEventListener('org-changed', () => {
    useVacationSettingsStore.getState().load()
  })
}
