import { create } from 'zustand'
import type { Notification } from '@/types'

interface UIStore {
  sidebarOpen: boolean
  notifications: Notification[]
  unreadCount: number
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
}

// Mock notifications
const mockNotifications: Notification[] = [
  {
    id: '1',
    userId: '1',
    title: 'Заявление на отпуск одобрено',
    message: 'Ваше заявление на отпуск с 15.01.2025 по 29.01.2025 одобрено.',
    type: 'success',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '2',
    userId: '1',
    title: 'Новый график работы',
    message: 'График работы на следующий месяц обновлен. Проверьте изменения.',
    type: 'info',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: '3',
    userId: '1',
    title: 'Напоминание о прохождении обучения',
    message: 'Не забудьте пройти обязательное обучение по безопасности до 20.01.2025.',
    type: 'warning',
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
]

export const useUIStore = create<UIStore>((set, get) => ({
  sidebarOpen: true,
  notifications: mockNotifications,
  unreadCount: mockNotifications.filter((n) => !n.read).length,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
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
  markAsRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },
  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },
  removeNotification: (id: string) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id)
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: notification && !notification.read
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      }
    })
  },
}))
