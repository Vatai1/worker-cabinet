import { create } from 'zustand'
import { deleteCookie, getCookie } from '@/shared/lib/cookies'
import { readLocalPref, writeLocalPref } from '@/shared/lib/localPrefs'

const DARK_MODE_KEY = 'darkMode'

function readDarkMode(): boolean {
  const saved = readLocalPref(DARK_MODE_KEY)
  if (saved !== null) return saved === 'true'
  const legacy = getCookie(DARK_MODE_KEY)
  if (legacy !== null) {
    writeLocalPref(DARK_MODE_KEY, legacy)
    deleteCookie(DARK_MODE_KEY)
    return legacy === 'true'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface UIStore {
  sidebarOpen: boolean
  darkMode: boolean
  openModals: number
  toggleSidebar: () => void
  toggleTheme: () => void
  setTheme: (dark: boolean) => void
  openModal: () => void
  closeModal: () => void
}

export const useUIStore = create<UIStore>()((set) => ({
  sidebarOpen: typeof window !== 'undefined' && window.innerWidth >= 1024,
  openModals: 0,
  darkMode: readDarkMode(),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleTheme: () => set((state) => {
    const newMode = !state.darkMode
    writeLocalPref(DARK_MODE_KEY, String(newMode))
    if (newMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    return { darkMode: newMode }
  }),
  setTheme: (dark: boolean) => set(() => {
    writeLocalPref(DARK_MODE_KEY, String(dark))
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    return { darkMode: dark }
  }),
  openModal: () => set((state) => ({ openModals: state.openModals + 1 })),
  closeModal: () => set((state) => ({ openModals: Math.max(0, state.openModals - 1) })),
}))
