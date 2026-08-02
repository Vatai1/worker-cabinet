import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { SidebarToggle } from './Sidebar'
import { useAuthStore } from '@/core/auth/store/authStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { apiGet } from '@/shared/lib/apiClient'
import { useNotificationWs } from '@/shared/lib/useNotificationWs'

export function Header() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnread = useCallback(async () => {
    try {
      const data = await apiGet<{ count: number }>('/notifications/my/unread-count')
      setUnreadCount(data.count)
    } catch {}
  }, [])

  useNotificationWs(setUnreadCount)

  useEffect(() => {
    fetchUnread()
  }, [fetchUnread])

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/30 glass px-6">
      <SidebarToggle />
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          aria-label="Уведомления"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold ring-2 ring-background">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <div className="hidden md:flex items-center gap-3.5 pl-4 border-l border-border/40">
          <div className="text-right">
            <p className="text-sm font-semibold leading-tight">{user?.firstName} {user?.lastName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{user?.position}</p>
          </div>
          <Avatar className="h-9 w-9 ring-2 ring-primary/15 shadow-sm">
            {user && (
              <AvatarImage src={user.avatar || generateAvatarUrl(user.id, user.gender)} alt={`${user.firstName} ${user.lastName}`} />
            )}
            <AvatarFallback className="text-xs font-semibold">{getUserInitials()}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}
