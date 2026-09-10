import { NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useUIStore } from '@/shared/store/uiStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useThemeStore } from '@/shared/theme/themeStore'
import { cn } from '@/shared/lib/utils'
import {
  LayoutDashboard, User, FileText, FolderOpen, FolderKanban,
  LogOut, Menu, X, Users, Plane, Settings, Sun, Moon, Undo2,
  ChevronDown, Building2, ClipboardList,
  Calendar, Bell, Crown, Bot, UserCheck,
  Send, UserPlus, Network, Briefcase, Wrench,
  Key, ShieldCheck, Boxes, Settings2, Package,
  Activity, AlertCircle, Bug, Server, Palette, FlaskConical,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { Logo } from '@/shared/components/brand/Logo'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { hasAnyRole, isSuperAdmin } from '@/shared/lib/permissions'
import { BugReportButton } from '@/shared/components/BugReportButton'
import { TestSwitcher, stopImpersonation } from '@/shared/components/TestSwitcher'

export interface NavItem {
  name: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  children?: { name: string; href: string; module?: string }[]
  module?: string
  section?: string
  superAdminOnly?: boolean
  orgAdminOnly?: boolean
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
  { name: 'Иерархия', href: '/my-hierarchy', icon: Network, section: 'Основное' },
  { name: 'Отдел', icon: Building2, section: 'Работа', children: [
    { name: 'Отпуск', href: '/vacation', module: 'vacation' },
    { name: 'Сотрудники', href: '/employees' },
  ]},
  { name: 'Проекты', href: '/projects', icon: FolderKanban, module: 'projects', section: 'Работа' },
  { name: 'Мои замещения', href: '/vacation/my-substitutions', icon: UserCheck, module: 'substitution', section: 'Работа' },
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
  { name: 'Иерархия', href: '/my-hierarchy', icon: Network, section: 'Основное' },
  { name: 'Отдел', icon: Building2, section: 'Управление', children: [
    { name: 'Табель', href: '/leader/timesheet', module: 'timesheet' },
    { name: 'Отпуск', href: '/vacation', module: 'vacation' },
    { name: 'Сотрудники', href: '/employees' },
  ]},
  { name: 'Рассмотреть заявки', href: '/manager', icon: FileText, section: 'Управление' },
  { name: 'Проекты', href: '/projects', icon: FolderKanban, module: 'projects', section: 'Управление' },
  { name: 'Мои замещения', href: '/vacation/my-substitutions', icon: UserCheck, module: 'substitution', section: 'Работа' },
  { name: 'Календарь', href: '/calendar', icon: Calendar, module: 'calendar', section: 'Работа' },
  { name: 'Опросы', href: '/surveys', icon: ClipboardList, module: 'surveys', section: 'Работа' },
  { name: 'Уведомления', href: '/notifications', icon: Bell, module: 'notifications', section: 'Работа' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Справочники' },
  { name: 'Документы', icon: FolderOpen, module: 'documents', section: 'Справочники', children: [
    { name: 'Ваши документы', href: '/documents' },
  ]},
]

const getHRSectionItems = (): NavItem[] => [
  { name: 'Опросы', href: '/hr?tab=surveys', icon: ClipboardList, module: 'surveys', section: 'HR' },
  { name: 'Рассылка', href: '/hr?tab=mailing', icon: Send, module: 'mailing', section: 'HR' },
  { name: 'Онбординг', href: '/hr?tab=onboarding', icon: UserPlus, module: 'onboarding', section: 'HR' },
  { name: 'Табель', href: '/hr?tab=timesheet', icon: Calendar, module: 'timesheet', section: 'HR' },
  { name: 'Отпуск', href: '/hr?tab=vacation', icon: Plane, module: 'vacation', section: 'HR' },
  { name: 'Иерархия', href: '/hr?tab=hierarchy', icon: Network, module: 'hierarchy', section: 'HR' },
  { name: 'Шаблоны документов', href: '/hr?tab=doc-templates', icon: FileText, module: 'documents', section: 'HR' },
  { name: 'Учреждение', href: '/hr?tab=institution', icon: Building2, module: 'dictionaries', section: 'HR' },
  { name: 'Отделы', href: '/hr?tab=hr_departments', icon: Building2, module: 'dictionaries', section: 'HR' },
  { name: 'Должности', href: '/hr?tab=hr_positions', icon: Briefcase, module: 'dictionaries', section: 'HR' },
  { name: 'Типы отпусков', href: '/hr?tab=hr_vacation_types', icon: Plane, module: 'vacation', section: 'HR' },
  { name: 'Навыки', href: '/hr?tab=hr_skills', icon: Wrench, module: 'skills', section: 'HR' },
]

const getHRNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard, section: 'Основное' },
  { name: 'Ассистент', href: '/assistant', icon: Bot, module: 'assistant', section: 'Основное' },
  { name: 'Профиль', href: userId ? `/employees/${userId}` : '/profile', icon: User, section: 'Основное' },
  { name: 'Иерархия', href: '/my-hierarchy', icon: Network, section: 'Основное' },
  { name: 'Сотрудники', href: '/employees', icon: Users, section: 'Управление' },
  { name: 'Отпуск', href: '/vacation', icon: Plane, module: 'vacation', section: 'Управление' },
  { name: 'Мои опросы', href: '/surveys', icon: ClipboardList, module: 'surveys', section: 'Работа' },
  { name: 'Проекты', href: '/projects', icon: FolderKanban, module: 'projects', section: 'Работа' },
  { name: 'Мои замещения', href: '/vacation/my-substitutions', icon: UserCheck, module: 'substitution', section: 'Работа' },
  { name: 'Календарь', href: '/calendar', icon: Calendar, module: 'calendar', section: 'Работа' },
  { name: 'Уведомления', href: '/notifications', icon: Bell, module: 'notifications', section: 'Работа' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Справочники' },
  { name: 'Документы', icon: FolderOpen, module: 'documents', section: 'Справочники', children: [
    { name: 'Ваши документы', href: '/documents' },
  ]},
  ...getHRSectionItems(),
]

// Пункты, скрытые от org-admin в AdminPanel.tsx (HIDDEN_FOR_ORG_ADMIN) — не
// показываем их и в разделе «Настройки организации» в сайдбаре.
const ORG_HIDDEN_ITEM_NAMES = new Set([
  'Роли и доступы', 'Роли по должности', 'Учреждения', 'Иерархия',
  'Безопасность', 'Ошибки', 'Баг-репорты', 'Система', 'Тестовые данные',
])

const getAdminSettingsItems = (basePath: string, section: string, restrictToOrg: boolean): NavItem[] => {
  const items: NavItem[] = [
    { name: 'Пользователи', href: `${basePath}?tab=users`, icon: Users, section },
    { name: 'Роли и доступы', href: `${basePath}?tab=roles`, icon: Key, section },
    { name: 'Роли по должности', href: `${basePath}?tab=role-mappings`, icon: ShieldCheck, section },
    { name: 'Отделы', href: `${basePath}?tab=departments`, icon: Building2, section },
    { name: 'Учреждения', href: `${basePath}?tab=organizations`, icon: Building2, section },
    { name: 'Иерархия', href: `${basePath}?tab=global-hierarchy`, icon: Network, section },
    { name: 'Модули', href: `${basePath}?tab=modules`, icon: Boxes, section },
    { name: 'Настройки системы', href: `${basePath}?tab=settings`, icon: Settings2, section },
    { name: 'Безопасность', href: `${basePath}?tab=security`, icon: ShieldCheck, section },
    { name: 'Аудит', href: `${basePath}?tab=audit`, icon: Activity, section },
    { name: 'Ошибки', href: `${basePath}?tab=errors`, icon: AlertCircle, section },
    { name: 'Баг-репорты', href: `${basePath}?tab=bug-reports`, icon: Bug, section },
    { name: 'Система', href: `${basePath}?tab=health`, icon: Server, section },
    { name: 'Тестовые данные', href: `${basePath}?tab=test-data`, icon: FlaskConical, section },
    { name: 'Должности', href: `${basePath}?tab=dict_positions`, icon: Briefcase, section },
    { name: 'Типы отпусков', href: `${basePath}?tab=dict_vacation`, icon: Plane, module: 'vacation', section },
    { name: 'Навыки', href: `${basePath}?tab=dict_skills`, icon: Package, module: 'skills', section },
    { name: 'Темы', href: `${basePath}?tab=appearance`, icon: Palette, section },
  ]
  return restrictToOrg ? items.filter((item) => !ORG_HIDDEN_ITEM_NAMES.has(item.name)) : items
}

const getAdminNavigation = (userId?: string, isSuper?: boolean): NavItem[] => [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard, section: 'Основное' },
  { name: 'Ассистент', href: '/assistant', icon: Bot, module: 'assistant', section: 'Основное' },
  { name: 'Профиль', href: userId ? `/employees/${userId}` : '/profile', icon: User, section: 'Основное' },
  { name: 'Иерархия', href: '/my-hierarchy', icon: Network, section: 'Основное' },
  { name: 'Сотрудники', href: '/employees', icon: Users, section: 'Управление' },
  { name: 'Отпуск', href: '/vacation', icon: Plane, module: 'vacation', section: 'Управление' },
  { name: 'Мои опросы', href: '/surveys', icon: ClipboardList, module: 'surveys', section: 'Работа' },
  { name: 'Проекты', href: '/projects', icon: FolderKanban, module: 'projects', section: 'Работа' },
  { name: 'Мои замещения', href: '/vacation/my-substitutions', icon: UserCheck, module: 'substitution', section: 'Работа' },
  { name: 'Календарь', href: '/calendar', icon: Calendar, module: 'calendar', section: 'Работа' },
  { name: 'Уведомления', href: '/notifications', icon: Bell, module: 'notifications', section: 'Работа' },
  { name: 'Отделы', href: '/departments', icon: Building2, section: 'Справочники' },
  { name: 'Документы', icon: FolderOpen, module: 'documents', section: 'Справочники', children: [
    { name: 'Ваши документы', href: '/documents' },
  ]},
  ...(isSuper ? getAdminSettingsItems('/admin/global', 'Глобальные настройки', false) : []),
  ...getAdminSettingsItems('/admin/org', 'Настройки организации', true),
  ...getHRSectionItems(),
]

