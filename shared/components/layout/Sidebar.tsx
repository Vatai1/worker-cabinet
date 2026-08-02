import { NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useUIStore } from '@/shared/store/uiStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useThemeStore } from '@/shared/theme/themeStore'
import { cn } from '@/shared/lib/utils'
import {
  LayoutDashboard, User, FileText, FolderOpen, FolderKanban,
  LogOut, Menu, X, Users, Plane, Settings, Sun, Moon,
  ChevronDown, FileStack, Building2, ClipboardList,
  Calendar, Shield, Bell, Crown, Bot,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { Logo } from '@/shared/components/brand/Logo'
import { generateAvatarUrl } from '@/shared/lib/avatar'

interface NavItem {
  name: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  children?: { name: string; href: string; module?: string }[]
  module?: string
  section?: string
}

const getOnboardingNavigation = (): NavItem[] => [
  { name: 'Онбординг', href: '/onboarding', icon: ClipboardList, section: 'Основное' },
  { name: 'Ассистент', href: '/assistant', icon: Bot, module: 'assistant', section: 'Основное' },
  { name: 'Сотрудники', href: '/employees', icon: Users, section: 'Основное' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Основное' },
]

const getEmployeeNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard, section: 'Основное' },
  { name: 'Ассистент', href: '/assistant', icon: Bot, module: 'assistant', section: 'Основное' },
  { name: 'Профиль', href: userId ? `/employees/${userId}` : '/profile', icon: User, section: 'Основное' },
  { name: 'Отдел', icon: Building2, section: 'Работа', children: [
    { name: 'Отпуск', href: '/vacation', module: 'vacation' },
    { name: 'Сотрудники', href: '/employees' },
  ]},
  { name: 'Проекты', href: '/projects', icon: FolderKanban, module: 'projects', section: 'Работа' },
  { name: 'Календарь', href: '/calendar', icon: Calendar, module: 'calendar', section: 'Работа' },
  { name: 'Опросы', href: '/surveys', icon: ClipboardList, module: 'surveys', section: 'Работа' },
  { name: 'Заявления', href: '/requests', icon: FileText, section: 'Работа' },
  { name: 'Уведомления', href: '/notifications', icon: Bell, module: 'notifications', section: 'Работа' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Справочники' },
  { name: 'Документы', icon: FolderOpen, module: 'documents', section: 'Справочники', children: [
    { name: 'Ваши документы', href: '/documents' },
  ]},
]

const getManagerNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/leader', icon: Users, section: 'Основное' },
  { name: 'Ассистент', href: '/assistant', icon: Bot, module: 'assistant', section: 'Основное' },
  { name: 'Профиль', href: userId ? `/employees/${userId}` : '/profile', icon: User, section: 'Основное' },
  { name: 'Отдел', icon: Building2, section: 'Управление', children: [
    { name: 'Табель', href: '/leader/timesheet', module: 'timesheet' },
    { name: 'Отпуск', href: '/vacation', module: 'vacation' },
    { name: 'Сотрудники', href: '/employees' },
  ]},
  { name: 'Рассмотреть заявки', href: '/manager', icon: FileText, section: 'Управление' },
  { name: 'Проекты', href: '/projects', icon: FolderKanban, module: 'projects', section: 'Управление' },
  { name: 'Календарь', href: '/calendar', icon: Calendar, module: 'calendar', section: 'Работа' },
  { name: 'Опросы', href: '/surveys', icon: ClipboardList, module: 'surveys', section: 'Работа' },
  { name: 'Уведомления', href: '/notifications', icon: Bell, module: 'notifications', section: 'Работа' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Справочники' },
  { name: 'Документы', icon: FolderOpen, module: 'documents', section: 'Справочники', children: [
    { name: 'Ваши документы', href: '/documents' },
  ]},
]

const getHRNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard, section: 'Основное' },
  { name: 'Ассистент', href: '/assistant', icon: Bot, module: 'assistant', section: 'Основное' },
  { name: 'Профиль', href: userId ? `/employees/${userId}` : '/profile', icon: User, section: 'Основное' },
  { name: 'HR-панель', href: '/hr', icon: Users, section: 'Основное' },
  { name: 'Сотрудники', href: '/employees', icon: Users, section: 'Управление' },
  { name: 'Отпуск', href: '/vacation', icon: Plane, module: 'vacation', section: 'Управление' },
  { name: 'Мои опросы', href: '/surveys', icon: ClipboardList, module: 'surveys', section: 'Работа' },
  { name: 'Проекты', href: '/projects', icon: FolderKanban, module: 'projects', section: 'Работа' },
  { name: 'Календарь', href: '/calendar', icon: Calendar, module: 'calendar', section: 'Работа' },
  { name: 'Уведомления', href: '/notifications', icon: Bell, module: 'notifications', section: 'Работа' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Справочники' },
  { name: 'Документы', icon: FolderOpen, module: 'documents', section: 'Справочники', children: [
    { name: 'Ваши документы', href: '/documents' },
  ]},
]

const getAdminNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard, section: 'Основное' },
  { name: 'Ассистент', href: '/assistant', icon: Bot, module: 'assistant', section: 'Основное' },
  { name: 'Профиль', href: userId ? `/employees/${userId}` : '/profile', icon: User, section: 'Основное' },
  { name: 'Администрирование', href: '/admin', icon: Shield, section: 'Основное' },
  { name: 'HR-панель', href: '/hr', icon: Users, section: 'Основное' },
  { name: 'Сотрудники', href: '/employees', icon: Users, section: 'Управление' },
  { name: 'Отпуск', href: '/vacation', icon: Plane, module: 'vacation', section: 'Управление' },
  { name: 'Мои опросы', href: '/surveys', icon: ClipboardList, module: 'surveys', section: 'Работа' },
  { name: 'Проекты', href: '/projects', icon: FolderKanban, module: 'projects', section: 'Работа' },
  { name: 'Календарь', href: '/calendar', icon: Calendar, module: 'calendar', section: 'Работа' },
  { name: 'Уведомления', href: '/notifications', icon: Bell, module: 'notifications', section: 'Работа' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Справочники' },
  { name: 'Документы', icon: FolderOpen, module: 'documents', section: 'Справочники', children: [
    { name: 'Ваши документы', href: '/documents' },
  ]},
]

