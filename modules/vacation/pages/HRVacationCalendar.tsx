import { useEffect, useState, useMemo, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { Card } from '@/shared/components/ui/Card'
import { YearCalendar } from '@/shared/components/calendar/YearCalendar'
import { CalendarLegendSwatches } from '@/shared/components/calendar/CalendarLegendSwatches'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { VacationDetailModal } from '@/modules/vacation/components/modals/VacationDetailModal'
import { VacationLimitSettingCard } from '@/modules/vacation/components/VacationLimitSettingCard'
import { VacationDayRulesCard } from '@/modules/vacation/components/VacationDayRulesCard'
import { VacationAccessCard } from '@/modules/vacation/components/VacationAccessCard'
import { HRVacationRestrictions } from '@/modules/vacation/pages/HRVacationRestrictions'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'
import { useWsStore } from '@/shared/store/wsStore'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import { cn, personName } from '@/shared/lib/utils'
import {
  Plane, Calendar, Search, ChevronLeft, ChevronRight, Loader2,
  RotateCcw,
} from 'lucide-react'
import type { VacationRequest } from '@/shared/types'
import { VacationRequestStatus, VACATION_TYPES } from '@/shared/types'

interface Department {
  id: number
  name: string
  employee_count?: string | number
  vacation_requests_blocked?: boolean
}

function deptHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  return ((h % 360) + 360) % 360
}

function hueStyle(hue: number): CSSProperties {
  return { '--dept-hue': hue } as CSSProperties
}

const REQUEST_STATUS_OPTIONS = [
  { value: VacationRequestStatus.APPROVED, label: 'Согласовано' },
  { value: VacationRequestStatus.ON_APPROVAL, label: 'На согласовании' },
]

const EMPTY_REQUEST_FILTERS: { departmentIds: string[]; statuses: string[]; vacationTypes: string[] } = { departmentIds: [], statuses: [], vacationTypes: [] }

const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MON_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

function periodLbl(p: [number, number, number, number]): string {
  if (p[0] === p[2]) return p[1] === p[3] ? `${p[1]} ${MON[p[0]]}` : `${p[1]}–${p[3]} ${MON[p[0]]}`
  return `${p[1]} ${MON[p[0]]} – ${p[3]} ${MON[p[2]]}`
}

function monthsOf(p: [number, number, number, number]): number[] {
  const r: number[] = []
  for (let m = p[0]; m <= p[2]; m++) r.push(m)
  return r
}

function pluralRn(n: number, one: string, few: string, many: string): string {
  const a = n % 10, b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few
  return many
}

interface EmployeeCard {
  id: number
  name: string
  pos: string
  dept: string
  deptId: string
  p: [number, number, number, number][]
  days: number
  initials: string
  hue: number
}

