import { NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useUIStore } from '@/shared/store/uiStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { cn } from '@/shared/lib/utils'
import {
  LayoutDashboard, User, FileText, FolderOpen, FolderKanban,
  LogOut, Menu, X, Users, Plane, Settings, Sun, Moon,
  ChevronDown, FileStack, Building2, ClipboardList,
  Calendar, Shield, Bell, Crown, Bot,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
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
  { name: 'Ассистент', href: '/assistant', icon: Bot, section: 'Основное' },
  { name: 'Сотрудники', href: '/employees', icon: Users, section: 'Основное' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Основное' },
]

const getEmployeeNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard, section: 'Основное' },
  { name: 'Ассистент', href: '/assistant', icon: Bot, section: 'Основное' },
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
  { name: 'Ассистент', href: '/assistant', icon: Bot, section: 'Основное' },
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
  { name: 'Ассистент', href: '/assistant', icon: Bot, section: 'Основное' },
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
  { name: 'Ассистент', href: '/assistant', icon: Bot, section: 'Основное' },
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
        'fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-sidebar-border bg-sidebar-bg transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0',
        openModals ? '-translate-x-full' : sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="relative overflow-hidden px-5 pt-5 pb-4">
          <div className="absolute inset-0 gradient-primary opacity-[0.04]" />
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/8 rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <span className="text-[15px] font-bold tracking-tight text-gradient block leading-tight">Кабинет</span>
                <span className="text-[10px] text-muted-foreground/60 font-medium tracking-wide uppercase">Сотрудника</span>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8 interactive" onClick={toggleTheme}>
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={toggleSidebar}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {Array.from(sections.entries()).map(([sectionName, items]) => (
            <div key={sectionName} className="mb-3">
              <div className="px-3 pt-3 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/50">{sectionName}</span>
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
                              ? 'bg-primary/8 text-primary'
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
                                      ? 'text-primary font-semibold bg-primary/6'
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
                          ? 'gradient-primary text-white shadow-md shadow-primary/20'
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
            location.pathname === '/settings' ? 'gradient-primary text-white shadow-md shadow-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          )}>
            <Settings className="h-[18px] w-[18px]" />
            Настройки
          </NavLink>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 mt-1 hover:bg-muted/40 transition-colors duration-200 group cursor-pointer">
            <Avatar className="h-10 w-10 ring-2 ring-primary/10 shadow-sm transition-shadow duration-200 group-hover:ring-primary/25">
              {user && (
                <AvatarImage src={user.avatar || generateAvatarUrl(user.id, user.gender)} alt={`${user.firstName} ${user.lastName}`} />
              )}
              <AvatarFallback className="text-xs font-bold">{getUserInitials()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{user?.firstName} {user?.lastName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Crown className="h-3 w-3 text-primary/60" />
                <p className="truncate text-[11px] text-muted-foreground/70">{roleLabels[user?.role ?? 'employee']}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors duration-200" onClick={handleLogout}>
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
