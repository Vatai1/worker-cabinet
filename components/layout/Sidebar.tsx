import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  User,
  FileText,
  FolderOpen,
  Bell,
  LogOut,
  Menu,
  X,
  Users,
  Plane,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'

const employeeNavigation = [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Отпуск', href: '/vacation', icon: Plane },
  { name: 'Профиль', href: '/profile', icon: User },
  { name: 'Заявления', href: '/requests', icon: FileText },
  { name: 'Документы', href: '/documents', icon: FolderOpen },
  { name: 'Уведомления', href: '/notifications', icon: Bell },
]

const managerNavigation = [
  { name: 'Панель руководителя', href: '/manager', icon: Users },
  { name: 'Отпуск', href: '/vacation', icon: Plane },
  { name: 'Профиль', href: '/profile', icon: User },
  { name: 'Заявления', href: '/requests', icon: FileText },
  { name: 'Документы', href: '/documents', icon: FolderOpen },
  { name: 'Уведомления', href: '/notifications', icon: Bell },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const { sidebarOpen, toggleSidebar, unreadCount } = useUIStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  const navigation = user?.role === 'manager' ? managerNavigation : employeeNavigation

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-300 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">ЛК</span>
            </div>
            <div>
              <span className="text-lg font-semibold">Сотрудник</span>
              {user?.role === 'manager' && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Руководитель
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navigation.map((item) => {
            const Icon = item.icon
            const hasBadge = item.href === '/notifications' && unreadCount > 0

            return (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={() => {
                  // Close sidebar on mobile after navigation
                  if (window.innerWidth < 1024) {
                    toggleSidebar()
                  }
                }}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{item.name}</span>
                {hasBadge && (
                  <Badge variant="destructive" className="ml-auto">
                    {unreadCount}
                  </Badge>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.position}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-3 w-full justify-start gap-2 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </Button>
        </div>
      </aside>
    </>
  )
}

export function SidebarToggle() {
  const { toggleSidebar } = useUIStore()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="lg:hidden"
      onClick={toggleSidebar}
    >
      <Menu className="h-5 w-5" />
    </Button>
  )
}
