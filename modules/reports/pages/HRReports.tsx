import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, Loader2, Plane, Users } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { cn } from '@/shared/lib/utils'

const HRVacationReports = lazy(() => import('@/modules/vacation/pages/HRVacationReports').then((m) => ({ default: m.HRVacationReports })))
const StaffReports = lazy(() => import('@/modules/reports/pages/StaffReports').then((m) => ({ default: m.StaffReports })))

const SECTIONS = [
  { id: 'vacation', name: 'Отпуска', icon: Plane, module: 'vacation', permission: 'vacation:reports', Component: HRVacationReports },
  { id: 'staff', name: 'Персонал', icon: Users, module: null, permission: 'staff:reports', Component: StaffReports },
]

export function HRReports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const permissions = useAuthStore((s) => s.permissions)
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const sections = SECTIONS.filter((s) => (s.module === null || isModuleEnabled(s.module)) && permissions.includes(s.permission))
  const requested = searchParams.get('section')
  const active = sections.find((s) => s.id === requested) ?? sections[0]

  const select = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('section', id)
      return next
    }, { replace: true })
  }

  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BarChart3 className="mb-3 h-12 w-12 opacity-20" />
        <p className="text-sm font-medium">Нет доступных отчётов</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Разделы отчётов" className="inline-flex rounded-xl bg-muted/50 p-1">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active.id === s.id}
            onClick={() => select(s.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              active.id === s.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <s.icon className="h-4 w-4" />
            {s.name}
          </button>
        ))}
      </div>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <active.Component />
      </Suspense>
    </div>
  )
}
