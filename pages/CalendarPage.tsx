import { useState, useEffect, useCallback } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { getAuthHeaders } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'

interface CalendarEvent {
  id: string
  subject: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  isAllDay: boolean
  location?: { displayName?: string }
  body?: { content?: string }
  organizer?: { emailAddress?: { name?: string } }
  categories?: string[]
}

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const WEEKDAY_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

function formatDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatEventTime(dateTimeStr: string) {
  const d = new Date(dateTimeStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function CalendarPage() {
  const now = new Date()
  const [currentDate, setCurrentDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(formatDateKey(now))
  const [connected, setConnected] = useState(false)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const startOfMonth = new Date(year, month, 1)
      const endOfMonth = new Date(year, month + 1, 0)
      const startStr = startOfMonth.toISOString()
      const endStr = endOfMonth.toISOString()

      const res = await fetch(`${API_BASE_URL}/calendar/events?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const data = await res.json()
        if (res.status === 404 || data.code === 'NOT_CONNECTED') {
          setConnected(false)
          return
        }
        throw new Error(data.error || 'Ошибка загрузки событий')
      }
      setConnected(true)
      setEvents(await res.json())
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleConnectOutlook = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/calendar/auth/url`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка получения ссылки авторизации')
      const data = await res.json()
      window.location.href = data.url
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => {
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(formatDateKey(now))
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7

  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    const startDate = ev.isAllDay ? ev.start.dateTime.split('T')[0] : formatDateKey(new Date(ev.start.dateTime))
    if (!eventsByDate[startDate]) eventsByDate[startDate] = []
    eventsByDate[startDate].push(ev)
  }

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

  const days: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  const getCategoryColor = (categories?: string[]) => {
    if (!categories || categories.length === 0) return 'bg-blue-500'
    const cat = categories[0].toLowerCase()
    if (cat.includes('red') || cat.includes('красн')) return 'bg-red-500'
    if (cat.includes('green') || cat.includes('зелен')) return 'bg-emerald-500'
    if (cat.includes('yellow') || cat.includes('желт')) return 'bg-yellow-500'
    if (cat.includes('purple') || cat.includes('фиолетов')) return 'bg-purple-500'
    if (cat.includes('orange') || cat.includes('оранж')) return 'bg-orange-500'
    return 'bg-blue-500'
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Календарь</h1>
          <p className="text-muted-foreground mt-1">
            {connected ? `Синхронизация с Outlook · ${events.length} событий` : 'Интеграция с Outlook Calendar'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <Button variant="outline" size="sm" onClick={fetchEvents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.open('https://outlook.live.com/calendar', '_blank')}>
            <ExternalLink className="h-4 w-4 mr-1" />
            Открыть Outlook
          </Button>
        </div>
      </div>

      {!connected && (
        <div className="rounded-2xl border border-border/60 bg-card p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/30 mb-4">
            <CalendarIcon className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Подключите Outlook Calendar</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Синхронизируйте ваш календарь Outlook для просмотра событий, встреч и совещаний в одном месте
          </p>
          <Button onClick={handleConnectOutlook}>
            Подключить Outlook
          </Button>
          {error && <p className="text-sm text-destructive mt-4">{error}</p>}
        </div>
      )}

      {connected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-border/60 bg-card shadow-lg shadow-black/5 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-muted/20">
                <Button variant="ghost" size="icon" onClick={prevMonth}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">{MONTH_NAMES[month]} {year}</h2>
                  <Button variant="ghost" size="sm" onClick={goToday}>
                    Сегодня
                  </Button>
                </div>
                <Button variant="ghost" size="icon" onClick={nextMonth}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <div className="grid grid-cols-7">
                {WEEKDAY_SHORT.map(day => (
                  <div key={day} className="py-2 text-center text-xs font-semibold text-muted-foreground border-b border-border/30">
                    {day}
                  </div>
                ))}
                {days.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} className="min-h-[80px] border-b border-r border-border/20 bg-muted/10" />
                  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayEvents = eventsByDate[dateKey] || []
                  const isToday = dateKey === formatDateKey(now)
                  const isSelected = dateKey === selectedDate
                  const dow = (idx % 7)
                  const isWeekend = dow >= 5

                  return (
                    <button
                      key={dateKey}
                      onClick={() => setSelectedDate(dateKey)}
                      className={`min-h-[80px] border-b border-r border-border/20 p-1.5 text-left transition-colors hover:bg-muted/30 ${
                        isSelected ? 'bg-primary/5 ring-2 ring-inset ring-primary/30' : ''
                      } ${isWeekend ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}
                    >
                      <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                      }`}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map(ev => (
                          <div
                            key={ev.id}
                            className={`truncate text-[10px] leading-tight px-1 py-0.5 rounded text-white ${getCategoryColor(ev.categories)}`}
                          >
                            {!ev.isAllDay && <span className="opacity-80">{formatEventTime(ev.start.dateTime)} </span>}
                            {ev.subject}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} ещё</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card shadow-lg shadow-black/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 bg-muted/20">
                <h3 className="font-semibold">
                  {selectedDate
                    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
                    : 'Выберите дату'}
                </h3>
              </div>
              <div className="p-4">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : selectedEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Нет событий</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedEvents.map(ev => (
                      <div key={ev.id} className="rounded-xl border border-border/40 p-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start gap-2">
                          <div className={`w-1 h-full min-h-[40px] rounded-full ${getCategoryColor(ev.categories)}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{ev.subject}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ev.isAllDay
                                ? 'Весь день'
                                : `${formatEventTime(ev.start.dateTime)} — ${formatEventTime(ev.end.dateTime)}`}
                            </p>
                            {ev.location?.displayName && (
                              <p className="text-xs text-muted-foreground mt-0.5">📍 {ev.location.displayName}</p>
                            )}
                            {ev.organizer?.emailAddress?.name && (
                              <p className="text-xs text-muted-foreground mt-0.5">👤 {ev.organizer.emailAddress.name}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Статистика за месяц</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold">{events.length}</p>
                  <p className="text-xs text-muted-foreground">Событий</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold">{events.filter(e => e.isAllDay).length}</p>
                  <p className="text-xs text-muted-foreground">Весь день</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && connected && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
