import { useState, useMemo, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isWithinInterval } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { VacationRequest } from '@/shared/types'
import { VacationRequestStatus } from '@/shared/types'
import { cn } from '@/shared/lib/utils'

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

const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-red-500',
]

const COLOR_MAP: Record<string, string> = {
  'bg-blue-500': '#3b82f6',
  'bg-green-500': '#22c55e',
  'bg-purple-500': '#a855f7',
  'bg-pink-500': '#ec4899',
  'bg-orange-500': '#f97316',
  'bg-teal-500': '#14b8a6',
  'bg-indigo-500': '#6366f1',
  'bg-red-500': '#ef4444',
}

export function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

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
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [showLegendExpanded, setShowLegendExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    date: Date
  } | null>(null)

  const visibleRequests = useMemo(() =>
    requests.filter(r =>
      r.status === VacationRequestStatus.APPROVED ||
      r.status === VacationRequestStatus.ON_APPROVAL
    ),
    [requests]
  )

  const normalizedSearch = searchQuery?.trim().toLowerCase() || ''

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
    return visibleRequests.filter(request => {
      const start = new Date(request.startDate)
      const end = new Date(request.endDate)
      return isWithinInterval(date, { start, end }) ||
             isSameDay(date, start) ||
             isSameDay(date, end)
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
        onDateRangeSelect?.(clickedDate, null)
      } else {
        onDateRangeSelect?.(selectedStartDate, clickedDate)
      }
    } else {
      onDateRangeSelect?.(clickedDate, null)
    }
  }

  const clearSelection = () => {
    onDateRangeSelect?.(null, null)
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

  const hasSelection = selectedStartDate || selectedEndDate

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

  return (
    <div className="space-y-6">
      {showHeader && (
        <>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold">Календарь отпусков {year}</h2>
              {hasSelection && (
                <button
                  onClick={clearSelection}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Очистить выбор
                </button>
              )}
            </div>
            {(selectedStartDate || selectedEndDate) && (
              <div className="text-sm">
                {selectedStartDate && !selectedEndDate && (
                  <span className="text-blue-600">
                    Выбрана дата: {format(new Date(selectedStartDate), 'dd.MM.yyyy', { locale: ru })}
                  </span>
                )}
                {selectedStartDate && selectedEndDate && (
                  <span className="text-green-600">
                    Период: {format(new Date(selectedStartDate), 'dd.MM.yyyy', { locale: ru })} - {format(new Date(selectedEndDate), 'dd.MM.yyyy', { locale: ru })}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            💡 <strong>Подсказка:</strong> Дни с заявками на отпуск заштрихованы. Нажмите правой кнопкой мыши на день, чтобы увидеть детали заявки.
          </div>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {months.map(month => (
          <div key={month.index} className="border rounded-lg p-3 bg-card">
            <div className="text-center font-semibold mb-2 text-sm">
              {month.name}
            </div>

            <div className="grid grid-cols-7 gap-1 text-xs">
              {WEEKDAYS.map(day => (
                <div key={day} className="text-center text-muted-foreground font-medium p-1">
                  {day}
                </div>
              ))}

              {Array.from({ length: month.offset }).map((_, i) => (
                <div key={`empty-${i}`} className="p-1" />
              ))}

              {month.days.map(day => {
                const vacations = getVacationsForDay(day)
                const isSelected = isDateInSelection(day)
                const isHovered = !isSelected && isDateInHoverRange(day)
                const isWeekend = getDay(day) === 0 || getDay(day) === 6
                const dateStr = format(day, 'yyyy-MM-dd')
                const hasVacation = vacations.length > 0
                const visibleVacations = vacations.slice(0, 3)
                const remainingCount = vacations.length > 3 ? vacations.length - 3 : 0
                const isMineDay = !!currentUserId && vacations.some(v => v.userId === currentUserId)
                const matchesSearch = !normalizedSearch || vacations.some(v =>
                  `${v.userLastName} ${v.userFirstName} ${v.userMiddleName ?? ''}`.toLowerCase().includes(normalizedSearch)
                )
                const isDimmed = hasVacation && !isSelected && !matchesSearch
                const isHoveringCell = hoverDate === dateStr

                const bgLayers: string[] = []
                if (hasVacation && !isSelected) {
                  visibleVacations
                    .filter(v => v.status === VacationRequestStatus.ON_APPROVAL)
                    .forEach(v => {
                      const color = COLOR_MAP[getUserColor(v.userId)] || '#3b82f6'
                      bgLayers.push(`repeating-linear-gradient(45deg, ${color}90 0px, ${color}90 2px, transparent 2px, transparent 6px)`)
                    })
                  const approvedVacations = visibleVacations.filter(v => v.status === VacationRequestStatus.APPROVED)
                  if (approvedVacations.length > 0) {
                    const color = COLOR_MAP[getUserColor(approvedVacations[0].userId)] || '#3b82f6'
                    bgLayers.push(`linear-gradient(${color}30, ${color}30)`)
                  }
                }

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
                    onMouseEnter={() => setHoverDate(dateStr)}
                    onMouseLeave={() => setHoverDate(null)}
                    className={cn(
                      'relative h-[30px] flex flex-col items-center justify-center text-center cursor-pointer rounded transition-all',
                      isSelected
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : isHovered
                          ? 'bg-blue-200 dark:bg-blue-800'
                          : isWeekend
                            ? 'bg-muted text-muted-foreground font-medium'
                            : hasVacation
                              ? 'font-semibold hover:bg-muted/30'
                              : 'hover:bg-muted/50',
                      isMineDay && !isSelected && 'ring-2 ring-primary font-bold',
                      isDimmed && 'opacity-30'
                    )}
                    style={bgLayers.length > 0 ? { backgroundImage: bgLayers.join(', ') } : undefined}
                  >
                    <div className="relative">
                      <div className="text-xs relative z-10">{format(day, 'd')}</div>
                      {hasVacation && !isSelected && (
                         <div className="absolute -bottom-1 left-0 right-0 flex justify-center gap-0.5">
                           {visibleVacations.map(v => {
                             const colorClass = getUserColor(v.userId)
                             return (
                               <div
                                 key={v.id}
                                 className={`w-1.5 h-1.5 rounded-full ${colorClass} ${v.status === 'on_approval' ? 'opacity-50' : ''}`}
                               />
                             )
                           })}
                         </div>
                       )}
                      {remainingCount > 0 && (
                        <div className="absolute -bottom-1 -right-0.5 text-xs font-bold text-muted-foreground">
                          +{remainingCount}
                        </div>
                      )}
                    </div>
                    {hasVacation && isHoveringCell && (
                      <div
                        className="absolute left-1/2 top-full z-50 mt-1 w-48 -translate-x-1/2 rounded-lg border border-border bg-popover p-2 text-left shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-[11px] font-medium text-popover-foreground">
                          {format(day, 'd MMMM yyyy', { locale: ru })}
                        </div>
                        <div className="mt-1 space-y-1">
                          {vacations.map(v => (
                            <div key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="truncate text-popover-foreground">{v.userLastName} {v.userFirstName}</span>
                              <span className={cn(
                                'shrink-0 rounded px-1 py-0.5 text-[10px] font-medium',
                                v.status === VacationRequestStatus.APPROVED
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              )}>
                                {v.status === VacationRequestStatus.APPROVED ? 'Согласовано' : 'На согласовании'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

       {showLegend && visibleRequests.length > 0 && (
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
              <div className="mt-3 mb-3 grid grid-cols-3 gap-2 text-sm">
               <div className="flex items-center gap-2">
                 <div
                   className="w-6 h-6 rounded border"
                   style={{ backgroundImage: 'linear-gradient(#3b82f630, #3b82f630)' }}
                 />
                 <span>Одобрено</span>
               </div>
               <div className="flex items-center gap-2">
                 <div
                   className="w-6 h-6 rounded border"
                   style={{ backgroundImage: 'repeating-linear-gradient(45deg, #3b82f690 0px, #3b82f690 2px, transparent 2px, transparent 6px)' }}
                 />
                 <span>На согласовании</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded border bg-muted" />
                 <span>Выходной</span>
               </div>
             </div>

            <h4 className="font-medium text-sm mb-2">Сотрудники</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Array.from(new Set(visibleRequests.map(r => r.userId))).map(userId => {
                const userRequests = visibleRequests.filter(r => r.userId === userId)
                const request = userRequests[0]
                return (
                  <div key={userId} className="flex items-center gap-2 text-sm">
                    <div className={`w-3 h-3 rounded ${getUserColor(userId)}`} />
                    <span>{request.userLastName} {request.userFirstName[0]}.</span>
                  </div>
                )
              })}
            </div>
              </>
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
                        className="w-full text-left px-2 py-2 text-sm hover:bg-blue-50 rounded flex items-center gap-2"
                      >
                        <div className={`w-2 h-2 rounded-full ${getUserColor(request.userId)}`} />
                        <span>{request.userLastName} {request.userFirstName}</span>
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
                          className="w-full text-left px-2 py-2 text-sm hover:bg-muted rounded flex items-center gap-2 text-blue-600"
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
