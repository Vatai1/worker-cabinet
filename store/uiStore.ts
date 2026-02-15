import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { notificationApi } from '@/services/notificationApi'
import type { Notification } from '@/types'

interface UIStore {
  sidebarOpen: boolean
  darkMode: boolean
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleTheme: () => void
  setTheme: (dark: boolean) => void
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  removeNotification: (id: string) => Promise<void>
  fetchNotifications: () => Promise<void>
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      darkMode: (() => {
        const saved = localStorage.getItem('darkMode')
        if (saved !== null) return saved === 'true'
        return window.matchMedia('(prefers-color-scheme: dark)').matches
      })(),
      notifications: [],
      unreadCount: 0,
      loading: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
      toggleTheme: () => set((state) => {
        const newMode = !state.darkMode
        localStorage.setItem('darkMode', String(newMode))
        if (newMode) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        return { darkMode: newMode }
      }),
      setTheme: (dark: boolean) => set(() => {
        localStorage.setItem('darkMode', String(dark))
        if (dark) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        return { darkMode: dark }
      }),
      fetchNotifications: async () => {
        set({ loading: true })
        try {
          const data = await notificationApi.getAll()
          set({
            notifications: data,
            unreadCount: data.filter((n) => !n.read).length,
            loading: false,
          })
        } catch (error) {
          console.error('Error fetching notifications:', error)
          set({ loading: false })
        }
      },
      addNotification: (notification) => {
        const newNotification: Notification = {
          ...notification,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
        }
        set((state) => ({
          notifications: [newNotification, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }))
      },
      markAsRead: async (id: string) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }))
        try {
          await notificationApi.markAsRead(id)
        } catch (error) {
          console.error('Error marking notification as read:', error)
        }
      },
      markAllAsRead: async () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }))
        try {
          await notificationApi.markAllAsRead()
        } catch (error) {
          console.error('Error marking all notifications as read:', error)
        }
      },
      removeNotification: async (id: string) => {
        set((state) => {
          const notification = state.notifications.find((n) => n.id === id)
          return {
            notifications: state.notifications.filter((n) => n.id !== id),
            unreadCount: notification && !notification.read
              ? Math.max(0, state.unreadCount - 1)
              : state.unreadCount,
          }
        })
        try {
          await notificationApi.delete(id)
        } catch (error) {
          console.error('Error deleting notification:', error)
        }
      },
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        darkMode: state.darkMode,
        notifications: state.notifications,
      }),
    }
  )
)
