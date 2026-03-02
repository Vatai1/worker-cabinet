import { useState, useMemo, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isWithinInterval } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { VacationRequest } from '@/types'
import { VacationRequestStatus } from '@/types'

interface YearCalendarProps {
  year: number
  requests: VacationRequest[]
  onDateRangeSelect?: (startDate: string | null, endDate: string | null) => void
  selectedStartDate?: string | null
  selectedEndDate?: string | null
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

function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function YearCalendar({ year, requests, onDateRangeSelect, selectedStartDate, selectedEndDate }: YearCalendarProps) {
  const [hoverDate, setHoverDate] = useState<string | null>(null)
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
    console.log('Context menu triggered', date)
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
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Календарь отпусков {year}</h2>
          {hasSelection && (
            <button
              onClick={clearSelection}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
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

      <div className="text-sm text-gray-600">
        💡 <strong>Подсказка:</strong> Дни с заявками на отпуск заштрихованы. Нажмите правой кнопкой мыши на день, чтобы увидеть детали заявки.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {months.map(month => (
          <div key={month.index} className="border rounded-lg p-3 bg-white">
            <div className="text-center font-semibold mb-2 text-sm">
              {month.name}
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-xs">
              {WEEKDAYS.map(day => (
                <div key={day} className="text-center text-gray-500 font-medium p-1">
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
                
                return (
                  <div
                    key={dateStr}
                    data-date-cell="true"
                    onClick={() => {
                      console.log('Date clicked', dateStr)
                      handleDateClick(day)
                    }}
                    onContextMenu={(e) => {
                      console.log('Context menu attempt', dateStr)
                      handleContextMenu(e as any, day)
                    }}
                    onMouseEnter={() => setHoverDate(dateStr)}
                    onMouseLeave={() => setHoverDate(null)}
                    className={`
                      relative p-1 text-center cursor-pointer rounded transition-all
                      ${isWeekend && !isSelected ? 'bg-gray-200 text-gray-600 font-medium' : ''}
                      ${!isWeekend && !isSelected && !hasVacation ? 'hover:bg-gray-100' : ''}
                      ${isSelected ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}
                      ${isHovered ? 'bg-blue-200' : ''}
                      ${hasVacation && !isSelected && !isWeekend ? 'font-semibold' : ''}
                      ${hasVacation && !isSelected && !isWeekend ? 'bg-white' : ''}
                    `}
                    style={(hasVacation && !isSelected && visibleVacations.some(v => v.status === 'on_approval')) ? {
                      backgroundImage: visibleVacations
                        .filter(v => v.status === 'on_approval')
                        .map(v => {
                          const colorClass = getUserColor(v.userId)
                          const colorMap: Record<string, string> = {
                            'bg-blue-500': '#3b82f6',
                            'bg-green-500': '#22c55e',
                            'bg-purple-500': '#a855f7',
                            'bg-pink-500': '#ec4899',
                            'bg-orange-500': '#f97316',
                            'bg-teal-500': '#14b8a6',
                            'bg-indigo-500': '#6366f1',
                            'bg-red-500': '#ef4444',
                          }
                          const color = colorMap[colorClass] || '#3b82f6'
                          return `repeating-linear-gradient(45deg, ${color}40 0px, ${color}40 2px, transparent 2px, transparent 4px)`
                        }).join(', ')
                    } : undefined}
                    title={vacations.map(v => {
                      const statusText = v.status === 'approved' ? '(одобрено)' : v.status === 'on_approval' ? '(на согласовании)' : `(${v.status})`
                      return `${v.userLastName} ${v.userFirstName} ${statusText}`
                    }).join(', ')}
                  >
                    <div className="relative">
                      <div className="text-xs relative z-10">{format(day, 'd')}</div>
                      {hasVacation && !isSelected && (
                        <div className="absolute -bottom-1 left-0 right-0 flex justify-center gap-0.5">
                          {visibleVacations.filter(v => v.status === 'approved').map(v => {
                            const colorClass = getUserColor(v.userId)
                            return (
                              <div
                                key={v.id}
                                className={`w-1.5 h-1.5 rounded-full ${colorClass}`}
                              />
                            )
                          })}
                        </div>
                      )}
                      {remainingCount > 0 && (
                        <div className="absolute -bottom-1 -right-0.5 text-xs font-bold text-gray-500">
                          +{remainingCount}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

       {visibleRequests.length > 0 && (
          <div className="border rounded-lg p-4 bg-white">
            <h3 className="font-semibold mb-3">Легенда</h3>

             <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded border bg-white flex items-center justify-center">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                 </div>
                 <span>Одобрено</span>
               </div>
               <div className="flex items-center gap-2">
                 <div
                   className="w-6 h-6 rounded border bg-white"
                   style={{
                     backgroundImage: 'repeating-linear-gradient(45deg, #3b82f640 0px, #3b82f640 2px, transparent 2px, transparent 4px)'
                   }}
                 />
                 <span>На согласовании</span>
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
          </div>
        )}

        {contextMenu && (
          <div
            className="fixed bg-white rounded-lg shadow-xl border z-50 min-w-48"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-2">
              <div className="text-xs text-gray-500 mb-2 px-2">
                {format(contextMenu.date, 'dd MMMM yyyy', { locale: ru })}
              </div>
              {getVacationsForDay(contextMenu.date).length > 0 ? (
                <div className="space-y-1">
                  {getVacationsForDay(contextMenu.date).map((request) => (
                    <button
                      key={request.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        console.log('View details button clicked', request.id)
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
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 px-2 py-2">
                  Нет отпусков в этот день
                </div>
              )}
            </div>
          </div>
        )}
     </div>
   )
 }
