import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { cn } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import { Users, ScrollText, Loader2, Plus, Trash2, Edit3, Activity, ChevronLeft, ChevronRight, RefreshCw, UserCog, RotateCcw, Sliders, Clock, Globe, ShieldCheck, ArrowRightLeft, Eye, ArrowUpDown, Unlock, UserPlus, Boxes } from 'lucide-react'
import type { AuditLogEntry } from '@/core/admin/types/admin'
import { ROLE_LABELS } from '@/core/admin/pages/tabs/shared'

const ACTION_LABELS: Record<string, string> = {
  role_create: 'Создание роли',
  role_update: 'Обновление роли',
  role_delete: 'Удаление роли',
  user_role_change: 'Смена роли',
  user_status_change: 'Смена статуса',
  user_password_reset: 'Сброс пароля',
  user_update: 'Обновление пользователя',
  settings_update: 'Обновление настроек',
  bulk_status_change: 'Массовая смена статуса',
  bulk_role_change: 'Массовая смена роли',
  account_unlock: 'Разблокировка аккаунта',
  login: 'Вход в систему',
  impersonation_start: 'Вход от лица пользователя',
  impersonation_stop: 'Выход из режима «от лица пользователя»',
  module_toggle: 'Переключение модуля',
  module_org_toggle: 'Локальное переключение модуля',
  module_create: 'Создание модуля',
  module_update: 'Обновление модуля',
  module_delete: 'Удаление модуля',
  module_settings_update: 'Обновление настроек модуля',
}

