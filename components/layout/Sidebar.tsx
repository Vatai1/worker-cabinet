import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  User,
  FileText,
  FolderOpen,
  FolderKanban,
  Bell,
  LogOut,
  Menu,
  X,
  Users,
  Plane,
  Settings,
  Sun,
  Moon,
  ChevronDown,
  FileStack,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'

interface NavItem {
  name: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  children?: { name: string; href: string }[]
}

const getEmployeeNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Отпуск', href: '/vacation', icon: Plane },
  { name: 'Сотрудники', href: '/employees', icon: Users },
  { name: 'Проекты', href: '/projects', icon: FolderKanban },
  { name: 'Профиль', href: userId ? `/employees/${userId}` : '/profile', icon: User },
  { name: 'Заявления', href: '/requests', icon: FileText },
  {
    name: 'Документы',
    icon: FolderOpen,
    children: [
      { name: 'Ваши документы', href: '/documents' },
      { name: 'Шаблоны документов', href: '/document-templates' },
    ],
  },
  { name: 'Уведомления', href: '/notifications', icon: Bell },
]

const getManagerNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/leader', icon: Users },
  { name: 'Профиль', href: userId ? `/employees/${userId}` : '/profile', icon: User },
  { name: 'Сотрудники', href: '/employees', icon: Users },
  { name: 'Проекты', href: '/projects', icon: FolderKanban },
  { name: 'Рассмотреть заявки', href: '/manager', icon: FileText },
  { name: 'Отпуск', href: '/vacation', icon: Plane },
  {
    name: 'Документы',
    icon: FolderOpen,
    children: [
      { name: 'Ваши документы', href: '/documents' },
      { name: 'Шаблоны документов', href: '/document-templates' },
    ],
  },
  { name: 'Уведомления', href: '/notifications', icon: Bell },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const { sidebarOpen, toggleSidebar, notifications, darkMode, toggleTheme } = useUIStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [expandedItems, setExpandedItems] = useState<string[]>([])

  const userUnreadCount = notifications.filter((n) => n.userId === user?.id && !n.read).length

  const navigation = user?.role === 'manager' ? getManagerNavigation(user?.id) : getEmployeeNavigation(user?.id)

  useEffect(() => {
    navigation.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some((child) => location.pathname === child.href)
        if (hasActiveChild && !expandedItems.includes(item.name)) {
          setExpandedItems((prev) => [...prev, item.name])
        }
      }
    })
  }, [location.pathname, navigation, expandedItems])

  const toggleAccordion = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 gradient-primary rounded-xl shadow-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">Кабинет</span>
              {user?.role === 'manager' && (
                <Badge variant="default" className="ml-2 text-[10px] px-2 py-0">
                  Manager
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-primary/10 hover:text-primary"
              onClick={toggleTheme}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden hover:bg-destructive/10"
              onClick={toggleSidebar}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-6">
          {navigation.map((item) => {
            const Icon = item.icon
            const hasChildren = !!item.children
            const isExpanded = expandedItems.includes(item.name)
            const hasActiveChild = item.children?.some((child) => location.pathname === child.href)
            const hasBadge = item.href === '/notifications' && userUnreadCount > 0

            if (hasChildren && item.children) {
              return (
                <div key={item.name}>
                  <button
                    onClick={() => toggleAccordion(item.name)}
                    className={cn(
                      'group flex w-full items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                      hasActiveChild
                        ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-sm border border-primary/20'
                        : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground hover:scale-[1.02]'
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-lg transition-colors",
                      hasActiveChild
                        ? "bg-primary text-white shadow-sm"
                        : "bg-muted/50 text-muted-foreground group-hover:bg-muted"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-left">{item.name}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>
                  {isExpanded && (
                    <div className="mt-1 ml-4 pl-4 border-l-2 border-primary/20 space-y-1">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.href}
                          to={child.href}
                          onClick={() => {
                            if (window.innerWidth < 1024) {
                              toggleSidebar()
                            }
                          }}
                          className={({ isActive }) =>
                            cn(
                              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                              isActive
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-foreground/60 hover:text-foreground hover:bg-muted/30'
                            )
                          }
                        >
                          <FileStack className="h-4 w-4" />
                          <span>{child.name}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            if (!item.href) return null

            const isExactActive = location.pathname === item.href

            return (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    toggleSidebar()
                  }
                }}
                className={() =>
                  cn(
                    'group flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                    isExactActive
                      ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-sm border border-primary/20'
                      : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground hover:scale-[1.02]'
                  )
                }
              >
                {() => (
                  <>
                    <div className={cn(
                      "p-2 rounded-lg transition-colors",
                      isExactActive
                        ? "bg-primary text-white shadow-sm"
                        : "bg-muted/50 text-muted-foreground group-hover:bg-muted"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1">{item.name}</span>
                    {hasBadge && (
                      <Badge variant="destructive" className="ml-auto text-[10px] px-2">
                        {userUnreadCount}
                      </Badge>
                    )}
                    {isExactActive && (
                      <div className="w-1 h-1 rounded-full bg-primary animate-pulse"></div>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-border/50 p-4 bg-muted/30">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 shadow-sm">
            <Avatar className="h-10 w-10 ring-2 ring-primary/20">
              <AvatarFallback className="gradient-primary text-white text-sm font-semibold">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-semibold">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.position}
              </p>
            </div>
          </div>
          <NavLink
            to="/settings"
            className={() =>
              cn(
                'mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                location.pathname === '/settings'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )
            }
          >
            <div className="p-1.5 rounded-lg bg-muted">
              <Settings className="h-4 w-4" />
            </div>
            Настройки
          </NavLink>
          <Button
            variant="ghost"
            className="mt-1 w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
            onClick={handleLogout}
          >
            <div className="p-1.5 rounded-lg bg-muted">
              <LogOut className="h-4 w-4" />
            </div>
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
