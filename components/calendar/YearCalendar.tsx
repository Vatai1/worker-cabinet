import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isWithinInterval } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { VacationRequest } from '@/types'
import { VacationRequestStatus } from '@/types'

interface YearCalendarProps {
  year: number
  requests: VacationRequest[]
  onDateRangeSelect?: (startDate: string, endDate: string) => void
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
  
  const approvedRequests = useMemo(() => 
    requests.filter(r => r.status === VacationRequestStatus.APPROVED),
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
    const dateStr = format(date, 'yyyy-MM-dd')
    return approvedRequests.filter(request => {
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

  const hasSelection = selectedStartDate || selectedEndDate

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
                
                return (
                  <div
                    key={dateStr}
                    onClick={() => handleDateClick(day)}
                    onMouseEnter={() => setHoverDate(dateStr)}
                    onMouseLeave={() => setHoverDate(null)}
                    className={`
                      relative p-1 text-center cursor-pointer rounded transition-all
                      ${isWeekend ? 'bg-gray-50' : 'hover:bg-gray-100'}
                      ${isSelected ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}
                      ${isHovered ? 'bg-blue-200' : ''}
                      ${vacations.length > 0 && !isSelected ? 'font-semibold' : ''}
                    `}
                    title={vacations.map(v => 
                      `${v.userLastName} ${v.userFirstName}`
                    ).join(', ')}
                  >
                    <div className="text-xs">{format(day, 'd')}</div>
                    
                    {vacations.length > 0 && !isSelected && (
                      <div className="flex flex-wrap gap-px mt-px">
                        {vacations.slice(0, 3).map((vacation, idx) => (
                          <div
                            key={vacation.id}
                            className={`w-1.5 h-1.5 rounded-full ${getUserColor(vacation.userId)}`}
                            title={`${vacation.userLastName} ${vacation.userFirstName}`}
                          />
                        ))}
                        {vacations.length > 3 && (
                          <div className="text-xs text-gray-600">+</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {approvedRequests.length > 0 && (
        <div className="border rounded-lg p-4 bg-white">
          <h3 className="font-semibold mb-3">Легенда</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Array.from(new Set(approvedRequests.map(r => r.userId))).map(userId => {
              const userRequests = approvedRequests.filter(r => r.userId === userId)
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
    </div>
  )
}
