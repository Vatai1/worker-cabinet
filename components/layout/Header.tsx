import { Link } from 'react-router-dom'
import { SidebarToggle } from './Sidebar'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'

export function Header() {
  const { user } = useAuthStore()
  const { notifications } = useUIStore()

  const userUnreadCount = notifications.filter((n) => n.userId === user?.id && !n.read).length

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/50 bg-card/80 backdrop-blur-xl px-6 shadow-sm">
      <SidebarToggle />

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <Link to="/notifications">
          <Button variant="ghost" size="icon" className="relative h-10 w-10 hover:bg-primary/10 rounded-xl transition-all hover:scale-110">
            <Bell className="h-5 w-5" />
            {userUnreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 text-[10px] font-bold text-white shadow-lg animate-pulse">
                {userUnreadCount}
              </span>
            )}
          </Button>
        </Link>

        <div className="hidden md:flex items-center gap-3 pl-3 border-l border-border/50">
          <div className="text-right">
            <p className="text-sm font-semibold leading-tight">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{user?.position}</p>
          </div>
          <Avatar className="h-10 w-10 ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer">
            <AvatarFallback className="gradient-primary text-white text-sm font-semibold">
              {getUserInitials()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}
