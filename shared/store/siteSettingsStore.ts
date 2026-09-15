import { create } from 'zustand'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

interface LoginSettings {
  login_title: string
  login_subtitle: string
  login_demo_buttons: string
}

interface SiteSettingsState {
  settings: Partial<LoginSettings>
  allSettings: Array<{ key: string; value: string; description: string }>
  loaded: boolean
  fetchPublicSettings: () => Promise<void>
  fetchAllSettings: () => Promise<void>
  updateSettings: (settings: Array<{ key: string; value: string }>) => Promise<void>
}

const defaults: LoginSettings = {
  login_title: 'Личный кабинет работника',
  login_subtitle: 'Единая платформа для управления персоналом, отпусками и документами',
  login_demo_buttons: 'true',
}

export const useSiteSettingsStore = create<SiteSettingsState>((set, get) => ({
  settings: {},
  allSettings: [],
  loaded: false,

  fetchPublicSettings: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/settings/public`)
      if (res.ok) {
        const data = await res.json()
        set({ settings: { ...defaults, ...data }, loaded: true })
      } else {
        set({ settings: defaults, loaded: true })
      }
    } catch {
      set({ settings: defaults, loaded: true })
    }
  },

  fetchAllSettings: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ allSettings: data })
      }
    } catch {}
  },

  updateSettings: async (settings) => {
    const res = await fetch(`${API_BASE_URL}/admin/settings`, {
      method: 'PUT',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ settings }),
    })
    if (!res.ok) throw new Error('Ошибка сохранения настроек')
    await get().fetchAllSettings()
    await get().fetchPublicSettings()
  },
}))
