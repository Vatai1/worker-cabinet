import { SidebarToggle } from './Sidebar'
import { useAuthStore } from '@/core/auth/store/authStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { generateAvatarUrl } from '@/shared/lib/avatar'

export function Header() {
  const { user } = useAuthStore()

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/50 bg-card/80 backdrop-blur-xl px-6 shadow-sm">
      <SidebarToggle />

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-3 pl-3 border-l border-border/50">
          <div className="text-right">
            <p className="text-sm font-semibold leading-tight">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{user?.position}</p>
          </div>
          <Avatar className="h-10 w-10 ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer">
            {user && (
              <AvatarImage
                src={user.avatar || generateAvatarUrl(user.id, user.gender)}
                alt={`${user.firstName} ${user.lastName}`}
              />
            )}
            <AvatarFallback className="gradient-primary text-white text-sm font-semibold">
              {getUserInitials()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}
