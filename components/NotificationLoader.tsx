import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'

export function NotificationLoader() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const fetchNotifications = useUIStore((state) => state.fetchNotifications)

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications()
    }
  }, [isAuthenticated, fetchNotifications])

  return null
}