const ACTION_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  role_create:        { icon: Plus,          color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  role_update:        { icon: Edit3,         color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-900/30' },
  role_delete:        { icon: Trash2,        color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-100 dark:bg-red-900/30' },
  user_role_change:   { icon: ArrowRightLeft,color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-100 dark:bg-violet-900/30' },
  user_status_change: { icon: ArrowUpDown,   color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-900/30' },
  user_password_reset:{ icon: RotateCcw,     color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-100 dark:bg-orange-900/30' },
  user_update:        { icon: UserCog,       color: 'text-sky-600 dark:text-sky-400',          bg: 'bg-sky-100 dark:bg-sky-900/30' },
  settings_update:    { icon: Sliders,       color: 'text-indigo-600 dark:text-indigo-400',    bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
  bulk_status_change: { icon: ArrowUpDown,   color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-900/30' },
  bulk_role_change:   { icon: ArrowRightLeft,color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-100 dark:bg-violet-900/30' },
  account_unlock:     { icon: Unlock,        color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  login:              { icon: Activity,      color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-900/30' },
  module_toggle:      { icon: Boxes,         color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-100 dark:bg-orange-900/30' },
  module_org_toggle:  { icon: Boxes,         color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-900/30' },
  module_create:      { icon: Boxes,         color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  module_update:      { icon: Boxes,         color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-900/30' },
  module_delete:      { icon: Trash2,        color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-100 dark:bg-red-900/30' },
  module_settings_update: { icon: Sliders, color: 'text-indigo-600 dark:text-indigo-400',  bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
}

const ENTITY_LABELS: Record<string, string> = {
  role: 'Роль',
  user: 'Пользователь',
  system: 'Система',
}

export function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн. назад`
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function DetailBadge({ label, value, variant = 'default' }: { label: string; value: string; variant?: 'default' | 'from' | 'to' }) {
  const variantClass = {
    default: 'bg-muted/60 text-muted-foreground',
    from: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    to: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  }[variant]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', variantClass)}>
      <span className="opacity-60">{label}:</span> {value}
    </span>
  )
}

export function AuditDetails({ details }: { details: Record<string, unknown> }) {
  if (!details) return null

  const elements: React.ReactNode[] = []

  if (details.userName) {
    elements.push(
      <span key="user" className="inline-flex items-center gap-1 text-xs">
        <UserPlus className="h-3 w-3 opacity-50" />
        <span className="font-medium">{String(details.userName)}</span>
      </span>
    )
  }

  if (details.oldRole && details.newRole) {
    elements.push(
      <span key="role" className="inline-flex items-center gap-1.5 text-xs">
        <DetailBadge label="Было" value={ROLE_LABELS[String(details.oldRole)] || String(details.oldRole)} variant="from" />
        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
        <DetailBadge label="Стало" value={ROLE_LABELS[String(details.newRole)] || String(details.newRole)} variant="to" />
      </span>
    )
  }

  if (details.oldStatus && details.newStatus) {
    elements.push(
      <span key="status" className="inline-flex items-center gap-1.5 text-xs">
        <DetailBadge label="Было" value={STATUS_LABELS[String(details.oldStatus)] || String(details.oldStatus)} variant="from" />
        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
        <DetailBadge label="Стало" value={STATUS_LABELS[String(details.newStatus)] || String(details.newStatus)} variant="to" />
      </span>
    )
  }

  if (details.name) {
    elements.push(
      <span key="name" className="text-xs font-medium px-2 py-0.5 rounded bg-muted/60">
        {String(details.name)}
      </span>
    )
  }

  if (details.updatedFields && Array.isArray(details.updatedFields)) {
    elements.push(
      <span key="fields" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        Изменено полей: <span className="font-medium text-foreground">{details.updatedFields.length}</span>
      </span>
    )
  }

  if (details.count !== undefined) {
    elements.push(
      <span key="count" className="text-xs text-muted-foreground">
        Записей обновлено: <span className="font-medium text-foreground">{String(details.count)}</span>
      </span>
    )
  }

  if (details.changed && typeof details.changed === 'object') {
    const changed = details.changed as Record<string, { old: unknown; new: unknown }>
    elements.push(
      <div key="changed" className="w-full">
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {Object.entries(changed).map(([key, val]) => {
            const formatVal = (v: unknown) => {
              if (v === null || v === undefined || v === '') return '—'
              if (typeof v === 'boolean') return v ? 'Да' : 'Нет'
              return String(v)
            }
            return (
              <div key={key} className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 last:border-0 text-xs">
                <span className="font-medium min-w-0 truncate flex-1">{key}</span>
                <span className="text-red-600 dark:text-red-400">{formatVal(val.old)}</span>
                <ArrowRightLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-emerald-600 dark:text-emerald-400">{formatVal(val.new)}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (details.method === 'password') {
    elements.push(<span key="method" className="text-xs text-muted-foreground">Вход по логину и паролю</span>)
  }

  if (details.method === 'keycloak') {
    const applied = (details.applied ?? {}) as {
      userCreated?: boolean
      organizations?: { slug: string; name: string; role: string }[]
      department?: string | null
      groupsReceived?: boolean
      orgSource?: 'groups' | 'company' | 'default'
    }
    const claims = (details.keycloak ?? {}) as Record<string, unknown>
    const formatClaim = (v: unknown) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))
    elements.push(
      <div key="keycloak" className="w-full space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Вход через Keycloak</span>
          {applied.userCreated && <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">новый пользователь</span>}
          {(applied.organizations ?? []).map((o) => (
            <span key={o.slug} className="rounded bg-muted/60 px-2 py-0.5">{o.name} · {ROLE_LABELS[o.role] || o.role}</span>
          ))}
          {applied.department && <span className="rounded bg-muted/60 px-2 py-0.5">Отдел: {applied.department}</span>}
          {applied.orgSource === 'company' && (
            <span className="rounded bg-muted/60 px-2 py-0.5 text-muted-foreground">организация из company</span>
          )}
          {(applied.orgSource === 'default' || (!applied.orgSource && applied.groupsReceived === false)) && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{applied.orgSource ? 'ни groups, ни company не пришли' : 'группы не пришли'} — организация по умолчанию</span>
          )}
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Данные из Keycloak ({Object.keys(claims).length})</summary>
          <div className="mt-1.5 overflow-hidden rounded-lg border border-border/50">
            {Object.entries(claims).map(([key, value]) => (
              <div key={key} className="flex gap-3 border-b border-border/30 px-3 py-1.5 last:border-0">
                <span className="w-44 shrink-0 font-mono text-muted-foreground">{key}</span>
                <span className="min-w-0 break-all">{formatClaim(value)}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    )
  }

  if (elements.length === 0) {
    return <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{JSON.stringify(details)}</p>
  }

  return <div className="flex items-center gap-2 flex-wrap mt-1.5">{elements}</div>
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  on_leave: 'В отпуске',
}

export function AuditTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      if (filterAction) params.set('action', filterAction)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/audit-log?${params}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
      }
    } catch {} finally { setLoading(false) }
  }, [page, filterAction, dateFrom, dateTo])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages = Math.ceil(total / 25)
  const now = Date.now()
  const todayCount = logs.filter(l => (now - new Date(l.created_at).getTime()) < 86400000).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <ScrollText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{total}</p>
              <p className="text-[11px] text-muted-foreground">Всего записей</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{todayCount}</p>
              <p className="text-[11px] text-muted-foreground">Сегодня</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{new Set(logs.map(l => l.user_id).filter(Boolean)).size}</p>
              <p className="text-[11px] text-muted-foreground">Активных пользователей</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{new Set(logs.map(l => l.action)).size}</p>
              <p className="text-[11px] text-muted-foreground">Типов действий</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> Журнал аудита</CardTitle>
              <CardDescription>История действий в системе</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchLogs()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Eye className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm appearance-none"
              >
                <option value="">Все типы действий</option>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">с</span>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="w-36" />
              <span className="text-xs text-muted-foreground">по</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="w-36" />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Загрузка журнала...</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ScrollText className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Нет записей</p>
              <p className="text-xs mt-1">Попробуйте изменить фильтры</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-px bg-border/50" />
              <div className="space-y-1">
                {logs.map((log) => {
                  const config = ACTION_CONFIG[log.action] || { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted/50' }
                  const Icon = config.icon
                  const isExpanded = expandedId === log.id
                  const logDate = new Date(log.created_at)

                  return (
                    <div
                      key={log.id}
                      className={cn(
                        'relative flex items-start gap-4 p-4 rounded-xl transition-all cursor-pointer group',
                        isExpanded ? 'bg-muted/30 border border-border/50' : 'hover:bg-muted/15',
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <div className={cn(
                        'relative z-10 mt-0.5 p-2 rounded-xl border-2 border-background shadow-sm transition-transform group-hover:scale-110',
                        config.bg,
                      )}>
                        <Icon className={cn('h-4 w-4', config.color)} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('font-semibold text-sm', config.color)}>
                              {ACTION_LABELS[log.action] || log.action}
                            </span>
                            {log.entity_type && (
                              <Badge className={cn('text-[10px]', config.bg, config.color)}>
                                {ENTITY_LABELS[log.entity_type] || log.entity_type}
                                {log.entity_id ? ` #${log.entity_id}` : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-muted-foreground" title={logDate.toLocaleString('ru-RU')}>
                              {relativeTime(log.created_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          {log.user_name && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-[8px] font-bold text-primary">
                                {log.user_name.charAt(0)}
                              </div>
                              {log.user_name}
                              {log.real_user_id && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  ({log.real_user_name || log.real_user_email || `id ${log.real_user_id}`})
                                </span>
                              )}
                            </span>
                          )}
                          {log.ip_address && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Globe className="h-3 w-3 opacity-50" />
                              {log.ip_address}
                            </span>
                          )}
                        </div>

                        {(isExpanded || log.details) && (
                          <div className={cn(
                            'mt-2 pt-2 border-t border-border/30',
                            !isExpanded && 'opacity-60',
                          )}>
                            {log.details ? (
                              <AuditDetails details={log.details} />
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Нет подробностей</p>
                            )}
                          </div>
                        )}

                        {isExpanded && (
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>ID: {log.id}</span>
                            <span>Полная дата: {logDate.toLocaleString('ru-RU')}</span>
                            {log.user_id && <span>User ID: {log.user_id}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border/30">
              <p className="text-sm text-muted-foreground">
                Показано <span className="font-medium text-foreground">{(page - 1) * 25 + 1}–{Math.min(page * 25, total)}</span> из <span className="font-medium text-foreground">{total}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Назад
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (page <= 3) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = page - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-sm font-medium transition-all',
                          page === pageNum
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/50',
                        )}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Далее <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
