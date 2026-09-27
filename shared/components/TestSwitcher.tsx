import { useState, useEffect } from 'react'
import { Repeat, ChevronDown, LogIn, Loader2, Undo2, Eye, Search } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { apiGet, apiPost } from '@/shared/lib/apiClient'
import { isSuperAdmin } from '@/shared/lib/permissions'
import { useAuthStore } from '@/core/auth/store/authStore'

const ROLE_SEGMENTS = [
  { role: 'admin', label: 'Админ' },
  { role: 'hr', label: 'HR' },
  { role: 'manager', label: 'Руководитель' },
  { role: 'employee', label: 'Работник' },
  { role: 'onboarding', label: 'Онбординг' },
] as const

interface TestUser {
  id: number
  email: string
  role: string
  first_name: string
  last_name: string
  status: string
}

interface ViewAsUser {
  id: number
  firstName: string
  lastName: string
  middleName: string | null
  email: string
  position: string | null
  department: string | null
  role: string
  isTest: boolean
}

interface TestDataResp {
  department: { id: number; name: string } | null
  users: TestUser[]
  active: { previewRole: string | null; isImpersonated: boolean; impersonatedUserId: number | null; viewOnly?: boolean }
}

export async function stopImpersonation() {
  await apiPost('/auth/impersonate/stop')
  window.location.reload()
}

export function TestSwitcher({ isCrct }: { isCrct?: boolean }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<TestDataResp | null>(null)
  const [busy, setBusy] = useState(false)
  const isImpersonated = useAuthStore((s) => s.isImpersonated)
  const previewRole = useAuthStore((s) => s.previewRole)
  const viewOnly = useAuthStore((s) => s.viewOnly)
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<ViewAsUser[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setFound([])
      setSearching(false)
      return
    }
    setSearching(true)
    const t = setTimeout(() => {
      apiGet<ViewAsUser[]>(`/auth/view-as/search?q=${encodeURIComponent(q)}`)
        .then(setFound)
        .catch(() => setFound([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!open || data) return
    apiGet<TestDataResp>('/auth/test/state').then(setData).catch(() => {})
  }, [open, data])

  if (!isSuperAdmin() && !previewRole && !isImpersonated) return null

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      window.location.reload()
    } catch {
      setBusy(false)
    }
  }

  const pickRole = (role: string | null) =>
    run(() => (role ? apiPost('/auth/test/preview-role', { role }) : apiPost('/auth/impersonate/stop')))

  const loginAs = (userId: number) => run(() => apiPost('/auth/test/impersonate', { userId }))
  const viewAs = (userId: number) => run(() => apiPost('/auth/view-as', { userId }))

  const triggerLabel = isImpersonated
    ? `${viewOnly ? 'Просмотр' : 'Тест'}: ${user?.lastName ?? ''} ${user?.firstName ?? ''}`.trim()
    : previewRole
      ? `Превью роли: ${previewRole}`
      : 'Тест-контур'

  const activeUserId = isImpersonated ? Number(user?.id) : null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors',
          isImpersonated || previewRole
            ? isCrct ? 'text-white' : 'text-primary'
            : isCrct
              ? 'text-white/50 hover:bg-white/5 hover:text-white/80'
              : 'text-muted-foreground/60 hover:bg-muted/40 hover:text-muted-foreground'
        )}
      >
        <Repeat className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">{triggerLabel}</span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-64 space-y-3 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg max-h-[60vh] overflow-y-auto scrollbar-thin overscroll-contain">
          {isImpersonated && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => apiPost('/auth/impersonate/stop'))}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-400"
            >
              <Undo2 className="h-3 w-3" />
              {viewOnly ? 'Выйти из режима просмотра' : 'Выйти из тест-режима'}
            </button>
          )}

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Посмотреть как сотрудник</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ФИО, email или должность"
                className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              Реальные сотрудники — только просмотр, изменения недоступны. Вход записывается в аудит
            </p>
            {searching ? (
              <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Поиск…
              </div>
            ) : search.trim().length >= 2 && found.length === 0 ? (
              <p className="py-1.5 text-xs text-muted-foreground">Никого не нашли</p>
            ) : found.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {found.map((u) => {
                  const current = isImpersonated && Number(user?.id) === u.id
                  return (
                    <div key={u.id} className={cn('flex items-center gap-2 rounded-md px-2 py-1', current ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {u.lastName} {u.firstName} {u.middleName ?? ''}
                          {u.isTest && <span className="ml-1 text-[10px] font-normal text-amber-600">тест</span>}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {[u.position, u.department].filter(Boolean).join(' · ') || u.email}
                        </span>
                      </span>
                      {current ? (
                        <span className="text-[10px] font-medium text-primary">активен</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => viewAs(u.id)}
                          title="Смотреть кабинет от лица сотрудника"
                          aria-label={`Смотреть кабинет от лица: ${u.lastName} ${u.firstName}`}
                          className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary/10 p-1 text-primary hover:bg-primary/20 disabled:opacity-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Роль</p>
            <div className="flex flex-wrap gap-1">
              {ROLE_SEGMENTS.map((s) => (
                <button
                  key={s.role}
                  type="button"
                  disabled={busy}
                  onClick={() => pickRole(s.role)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
                    previewRole === s.role
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  )}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                disabled={busy || (!previewRole && !isImpersonated)}
                onClick={() => pickRole(null)}
                className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/70 disabled:opacity-40"
              >
                Оригинал
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Тестовые пользователи</p>
            {!data ? (
              <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Загрузка…
              </div>
            ) : data.users.filter((u) => u.status === 'active').length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Тестовые пользователи не созданы. Админ-панель → «Тестовые данные».
              </p>
            ) : (
              <div className="space-y-1">
                {data.users
                  .filter((u) => u.status === 'active')
                  .map((u) => {
                    const current = u.id === activeUserId
                    return (
                      <div
                        key={u.id}
                        className={cn('flex items-center gap-2 rounded-md px-2 py-1', current ? 'bg-primary/10' : 'hover:bg-muted/50')}
                      >
                        <span className="flex-1 truncate text-xs">
                          {u.last_name} {u.first_name} <span className="text-muted-foreground">· {u.role}</span>
                        </span>
                        {current ? (
                          <span className="text-[10px] font-medium text-primary">активен</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => loginAs(u.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                          >
                            <LogIn className="h-3 w-3" />
                            {isImpersonated ? 'Сменить' : 'Войти'}
                          </button>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ImpersonationBanner() {
  const isImpersonated = useAuthStore((s) => s.isImpersonated)
  const viewOnly = useAuthStore((s) => s.viewOnly)
  const user = useAuthStore((s) => s.user)
  const [busy, setBusy] = useState(false)

  if (!isImpersonated) return null

  const stop = async () => {
    setBusy(true)
    try {
      await stopImpersonation()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-[10001] flex items-center justify-center gap-3 px-4 py-1.5 text-[13px] font-medium',
        viewOnly ? 'bg-sky-600 text-white' : 'bg-amber-500 text-black',
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {viewOnly && <Eye className="h-3.5 w-3.5" />}
        {viewOnly
          ? `Режим просмотра: кабинет глазами ${[user?.lastName, user?.firstName, user?.middleName].filter(Boolean).join(' ')} — изменения недоступны`
          : `Вы: ${user?.lastName} ${user?.firstName} (тестовый вход)`}
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className="rounded-md bg-black/15 px-2 py-0.5 text-xs hover:bg-black/25 disabled:opacity-50"
      >
        Вернуться
      </button>
    </div>
  )
}
