import { create } from 'zustand'
import { getCookie, setCookie } from '@/shared/lib/cookies'

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
  sidebarOpen: true,
  openModals: 0,
  darkMode: (() => {
    const saved = getCookie('darkMode')
    if (saved !== null) return saved === 'true'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })(),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleTheme: () => set((state) => {
    const newMode = !state.darkMode
    setCookie('darkMode', String(newMode))
    if (newMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    return { darkMode: newMode }
  }),
  setTheme: (dark: boolean) => set(() => {
    setCookie('darkMode', String(dark))
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
