import { create } from 'zustand'
import { apiGet } from '@/shared/lib/apiClient'

export interface InventorySectionNavItem {
  id: number
  name: string
}

interface InventorySectionsState {
  sections: InventorySectionNavItem[]
  loaded: boolean
  loading: boolean
  fetch: (force?: boolean) => Promise<void>
}

export const useInventorySectionsStore = create<InventorySectionsState>((set, get) => ({
  sections: [],
  loaded: false,
  loading: false,
  fetch: async (force = false) => {
    if (get().loading) return
    if (get().loaded && !force) return
    set({ loading: true })
    try {
      const sections = await apiGet<InventorySectionNavItem[]>('/inventory/sections')
      set({ sections, loaded: true })
    } catch {
      /* список разделов в сайдбаре не критичен */
    } finally {
      set({ loading: false })
    }
  },
}))

export function refreshInventorySections() {
  void useInventorySectionsStore.getState().fetch(true)
}
