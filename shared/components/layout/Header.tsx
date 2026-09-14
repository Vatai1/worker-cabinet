import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Bell, Search, X } from 'lucide-react'
import { SidebarToggle, useNavigation } from './Sidebar'
import { OrgSwitcher } from './OrgSwitcher'
import { GlobalSearch } from './GlobalSearch'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { apiGet } from '@/shared/lib/apiClient'
import { useNotificationWs } from '@/shared/lib/useNotificationWs'

interface Crumb {
  section: string
  title: string
}

export function Header() {
  const { user } = useAuthStore()
  const { organizations, loaded } = useOrgStore()
  const navigate = useNavigate()
  const location = useLocation()
  const navigation = useNavigation()
  const [unreadCount, setUnreadCount] = useState(0)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

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

  const crumb = useMemo<Crumb | null>(() => {
    const current = location.pathname + location.search
    const candidates: Array<{ href: string; section: string; title: string }> = [
      { href: '/settings', section: '', title: 'Настройки' },
    ]
    navigation.forEach((item) => {
      if (item.href) candidates.push({ href: item.href, section: item.section || '', title: item.name })
      item.children?.forEach((child) =>
        candidates.push({ href: child.href, section: item.section || '', title: child.name })
      )
    })
    const hit =
      candidates.find((c) => c.href === current) ||
      candidates.find((c) => !c.href.includes('?') && c.href === location.pathname)
    return hit ? { section: hit.section, title: hit.title } : null
  }, [navigation, location.pathname, location.search])

  useEffect(() => {
    if (!mobileSearchOpen) return
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileSearchOpen(false)
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [mobileSearchOpen])

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-4 border-b border-border/60 bg-background/70 px-6 backdrop-blur-xl">
      <SidebarToggle />
      <div className="hidden min-w-0 lg:block">
        {crumb && !mobileSearchOpen && (
          <>
            {crumb.section && (
              <p className="text-sm leading-tight text-muted-foreground">{crumb.section}</p>
            )}
            <p className="truncate text-[15px] font-semibold leading-tight">{crumb.title}</p>
          </>
        )}
      </div>
      {user?.role !== 'onboarding' && (
        <div className={mobileSearchOpen ? 'flex flex-1 items-center gap-2' : 'hidden lg:flex lg:flex-1 lg:min-w-0'}>
          <GlobalSearch className="w-full" autoFocus={mobileSearchOpen} onNavigate={() => setMobileSearchOpen(false)} />
          {mobileSearchOpen && (
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              aria-label="Закрыть поиск"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
      {!mobileSearchOpen && <div className="flex-1 lg:hidden" />}
      <div className="flex items-center gap-3">
        {user?.role !== 'onboarding' && !mobileSearchOpen && (
          <button
            type="button"
            onClick={() => setMobileSearchOpen(true)}
            aria-label="Поиск"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <Search className="h-5 w-5" />
          </button>
        )}
        {loaded && organizations.length > 1 && (
          <div className="rounded-full border bg-card px-3 py-1.5">
            <OrgSwitcher />
          </div>
        )}
        <button
          onClick={() => navigate('/notifications')}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
