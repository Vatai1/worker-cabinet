import { create } from 'zustand'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { themes, defaultThemeId } from './themes'
import type { ThemeSet } from './themes'

interface ThemeState {
  activeTheme: string
  loaded: boolean
  loadTheme: () => Promise<void>
  applyTheme: (id: string) => void
  getTheme: () => ThemeSet
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  activeTheme: defaultThemeId,
  loaded: false,

  loadTheme: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/appearance`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        const themeId = data.activeTheme || defaultThemeId
        set({ activeTheme: themeId })
        get().applyTheme(themeId)
      }
    } catch {
      set({ activeTheme: defaultThemeId })
    }
    set({ loaded: true })
  },

  applyTheme: (id: string) => {
    const theme = themes[id]
    if (!theme) return
    const dark = document.documentElement.classList.contains('dark')
    const vars = dark ? theme.dark : theme.light
    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value)
    }
    document.documentElement.dataset.theme = id

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = theme.favicon || '/vite.svg'
  },

  getTheme: () => {
    return themes[get().activeTheme] || themes[defaultThemeId]
  },
}))

let initialized = false

export function initTheme() {
  if (initialized) return
  initialized = true

  const store = useThemeStore.getState()
  store.applyTheme(defaultThemeId)

  store.loadTheme()

  const observer = new MutationObserver(() => {
    const store = useThemeStore.getState()
    store.applyTheme(store.activeTheme)
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
}
