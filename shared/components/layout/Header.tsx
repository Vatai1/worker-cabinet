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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/30 glass px-6">
      <SidebarToggle />
      <div className="flex-1" />
      <div className="flex items-center gap-3">
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
