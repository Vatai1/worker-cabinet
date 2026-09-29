import { useState, useMemo, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isWithinInterval } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import type { VacationRequest } from '@/shared/types'
import { VacationRequestStatus } from '@/shared/types'
import { cn } from '@/shared/lib/utils'
import { useProductionCalendar } from '@/shared/lib/productionCalendar'

interface YearCalendarProps {
  year: number
  requests: VacationRequest[]
  onDateRangeSelect?: (startDate: string | null, endDate: string | null) => void
  selectedStartDate?: string | null
  selectedEndDate?: string | null
  currentUserId?: string
  onTransfer?: (request: VacationRequest) => void
  searchQuery?: string
  showHeader?: boolean
  showLegend?: boolean
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

export const PARTICIPANT_COLORS = [
  '#10B981', '#F97316', '#EC4899', '#3B82F6', '#8B5CF6', '#F43F5E',
  '#14B8A6', '#06B6D4', '#84CC16', '#EAB308', '#FB923C', '#DC2626',
]

export function buildUserColorMap(userIds: string[]): Map<string, string> {
  const unique = Array.from(new Set(userIds))
  unique.sort((a, b) => {
    const na = Number(a)
    const nb = Number(b)
    const aNum = Number.isFinite(na) && String(na) === a
    const bNum = Number.isFinite(nb) && String(nb) === b
    if (aNum && bNum) return na - nb
    if (aNum) return -1
    if (bNum) return 1
    return a.localeCompare(b)
  })
  const map = new Map<string, string>()
  unique.forEach((id, i) => map.set(id, PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length]))
  return map
}

const RF_HOLIDAYS: Array<[number, number]> = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8],
  [2, 23], [3, 8], [5, 1], [5, 9], [6, 12], [11, 4],
]

function isPublicHoliday(date: Date): boolean {
  const m = date.getMonth() + 1
  const d = date.getDate()
  return RF_HOLIDAYS.some(([hm, hd]) => hm === m && hd === d)
}

function isWeekendDay(date: Date): boolean {
  const dow = getDay(date)
  return dow === 0 || dow === 6
}

export const PENDING_STRIPE = 'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.4) 0 3px, transparent 3px 7px)'