const roleLabels: Record<string, string> = {
  employee: 'Сотрудник',
  manager: 'Руководитель',
  hr: 'HR',
  admin: 'Администратор',
  onboarding: 'Онбординг',
  superadmin: 'Супер-админ',
}

export function useNavigation(): NavItem[] {
  const { user } = useAuthStore()
  const { isModuleEnabled, modulesLoaded } = useModulesStore()
  const isSuper = isSuperAdmin()
  const isAdminRole = hasAnyRole('admin')

  return useMemo(() => {
    const rawNavigation =
      user?.role === 'onboarding' ? getOnboardingNavigation() :
      isSuper ? getAdminNavigation(user?.id, true) :
      isAdminRole ? getAdminNavigation(user?.id, false) :
      hasAnyRole('hr') ? getHRNavigation(user?.id) :
      user?.role === 'manager' || hasAnyRole('manager') ? getManagerNavigation(user?.id) :
      getEmployeeNavigation(user?.id)

    return (!modulesLoaded ? [] : rawNavigation)
      .filter((item) => {
        if (item.superAdminOnly && !isSuper) return false
        if (item.orgAdminOnly && !isAdminRole) return false
        return true
      })
      .filter((item) => !item.module || isModuleEnabled(item.module))
      .map((item) => {
        if (!item.children) return item
        const filteredChildren = item.children.filter((child) => !child.module || isModuleEnabled(child.module))
        if (filteredChildren.length === 0) return null
        return { ...item, children: filteredChildren }
      })
      .filter(Boolean) as NavItem[]
  }, [modulesLoaded, isSuper, isAdminRole, isModuleEnabled, user?.role, user?.id])
}

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const { sidebarOpen, toggleSidebar, darkMode, toggleTheme, openModals } = useUIStore()
  const activeTheme = useThemeStore((s) => s.activeTheme)
  const isCrctSidebar = activeTheme === 'crct'
  const location = useLocation()
  const currentPath = location.pathname + location.search
  const isHrefActive = (href?: string) =>
    !!href && (href === currentPath || (!href.includes('?') && href === location.pathname))
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(['Основное']))

  const navigation = useNavigation()

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
    const matchesPath = (href?: string) => !!href && href.split('?')[0] === location.pathname
    for (const [sectionName, items] of sections.entries()) {
      const isActiveSection = items.some((item) =>
        matchesPath(item.href) || item.children?.some((child) => matchesPath(child.href))
      )
      if (isActiveSection) {
        setExpandedSections((prev) => (prev.has(sectionName) ? prev : new Set(prev).add(sectionName)))
        break
      }
    }
  }, [location.pathname, sections])

  const toggleSection = (name: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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

  const isImpersonated = useAuthStore((s) => s.isImpersonated)

  const handleLogout = () => {
    if (isImpersonated) {
      void stopImpersonation()
      return
    }
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
        'fixed left-3 top-3 bottom-3 z-50 flex w-[272px] flex-col overflow-hidden rounded-2xl border shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isCrctSidebar
          ? 'border-sidebar-border bg-sidebar-bg sidebar-crct'
          : 'border-border/60 bg-card/80 backdrop-blur-xl sidebar-legacy',
        openModals ? '-translate-x-[120%]' : sidebarOpen ? 'translate-x-0' : '-translate-x-[120%]',
        'lg:translate-x-0'
      )}>
        <div className={cn(
          'relative flex h-16 shrink-0 items-center gap-3 overflow-hidden px-5',
          isCrctSidebar ? 'border-b border-white/10' : 'border-b border-border/60'
        )}>
          <div className="absolute inset-0 gradient-primary opacity-[0.04]" />
          <div className="relative flex flex-1 items-center gap-3">
            <Logo size="md" showText={false} variant="dark" />
            <div className="min-w-0">
              <span className={cn(
                'block text-[15px] font-bold leading-tight tracking-tight',
                isCrctSidebar ? 'text-white' : 'text-gradient'
              )}>Кабинет</span>
              <span className={cn(
                'text-[10px] font-medium uppercase tracking-wide',
                isCrctSidebar ? 'text-white/60' : 'text-muted-foreground/60'
              )}>Сотрудника</span>
            </div>
          </div>
          <div className="relative flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className={cn('h-8 w-8 rounded-xl interactive', isCrctSidebar && 'text-white hover:bg-white/10')} onClick={toggleTheme}>
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className={cn('h-8 w-8 rounded-xl lg:hidden', isCrctSidebar && 'text-white hover:bg-white/10')} onClick={toggleSidebar}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3 pt-2">
          {Array.from(sections.entries()).map(([sectionName, items]) => {
            const isSectionExpanded = expandedSections.has(sectionName)
            return (
            <div key={sectionName} className="mb-3">
              <button
                type="button"
                onClick={() => toggleSection(sectionName)}
                className="flex w-full items-center justify-between px-3 pt-3 pb-1.5 group"
              >
                <span className={cn(
                  'text-[11px] font-semibold uppercase tracking-wider',
                  isCrctSidebar ? 'text-white/40' : 'text-muted-foreground/70'
                )}>{sectionName}</span>
                <ChevronDown className={cn(
                  'h-3 w-3 transition-transform duration-200',
                  isCrctSidebar ? 'text-white/30 group-hover:text-white/50' : 'text-muted-foreground/40 group-hover:text-muted-foreground/70',
                  isSectionExpanded && 'rotate-180'
                )} />
              </button>
              <div className={cn(
                'grid transition-all duration-300 ease-out',
                isSectionExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              )}>
              <div className="overflow-hidden">
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon
                  const hasChildren = !!item.children
                  const isExpanded = expandedItems.includes(item.name)
                  const hasActiveChild = item.children?.some((child) => isHrefActive(child.href))

                  if (hasChildren && item.children) {
                    return (
                      <div key={item.name}>
                        <button
                          onClick={() => toggleAccordion(item.name)}
                          className={cn(
                            'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ease-out',
                            hasActiveChild
                              ? isCrctSidebar
                                ? 'bg-white/15 text-white'
                                : 'bg-primary/10 text-primary'
                              : isCrctSidebar
                                ? 'text-white/70 hover:bg-white/10 hover:text-white'
                                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                          )}
                        >
                          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="flex-1 truncate text-left">{item.name}</span>
                          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-300', isExpanded && 'rotate-180')} />
                        </button>
                        <div className={cn(
                          'overflow-hidden transition-all duration-300',
                          isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                        )}>
                          <div className="mt-0.5 space-y-0.5 py-1">
                            {item.children.map((child) => {
                              const isChildActive = isHrefActive(child.href)
                              return (
                                <NavLink
                                  key={child.href}
                                  to={child.href}
                                  onClick={() => { if (window.innerWidth < 1024) toggleSidebar() }}
                                  className={cn(
                                    'relative flex items-center gap-3 rounded-lg py-2 pl-8 pr-3 text-[13px] transition-all duration-200 ease-out',
                                    isChildActive
                                      ? isCrctSidebar
                                        ? 'bg-white/10 font-medium text-white'
                                        : 'bg-primary/10 font-medium text-primary'
                                      : isCrctSidebar
                                        ? 'text-white/60 hover:bg-white/5 hover:text-white'
                                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                                  )}
                                >
                                  <span className={cn(
                                    'absolute left-[15px] h-1.5 w-1.5 rounded-full',
                                    isChildActive
                                      ? isCrctSidebar ? 'bg-white' : 'bg-primary'
                                      : isCrctSidebar ? 'bg-white/30' : 'bg-muted-foreground/30'
                                  )} />
                                  <span className="truncate">{child.name}</span>
                                </NavLink>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  if (!item.href) return null
                  const isActive = isHrefActive(item.href)

                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={() => { if (window.innerWidth < 1024) toggleSidebar() }}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ease-out',
                        isActive
                          ? isCrctSidebar
                            ? 'bg-white text-[#003D85] shadow-md shadow-black/20'
                            : 'bg-primary/10 text-primary'
                          : isCrctSidebar
                            ? 'text-white/70 hover:bg-white/10 hover:text-white'
                            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                      )}
                    >
                      {isActive && !isCrctSidebar && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
                      )}
                      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="flex-1 truncate">{item.name}</span>
                    </NavLink>
                  )
                })}
              </div>
              </div>
              </div>
            </div>
            )
          })}
        </nav>

        <div className={cn(
          'shrink-0 p-3',
          isCrctSidebar ? 'border-t border-white/10' : 'border-t border-border/60'
        )}>
          <NavLink to="/settings" className={cn(
            'relative mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ease-out',
            isHrefActive('/settings')
              ? isCrctSidebar
                ? 'bg-white text-[#003D85] shadow-md shadow-black/20'
                : 'bg-primary/10 text-primary'
              : isCrctSidebar
                ? 'text-white/70 hover:bg-white/10 hover:text-white'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
          )}>
            {isHrefActive('/settings') && !isCrctSidebar && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
            )}
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
              <Settings className="h-[18px] w-[18px]" />
            </span>
            Настройки
          </NavLink>

          <div className={cn('mt-2', isCrctSidebar ? 'border-t border-white/10 pt-2' : 'border-t border-border/50 pt-2')}>
            <TestSwitcher isCrct={isCrctSidebar} />
            <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
              isCrctSidebar ? 'text-white/50 hover:bg-white/5 hover:text-white/80' : 'text-muted-foreground/60 hover:bg-muted/40 hover:text-muted-foreground'
            )}>
              <BugReportButton />
            </div>
          </div>

          <div className={cn(
            'group mt-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200',
            isCrctSidebar ? 'hover:bg-white/5' : 'hover:bg-muted/70'
          )}>
            <Avatar className={cn(
              'h-10 w-10 shadow-sm ring-2 transition-shadow duration-200',
              isCrctSidebar ? 'ring-white/10 group-hover:ring-white/25' : 'ring-primary/15 group-hover:ring-primary/30'
            )}>
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
            <Button
              variant="ghost"
              size="icon"
              title={isImpersonated ? 'Выйти из тест-режима' : 'Выйти'}
              className={cn('h-7 w-7 shrink-0 transition-colors duration-200', isCrctSidebar ? 'text-white/40 hover:text-red-300' : 'text-muted-foreground/50 hover:text-destructive')}
              onClick={handleLogout}
            >
              {isImpersonated ? <Undo2 className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
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