export function HRVacationCalendar() {
  const user = useAuthStore((state) => state.user)
  const calendarVersion = useVacationStore((s) => s.calendarVersion)
  const bumpCalendarVersion = useVacationStore((s) => s.bumpCalendarVersion)
  const vacationEvents = useWsStore((s) => s.vacationEvents)

  useEffect(() => {
    if (vacationEvents.n === 0) return
    bumpCalendarVersion()
  }, [vacationEvents, bumpCalendarVersion])
  const [requests, setRequests] = useState<VacationRequest[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())

  const [query, setQuery] = useState('')
  const [month, setMonth] = useState(-1)
  const [reqFilters, setReqFilters] = useState(EMPTY_REQUEST_FILTERS)
  const [sort, setSort] = useState<'name' | 'date' | 'days'>('name')
  const [page, setPage] = useState(1)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [detailRequest, setDetailRequest] = useState<VacationRequest | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'calendar' | 'days' | 'access' | 'restrictions'>('calendar')

  const PER_PAGE = 15

  const fetchDepartments = useCallback(async () => {
    await useDepartmentsStore.getState().invalidateDepartments()
    await useDepartmentsStore.getState().fetchDepartments()
    setDepartments(useDepartmentsStore.getState().departments as Department[])
  }, [])

  useEffect(() => { fetchDepartments() }, [fetchDepartments])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await vacationApi.getAllRequests({ year })
        setRequests(data)
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : 'Ошибка при загрузке данных')
      } finally {
        setLoading(false)
      }
    }
    fetchRequests()
  }, [year, calendarVersion])

  const handleDateRangeSelect = (startDate: string | null) => {
    if (startDate && startDate.startsWith('vr-')) {
      const requestId = startDate.replace('vr-', '')
      const request = requests.find((r) => r.id === requestId)
      if (request) {
        setDetailRequest(request)
        setShowDetailModal(true)
      }
    }
  }

  const visibleRequests = useMemo(() => {
    let reqs = requests.filter((r) => r.status === VacationRequestStatus.APPROVED || r.status === VacationRequestStatus.ON_APPROVAL)
    if (reqFilters.statuses.length > 0) reqs = reqs.filter((r) => reqFilters.statuses.includes(r.status))
    if (reqFilters.vacationTypes.length > 0) reqs = reqs.filter((r) => reqFilters.vacationTypes.includes(r.vacationType))
    return reqs
  }, [requests, reqFilters])

  const employeeStats = useMemo(() => {
    const stats: Record<string, { firstName: string; lastName: string; middleName?: string | null; position: string; department: string; departmentId: string; count: number }> = {}
    visibleRequests.forEach((r) => {
      if (!stats[r.userId]) {
        stats[r.userId] = { firstName: r.userFirstName, lastName: r.userLastName, middleName: r.userMiddleName, position: r.userPosition, department: r.userDepartment, departmentId: r.departmentId ?? '', count: 0 }
      }
      stats[r.userId].count++
    })
    return Object.entries(stats).sort((a, b) => a[1].lastName.localeCompare(b[1].lastName))
  }, [visibleRequests])

  const employeeCards: EmployeeCard[] = useMemo(() => {
    return employeeStats.map(([userId, info]) => {
      const userRequests = visibleRequests.filter((r) => r.userId === userId)
      const days = userRequests.reduce((s, r) => {
        const start = new Date(r.startDate)
        const end = new Date(r.endDate)
        return s + Math.round((end.getTime() - start.getTime()) / 864e5) + 1
      }, 0)
      const p = userRequests.map((r) => {
        return [new Date(r.startDate).getMonth(), new Date(r.startDate).getDate(), new Date(r.endDate).getMonth(), new Date(r.endDate).getDate()] as [number, number, number, number]
      })
      return {
        id: Number(userId), name: personName(info.lastName, info.firstName, info.middleName),
        pos: info.position, dept: info.department, deptId: info.departmentId, p, days,
        initials: info.lastName[0] + info.firstName[0],
        hue: deptHue(info.department),
      }
    })
  }, [employeeStats, visibleRequests])

  const filteredCards = useMemo(() => {
    let list = employeeCards
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase()
      list = list.filter((e) => (e.name + ' ' + e.pos + ' ' + e.dept).toLowerCase().includes(q))
    }
    if (month >= 0) list = list.filter((e) => e.p.some((p) => monthsOf(p).includes(month)))
    if (reqFilters.departmentIds.length > 0) list = list.filter((e) => reqFilters.departmentIds.includes(e.deptId))
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    if (sort === 'date') list.sort((a, b) => Math.min(...a.p.map((p) => Date.UTC(2026, p[0], p[1]))) - Math.min(...b.p.map((p) => Date.UTC(2026, p[0], p[1]))))
    if (sort === 'days') list.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'ru'))
    return list
  }, [employeeCards, debouncedQuery, month, reqFilters, sort])

  const totalPages = Math.max(1, Math.ceil(filteredCards.length / PER_PAGE))
  const pageItems = filteredCards.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])

  const monthCounts = useMemo(() => {
    const c = new Map<number, number>()
    employeeCards.forEach((e) => { e.p.forEach((p) => monthsOf(p).forEach((m) => c.set(m, (c.get(m) || 0) + 1))) })
    return c
  }, [employeeCards])

  const totalEmp = employeeCards.length

  const handlePrevYear = () => setYear((y) => y - 1)
  const handleNextYear = () => setYear((y) => y + 1)

  const pageList = (cur: number, total: number): (number | '...')[] => {
    const set = new Set([1, total, cur - 1, cur, cur + 1])
    if (cur <= 3) [2, 3, 4].forEach((p) => set.add(p))
    if (cur >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => set.add(p))
    const sorted = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
    const out: (number | '...')[] = []
    let prev = 0
    for (const p of sorted) {
      if (p - prev > 1) out.push('...')
      out.push(p)
      prev = p
    }
    return out
  }

  const handleResetPage = () => setPage(1)

  const resetFilters = () => {
    setReqFilters(EMPTY_REQUEST_FILTERS)
    setQuery('')
    setMonth(-1)
    setSort('name')
    handleResetPage()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Шапка ── */}
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Plane className="w-8 h-8 text-primary" />
            Календарь отпусков
          </h1>
          <p className="mt-2 text-muted-foreground">{pluralRn(totalEmp, 'работник', 'работника', 'работников')} в отпуске в {year} году</p>
        </div>
      </div>

      {/* ── Табы ── */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {([
          { id: 'calendar', label: 'Календарь' },
          { id: 'days', label: 'Дни отпуска' },
          { id: 'access', label: 'Доступ' },
          { id: 'restrictions', label: 'Пересечения' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'days' && (
        <div className="space-y-4">
          <VacationLimitSettingCard />
          <VacationDayRulesCard />
        </div>
      )}
      {activeTab === 'access' && <VacationAccessCard />}
      {activeTab === 'restrictions' && <HRVacationRestrictions />}

      {activeTab === 'calendar' && (
      <>
      {/* ── Панель инструментов ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex h-9 flex-1 min-w-[200px] max-w-md items-center gap-2 rounded-[10px] border border-border bg-card px-3 transition-shadow focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); handleResetPage() }}
            placeholder="Поиск по имени, должности, отделу…"
            className="w-full border-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
          />
        </div>
        <SelectDropdown
          value={String(month)}
          onChange={(v) => { setMonth(Number(v)); handleResetPage() }}
          options={[
            { value: '-1', label: 'Все месяцы' },
            ...MON_FULL.map((m, i) => ({ value: String(i), label: `${m}${monthCounts.get(i) ? ` · ${monthCounts.get(i)}` : ''}` })),
          ]}
        />
        <MultiSelectDropdown
          options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
          selected={reqFilters.departmentIds}
          onChange={(ids) => { setReqFilters((f) => ({ ...f, departmentIds: ids })); handleResetPage() }}
          placeholder="Все отделы"
          countLabel="Отделов"
        />
        <MultiSelectDropdown
          options={REQUEST_STATUS_OPTIONS}
          selected={reqFilters.statuses}
          onChange={(values) => { setReqFilters((f) => ({ ...f, statuses: values })); handleResetPage() }}
          placeholder="Все статусы"
          countLabel="Статусов"
        />
        <MultiSelectDropdown
          options={Object.entries(VACATION_TYPES).map(([code, info]) => ({ value: code, label: info.name }))}
          selected={reqFilters.vacationTypes}
          onChange={(values) => { setReqFilters((f) => ({ ...f, vacationTypes: values })); handleResetPage() }}
          placeholder="Все типы"
          countLabel="Типов"
        />
        <SelectDropdown
          value={sort}
          onChange={(v) => { setSort(v as 'name' | 'date' | 'days'); handleResetPage() }}
          options={[
            { value: 'name', label: 'По алфавиту' },
            { value: 'date', label: 'По дате отпуска' },
            { value: 'days', label: 'По количеству дней' },
          ]}
        />
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-[15px] py-[9px] text-[13px] font-semibold text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
        >
          <RotateCcw className="h-[14px] w-[14px]" />
          Сбросить
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Календарь ── */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
                <Calendar className="h-[18px] w-[18px]" />
              </div>
              <h2 className="text-[16.5px] font-bold text-foreground">Календарь отпусков</h2>
            </div>
            <div className="flex items-center gap-[2px] rounded-[10px] border border-border bg-card p-[3px]">
              <button type="button" onClick={handlePrevYear} disabled={year <= 2024} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[46px] text-center text-[14px] font-bold text-foreground">{year}</span>
              <button type="button" onClick={handleNextYear} disabled={year >= 2028} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Загрузка...</span>
            </div>
          ) : (
            <YearCalendar year={year} requests={visibleRequests} currentUserId={user?.id} onDateRangeSelect={handleDateRangeSelect} showHeader={false} showLegend={false} />
          )}
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <CalendarLegendSwatches />
        </div>
      </Card>

      {/* ── Работники в отпуске ── */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Работники в отпуске</h2>
            <span className="text-sm text-muted-foreground">{pluralRn(filteredCards.length, 'работник', 'работника', 'работников')}</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Загрузка...</span>
            </div>
          ) : pageItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Никого не найдено</p>
              <p className="text-xs mt-1">Попробуйте изменить запрос или сбросить фильтры</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">ФИО</th>
                    <th className="py-2 pr-3 font-medium">Должность</th>
                    <th className="py-2 pr-3 font-medium">Отдел</th>
                    <th className="py-2 pr-3 font-medium">Периоды</th>
                    <th className="py-2 pl-3 font-medium text-right">Дней</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((e, i) => {
                    const delay = Math.min(i * 15, 240)
                    return (
                      <tr
                        key={e.id}
                        className="vac-card-appear border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                        style={{ animationDelay: `${delay}ms` }}
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 dept-chip-bg" style={hueStyle(e.hue)}>
                              {e.initials}
                            </div>
                            <span className="font-semibold text-foreground truncate">{e.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{e.pos}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-[6px] h-[6px] rounded-full shrink-0 dept-chip-dot" style={hueStyle(e.hue)} />
                            {e.dept}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                          {(() => {
                            const matchingPeriods = month >= 0 ? e.p.filter((p) => monthsOf(p).includes(month)) : e.p
                            return (
                              <>
                                {matchingPeriods.map(periodLbl).join(' · ')}
                                {matchingPeriods.length > 1 && (
                                  <span className="ml-1.5 text-[10px] text-muted-foreground/70">({matchingPeriods.length} период{pluralRn(matchingPeriods.length, '', '', 'ов')})</span>
                                )}
                              </>
                            )
                          })()}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-semibold text-primary whitespace-nowrap">
                          {e.days} {pluralRn(e.days, 'день', 'дня', 'дней')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ── Пагинация ── */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 flex-wrap" aria-label="Постраничная навигация">
          <span className="text-sm text-muted-foreground">
            Показано {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filteredCards.length)} из {filteredCards.length}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 1}
              className="min-w-[36px] h-9 px-2 font-inherit text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg cursor-pointer hover:border-muted-foreground/30 hover:text-foreground disabled:opacity-40 transition-all flex items-center justify-center"
            >‹</button>
            {pageList(page, totalPages).map((p, i) => (
              p === '...' ? (
                <span key={`gap-${i}`} className="min-w-[24px] h-9 flex items-center justify-center text-muted-foreground text-sm select-none">…</span>
              ) : (
                <button
                  key={p} type="button" onClick={() => setPage(p as number)}
                  aria-label={`Страница ${p}`} aria-current={p === page ? 'page' : undefined}
                  className={cn(
                    'min-w-[36px] h-9 px-2 font-inherit text-sm font-medium rounded-lg cursor-pointer transition-all flex items-center justify-center',
                    p === page ? 'bg-primary text-primary-foreground border border-primary' : 'text-muted-foreground bg-card border border-border hover:border-muted-foreground/30 hover:text-foreground'
                  )}
                >{p}</button>
              )
            ))}
            <button
              type="button" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}
              className="min-w-[36px] h-9 px-2 font-inherit text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg cursor-pointer hover:border-muted-foreground/30 hover:text-foreground disabled:opacity-40 transition-all flex items-center justify-center"
            >›</button>
          </div>
        </nav>
      )}
      </>
      )}

      <VacationDetailModal
        isOpen={showDetailModal}
        request={detailRequest}
        onClose={() => setShowDetailModal(false)}
      />
    </div>
  )
}