export function YearCalendar({
  year,
  requests,
  onDateRangeSelect,
  selectedStartDate,
  selectedEndDate,
  currentUserId,
  onTransfer,
  searchQuery,
  showHeader = true,
  showLegend = true,
}: YearCalendarProps) {
  const productionDays = useProductionCalendar(year)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [showLegendExpanded, setShowLegendExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    date: Date
  } | null>(null)
  const [hoverTooltip, setHoverTooltip] = useState<{
    x: number
    y: number
    vacations: VacationRequest[]
  } | null>(null)

  const normalizedSearch = searchQuery?.trim().toLowerCase() || ''

  const colorMap = useMemo(() => buildUserColorMap(requests.map(r => r.userId)), [requests])

  const months = useMemo(() => {
    const months = []
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const date = new Date(year, monthIndex, 1)
      const monthStart = startOfMonth(date)
      const monthEnd = endOfMonth(date)
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

      const firstDayOfWeek = getDay(monthStart)
      const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

      months.push({
        index: monthIndex,
        name: MONTHS[monthIndex],
        days,
        offset
      })
    }
    return months
  }, [year])

  const getVacationsForDay = (date: Date) => {
    return requests.filter(request => {
      if (request.status !== VacationRequestStatus.APPROVED && request.status !== VacationRequestStatus.ON_APPROVAL) return false
      const start = new Date(request.startDate)
      const end = new Date(request.endDate)
      const within = isWithinInterval(date, { start, end }) ||
             isSameDay(date, start) ||
             isSameDay(date, end)
      if (!within) return false
      return true
    })
  }

  const isDateInSelection = (date: Date) => {
    if (!selectedStartDate) return false
    const start = new Date(selectedStartDate)
    const end = selectedEndDate ? new Date(selectedEndDate) : null

    if (end) {
      return isWithinInterval(date, { start, end }) ||
             isSameDay(date, start) ||
             isSameDay(date, end)
    }
    return isSameDay(date, start)
  }

  const isDateInHoverRange = (date: Date) => {
    if (!selectedStartDate || !hoverDate) return false
    const start = new Date(selectedStartDate)
    const end = new Date(hoverDate)
    const sortedStart = start < end ? start : end
    const sortedEnd = start < end ? end : start

    return isWithinInterval(date, { start: sortedStart, end: sortedEnd })
  }

  const handleDateClick = (date: Date) => {
    const clickedDate = format(date, 'yyyy-MM-dd')

    if (!selectedStartDate) {
      onDateRangeSelect?.(clickedDate, null)
    } else if (!selectedEndDate) {
      const start = new Date(selectedStartDate)
      const clicked = new Date(clickedDate)

      if (clicked < start) {
        onDateRangeSelect?.(clickedDate, selectedStartDate)
      } else {
        onDateRangeSelect?.(selectedStartDate, clickedDate)
      }
    } else {
      onDateRangeSelect?.(clickedDate, null)
    }
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>, date: Date) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      date,
    })
  }

  const handleViewDetails = (request: VacationRequest) => {
    setContextMenu(null)
    onDateRangeSelect?.(`vr-${request.id}`, null)
  }

  const handleTransferRequest = (request: VacationRequest) => {
    setContextMenu(null)
    onTransfer?.(request)
  }

  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu) {
        setContextMenu(null)
      }
    }

    document.addEventListener('click', handleClickOutside)

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setContextMenu(null)
      if (selectedStartDate && !selectedEndDate) {
        onDateRangeSelect?.(null, null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedStartDate, selectedEndDate, onDateRangeSelect])

  const handleCalendarMouseLeave = () => {
    setHoverDate(null)
    setHoverTooltip(null)
    if (selectedStartDate && !selectedEndDate) {
      onDateRangeSelect?.(null, null)
    }
  }

  return (
    <div className="space-y-6">
      {showHeader && (
        <>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold">Календарь отпусков {year}</h2>
              {(selectedStartDate || selectedEndDate) && (
                <button
                  type="button"
                  onClick={() => onDateRangeSelect?.(null, null)}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-[15px] py-[9px] text-[13px] font-semibold text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
                >
                  <RotateCcw className="h-[14px] w-[14px]" />
                  Очистить выбор
                </button>
              )}
            </div>
            {(selectedStartDate || selectedEndDate) && (
              <div className="text-sm">
                {selectedStartDate && !selectedEndDate && (
                  <span className="text-primary">
                    Выбрана дата: {format(new Date(selectedStartDate), 'dd.MM.yyyy', { locale: ru })}
                  </span>
                )}
                {selectedStartDate && selectedEndDate && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Период: {format(new Date(selectedStartDate), 'dd.MM.yyyy', { locale: ru })} - {format(new Date(selectedEndDate), 'dd.MM.yyyy', { locale: ru })}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            💡 <strong>Подсказка:</strong> Согласованные дни отмечены зелёным, на согласовании — серой штриховкой; точка под числом — цвет сотрудника. Наведите курсор на день, чтобы увидеть, кто отдыхает, или нажмите правой кнопкой мыши для деталей заявки.
          </div>
        </>
      )}

      <div className="grid grid-cols-4 gap-[14px]" onMouseLeave={handleCalendarMouseLeave}>
        {months.map(month => (
          <div
            key={month.index}
            data-testid="month-card"
            className="rounded-xl border border-border bg-card p-[12px_12px_14px] transition-colors hover:border-muted-foreground/30"
          >
            <div className="mb-[10px] text-center text-[13px] font-bold text-foreground">
              {month.name}
            </div>

            <div className="grid grid-cols-7">
              {WEEKDAYS.map(day => (
                <div key={day} className="mb-1 text-center text-[10.5px] font-semibold text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-[3px]">
              {Array.from({ length: month.offset }).map((_, i) => (
                <div key={`empty-${i}`} className="h-[30px]" />
              ))}

              {month.days.map(day => {
                const vacations = getVacationsForDay(day)
                const isSelected = isDateInSelection(day)
                const isHovered = !isSelected && isDateInHoverRange(day)
                const dateStr = format(day, 'yyyy-MM-dd')
                const productionDay = productionDays && productionDays.size > 0 ? productionDays.get(dateStr) : undefined
                const holiday = productionDays && productionDays.size > 0
                  ? productionDay?.kind === 'holiday' || productionDay?.kind === 'transfer'
                  : isPublicHoliday(day)
                const weekend = isWeekendDay(day) && productionDay?.kind !== 'shortened'
                const hasVacation = vacations.length > 0
                const visibleVacations = vacations.slice(0, 3)
                const remainingCount = vacations.length > 3 ? vacations.length - 3 : 0
                const isMineDay = !!currentUserId && vacations.some(v => v.userId === currentUserId)
                const matchesSearch = !normalizedSearch || vacations.some(v =>
                  `${v.userLastName} ${v.userFirstName} ${v.userMiddleName ?? ''}`.toLowerCase().includes(normalizedSearch)
                )
                const isDimmed = hasVacation && !isSelected && !matchesSearch
                const isHoveringCell = hoverDate === dateStr

                let stateClass = 'text-foreground'
                if (isMineDay) {
                  stateClass = 'font-bold'
                } else if (hasVacation) {
                  stateClass = 'text-foreground font-semibold'
                } else if (holiday) {
                  stateClass = 'bg-muted text-muted-foreground'
                } else if (weekend) {
                  stateClass = 'text-muted-foreground'
                }

                let vacationStyle: { backgroundColor?: string; backgroundImage?: string } | undefined
                if (!isSelected && hasVacation) {
                  const hasApproved = vacations.some(v => v.status === VacationRequestStatus.APPROVED)
                  const hasPending = vacations.some(v => v.status === VacationRequestStatus.ON_APPROVAL)
                  if (hasApproved && hasPending) {
                    vacationStyle = {
                      backgroundColor: 'hsl(var(--muted) / 0.5)',
                      backgroundImage: `linear-gradient(to bottom, hsl(var(--success) / 0.32) 50%, transparent 50%), ${PENDING_STRIPE}`,
                    }
                  } else if (hasApproved) {
                    vacationStyle = { backgroundColor: 'hsl(var(--success) / 0.22)' }
                  } else {
                    vacationStyle = { backgroundColor: 'hsl(var(--muted) / 0.5)', backgroundImage: PENDING_STRIPE }
                  }
                }

                const liftShadow = '0 3px 8px -2px rgb(0 0 0 / 0.25)'
                const mineRing = 'inset 0 0 0 1px hsl(var(--primary))'
                let boxShadow: string | undefined
                if (isMineDay) boxShadow = isHoveringCell ? `${mineRing}, ${liftShadow}` : mineRing
                else if (isHoveringCell) boxShadow = liftShadow

                return (
                  <div
                    key={dateStr}
                    data-date-cell="true"
                    onClick={() => {
                      handleDateClick(day)
                    }}
                    onContextMenu={(e) => {
                      handleContextMenu(e, day)
                    }}
                    onMouseEnter={(e) => {
                      setHoverDate(dateStr)
                      if (vacations.length > 0) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setHoverTooltip({ x: rect.left + rect.width / 2, y: rect.top, vacations })
                      } else {
                        setHoverTooltip(null)
                      }
                    }}
                    onMouseLeave={() => {
                      setHoverDate(null)
                      setHoverTooltip(null)
                    }}
                    className={cn(
                      'relative flex h-[30px] cursor-pointer items-center justify-center rounded-[7px] text-center text-[12px] font-medium transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : isHovered
                          ? 'bg-primary/20'
                          : stateClass,
                      isDimmed && 'opacity-[.22]'
                    )}
                    style={{
                      ...vacationStyle,
                      transform: isHoveringCell && !isSelected ? 'translateY(-1px)' : undefined,
                      boxShadow: !isSelected ? boxShadow : undefined,
                      zIndex: isHoveringCell ? 2 : undefined,
                    }}
                  >
                    <span className="relative z-10">{format(day, 'd')}</span>
                    {hasVacation && !isSelected && (
                      <div className="absolute bottom-[3px] left-0 right-0 flex justify-center gap-[2px]">
                        {visibleVacations.map(v => (
                          <div
                            key={v.id}
                            className="h-1 w-1 rounded-full"
                            style={{ backgroundColor: colorMap.get(v.userId) ?? PARTICIPANT_COLORS[0] }}
                          />
                        ))}
                      </div>
                    )}
                    {remainingCount > 0 && (
                      <div className="absolute -top-1 -right-1 text-[9px] font-bold text-muted-foreground">
                        +{remainingCount}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

       {showLegend && requests.length > 0 && (
          <div className="border rounded-lg p-4 bg-card">
            <button
              type="button"
              onClick={() => setShowLegendExpanded((v) => !v)}
              className="w-full flex items-center justify-between gap-2 font-semibold hover:bg-muted rounded transition-colors -mx-1 px-1"
            >
              Легенда
              {showLegendExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showLegendExpanded && (
              <>
              <div className="mt-3 mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded flex items-center justify-center" style={{ boxShadow: 'inset 0 0 0 1.5px hsl(var(--primary))' }}>
                   <span className="text-[11px] font-bold text-foreground">7</span>
                 </div>
                 <span>Мой отпуск</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: 'hsl(var(--success) / 0.22)' }} />
                 <span>Согласовано</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: 'hsl(var(--muted) / 0.5)', backgroundImage: PENDING_STRIPE }} />
                 <span>На согласовании <span className="text-xs text-muted-foreground">— серый штрих</span></span>
               </div>
               <div className="flex items-center gap-2">
                 <div
                   className="w-6 h-6 rounded border border-border"
                   style={{
                     backgroundColor: 'hsl(var(--muted) / 0.5)',
                     backgroundImage: `linear-gradient(to bottom, hsl(var(--success) / 0.32) 50%, transparent 50%), ${PENDING_STRIPE}`,
                   }}
                 />
                 <span>Оба статуса в один день <span className="text-xs text-muted-foreground">— сверху согласовано, снизу штрих</span></span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded border bg-muted" />
                 <span>Выходной</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="flex gap-1">
                   {PARTICIPANT_COLORS.slice(0, 4).map(hex => (
                     <span key={hex} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hex }} />
                   ))}
                 </div>
                 <span>Точка — цвет сотрудника <span className="text-xs text-muted-foreground">(см. список ниже)</span></span>
               </div>
             </div>

            <h4 className="font-medium text-sm mb-2">Работники</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Array.from(new Set(requests.map(r => r.userId))).map(userId => {
                const userRequests = requests.filter(r => r.userId === userId)
                const request = userRequests[0]
                return (
                  <div key={userId} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: colorMap.get(userId) ?? PARTICIPANT_COLORS[0] }} />
                    <span>{request.userLastName} {request.userFirstName[0]}.</span>
                  </div>
                )
              })}
            </div>
              </>
            )}
          </div>
        )}

        {hoverTooltip && (
          <div
            className="pointer-events-none fixed z-50 w-max max-w-[220px] -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-lg border border-border bg-card px-2.5 py-1.5 text-left shadow-xl"
            style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
          >
            {hoverTooltip.vacations.slice(0, 6).map(v => (
              <div key={v.id} className="flex items-center gap-1.5 whitespace-nowrap py-0.5 text-[11px]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorMap.get(v.userId) ?? PARTICIPANT_COLORS[0] }}
                />
                <span className="font-medium text-foreground">{v.userLastName} {v.userFirstName}</span>
                <span className="text-muted-foreground">
                  {v.status === VacationRequestStatus.APPROVED ? 'согласовано' : 'на согласовании'}
                </span>
              </div>
            ))}
            {hoverTooltip.vacations.length > 6 && (
              <div className="pt-0.5 text-[11px] text-muted-foreground">и ещё {hoverTooltip.vacations.length - 6}…</div>
            )}
          </div>
        )}

        {contextMenu && (
          <div
            className="fixed bg-card rounded-lg shadow-xl border z-50 min-w-48"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-2">
              <div className="text-xs text-muted-foreground mb-2 px-2">
                {format(contextMenu.date, 'dd MMMM yyyy', { locale: ru })}
              </div>
              {getVacationsForDay(contextMenu.date).length > 0 ? (
                <div className="space-y-1">
                  {getVacationsForDay(contextMenu.date).map((request) => (
                    <div key={request.id} className="space-y-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          handleViewDetails(request)
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                        }}
                        className="w-full text-left px-2 py-2 text-sm hover:bg-muted rounded flex items-center gap-2"
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: request.userId === currentUserId ? 'hsl(var(--primary))' : colorMap.get(request.userId) ?? PARTICIPANT_COLORS[0] }}
                        />
                        <span>{request.userLastName} {request.userFirstName}</span>
                        <span className="text-xs text-muted-foreground">
                          {request.status === VacationRequestStatus.APPROVED ? 'согласовано' : 'на согласовании'}
                        </span>
                      </button>
                      {request.userId === currentUserId && request.status === VacationRequestStatus.APPROVED && onTransfer && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            handleTransferRequest(request)
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                          }}
                          className="w-full text-left px-2 py-2 text-sm hover:bg-muted rounded flex items-center gap-2 text-primary"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          <span>Перенести</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground px-2 py-2">
                  Нет отпусков в этот день
                </div>
              )}
            </div>
          </div>
        )}
     </div>
   )
 }