const roleLabels: Record<string, string> = {
  employee: 'Сотрудник',
  manager: 'Руководитель',
  hr: 'HR',
  admin: 'Администратор',
  onboarding: 'Онбординг',
}

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const { sidebarOpen, toggleSidebar, darkMode, toggleTheme, openModals } = useUIStore()
  const { isModuleEnabled, modulesLoaded } = useModulesStore()
  const activeTheme = useThemeStore((s) => s.activeTheme)
  const isCrctSidebar = activeTheme === 'crct'
  const location = useLocation()
  const [expandedItems, setExpandedItems] = useState<string[]>([])

  const rawNavigation =
    user?.role === 'onboarding' ? getOnboardingNavigation() :
    user?.role === 'manager' ? getManagerNavigation(user?.id) :
    user?.role === 'admin' ? getAdminNavigation(user?.id) :
    ['hr'].includes(user?.role ?? '') ? getHRNavigation(user?.id) :
    getEmployeeNavigation(user?.id)

  const navigation = !modulesLoaded ? [] : rawNavigation
    .filter((item) => !item.module || isModuleEnabled(item.module))
    .map((item) => {
      if (!item.children) return item
      const filteredChildren = item.children.filter((child) => !child.module || isModuleEnabled(child.module))
      if (filteredChildren.length === 0) return null
      return { ...item, children: filteredChildren }
    })
    .filter(Boolean) as NavItem[]

  const sections = useMemo(() => {
    const map = new Map<string, NavItem[]>()
    navigation.forEach((item) => {
      const section = item.section || 'Основное'
      if (!map.has(section)) map.set(section, [])
      map.get(section)!.push(item)
    })
    return map
  }, [navigation])

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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024 && useUIStore.getState().sidebarOpen) {
        useUIStore.setState({ sidebarOpen: false })
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleAccordion = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const handleLogout = () => {
    void logout()
  }

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  return (
    <>
      {sidebarOpen && !openModals && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden animate-fade-in" onClick={toggleSidebar} />
      )}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isCrctSidebar
          ? 'border-sidebar-border bg-sidebar-bg'
          : 'border-sidebar-border bg-sidebar-bg',
        openModals ? '-translate-x-full' : sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        isCrctSidebar && 'sidebar-crct',
        !isCrctSidebar && 'sidebar-legacy'
      )}>
        <div className="relative overflow-hidden px-5 pt-5 pb-4">
          <div className="absolute inset-0 gradient-primary opacity-[0.04]" />
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/8 rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo size="md" showText={false} variant="dark" />
              <div>
                <span className={cn(
                  'text-[15px] font-bold tracking-tight block leading-tight',
                  isCrctSidebar ? 'text-white' : 'text-gradient'
                )}>Кабинет</span>
                <span className={cn(
                  'text-[10px] font-medium tracking-wide uppercase',
                  isCrctSidebar ? 'text-white/60' : 'text-muted-foreground/60'
                )}>Сотрудника</span>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className={cn('h-8 w-8 interactive', isCrctSidebar && 'text-white hover:bg-white/10')} onClick={toggleTheme}>
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className={cn('h-8 w-8 lg:hidden', isCrctSidebar && 'text-white hover:bg-white/10')} onClick={toggleSidebar}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {Array.from(sections.entries()).map(([sectionName, items]) => (
            <div key={sectionName} className="mb-3">
              <div className="px-3 pt-3 pb-1.5">
                <span className={cn(
                  'text-[10px] font-semibold uppercase tracking-[0.08em]',
                  isCrctSidebar ? 'text-white/40' : 'text-muted-foreground/50'
                )}>{sectionName}</span>
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon
                  const hasChildren = !!item.children
                  const isExpanded = expandedItems.includes(item.name)
                  const hasActiveChild = item.children?.some((child) => location.pathname === child.href)

                  if (hasChildren && item.children) {
                    return (
                      <div key={item.name}>
                        <button
                          onClick={() => toggleAccordion(item.name)}
                          className={cn(
                            'group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200',
                            hasActiveChild
                              ? isCrctSidebar
                                ? 'bg-white/15 text-white'
                                : 'bg-primary/8 text-primary'
                              : isCrctSidebar
                                ? 'text-white/70 hover:bg-white/10 hover:text-white'
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          )}
                        >
                          <div className="transition-transform duration-200 group-hover:scale-105">
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                          </div>
                          <span className="flex-1 text-left">{item.name}</span>
                          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-300', isExpanded && 'rotate-180')} />
                        </button>
                        <div className={cn(
                          'overflow-hidden transition-all duration-300',
                          isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                        )}>
                          <div className="mt-0.5 ml-4 pl-3.5 border-l-2 border-primary/12 space-y-0.5 py-1">
                            {item.children.map((child) => {
                              const isChildActive = location.pathname === child.href
                              return (
                                <NavLink
                                  key={child.href}
                                  to={child.href}
                                  onClick={() => { if (window.innerWidth < 1024) toggleSidebar() }}
                                  className={cn(
                                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-all duration-200',
                                    isChildActive
                                      ? isCrctSidebar
                                        ? 'text-white font-semibold bg-white/10'
                                        : 'text-primary font-semibold bg-primary/6'
                                      : isCrctSidebar
                                        ? 'text-white/60 hover:text-white hover:bg-white/5'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                                  )}
                                >
                                  <FileStack className="h-3.5 w-3.5" />
                                  <span>{child.name}</span>
                                </NavLink>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  if (!item.href) return null
                  const isActive = location.pathname === item.href

                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={() => { if (window.innerWidth < 1024) toggleSidebar() }}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200',
                        isActive
                          ? isCrctSidebar
                            ? 'bg-white text-[#003D85] shadow-md shadow-black/20'
                            : 'gradient-primary text-white shadow-md shadow-primary/20'
                          : isCrctSidebar
                            ? 'text-white/70 hover:bg-white/10 hover:text-white'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <div className="transition-transform duration-200 group-hover:scale-105">
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                      </div>
                      <span className="flex-1">{item.name}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative border-t border-sidebar-border p-3">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <NavLink to="/settings" className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200 mb-1',
            location.pathname === '/settings'
              ? isCrctSidebar
                ? 'bg-white text-[#003D85] shadow-md shadow-black/20'
                : 'gradient-primary text-white shadow-md shadow-primary/20'
              : isCrctSidebar
                ? 'text-white/70 hover:bg-white/10 hover:text-white'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          )}>
            <Settings className="h-[18px] w-[18px]" />
            Настройки
          </NavLink>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 mt-1 hover:bg-white/5 transition-colors duration-200 group cursor-pointer">
            <Avatar className="h-10 w-10 ring-2 ring-white/10 shadow-sm transition-shadow duration-200 group-hover:ring-white/25">
              {user && (
                <AvatarImage src={user.avatar || generateAvatarUrl(user.id, user.gender)} alt={`${user.firstName} ${user.lastName}`} />
              )}
              <AvatarFallback className="text-xs font-bold">{getUserInitials()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden min-w-0">
              <p className={cn('truncate text-sm font-semibold leading-tight', isCrctSidebar ? 'text-white' : 'text-foreground')}>{user?.firstName} {user?.lastName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Crown className={cn('h-3 w-3', isCrctSidebar ? 'text-white/40' : 'text-primary/60')} />
                <p className={cn('truncate text-[11px]', isCrctSidebar ? 'text-white/40' : 'text-muted-foreground/70')}>{roleLabels[user?.role ?? 'employee']}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7 shrink-0 transition-colors duration-200', isCrctSidebar ? 'text-white/40 hover:text-red-300' : 'text-muted-foreground/50 hover:text-destructive')} onClick={handleLogout}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}

export function SidebarToggle() {
  const { toggleSidebar } = useUIStore()
  return (
    <Button variant="ghost" size="icon" className="lg:hidden interactive" onClick={toggleSidebar}>
      <Menu className="h-5 w-5" />
    </Button>
  )
}
