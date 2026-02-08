import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequestsStore } from '@/store/requestsStore'
import { useAuthStore } from '@/store/authStore'
import { mockEmployees } from '@/data/mockData'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react'
import { format, getMonth, getYear, setMonth, setYear, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function Schedule() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { requests } = useRequestsStore()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>(mockEmployees.map(e => e.id))

  const currentYear = getYear(currentDate)

  // Получаем только одобренные отпуска типа vacation
  const vacationRequests = useMemo(() => {
    return requests.filter(r => 
      r.type === 'vacation' && 
      r.status === 'approved' &&
      selectedEmployees.includes(r.userId)
    )
  }, [requests, selectedEmployees])

  // Проверяем, есть ли отпуск на конкретный день
  const getVacationsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return vacationRequests.filter(req => {
      const start = parseISO(req.startDate)
      const end = parseISO(req.endDate)
      return date >= start && date <= end
    })
  }

  // Генерируем дни месяца
  const getMonthDays = (date: Date) => {
    const firstDay = startOfMonth(date)
    const lastDay = endOfMonth(date)
    const days = eachDayOfInterval({ start: firstDay, end: lastDay })
    
    // Добавляем пустые дни для выравнивания по понедельнику
    const firstDayOfWeek = firstDay.getDay() || 7 // 0 (воскресенье) -> 7
    const padding = Array.from({ length: firstDayOfWeek - 1 }, (_, i) => null)
    
    return [...padding, ...days]
  }

  const goToPreviousYear = () => {
    setCurrentDate(prev => setYear(prev, getYear(prev) - 1))
  }

  const goToNextYear = () => {
    setCurrentDate(prev => setYear(prev, getYear(prev) + 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployees(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    )
  }

  const months = Array.from({ length: 12 }, (_, i) => setMonth(currentDate, i))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">График отпусков</h1>
          <p className="text-muted-foreground">
            Отпуска сотрудников на {currentYear} год
          </p>
        </div>
        <Button onClick={() => navigate('/requests?create=true')}>
          <Plus className="mr-2 h-4 w-4" />
          Создать заявление на отпуск
        </Button>
      </div>

      {/* Управление */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToPreviousYear}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-semibold min-w-[100px] text-center">
                {currentYear}
              </span>
              <Button variant="outline" size="sm" onClick={goToNextYear}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Сегодня
              </Button>
            </div>

            {/* Фильтр по сотрудникам */}
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="h-4 w-4 text-muted-foreground" />
              {mockEmployees.map(emp => (
                <Button
                  key={emp.id}
                  variant={selectedEmployees.includes(emp.id) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleEmployee(emp.id)}
                  className={cn(
                    'gap-1',
                    !selectedEmployees.includes(emp.id) && 'opacity-50'
                  )}
                >
                  <div className={cn('h-3 w-3 rounded-full', emp.color)} />
                  {emp.firstName}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Легенда */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            {mockEmployees.map(emp => (
              <div key={emp.id} className="flex items-center gap-2">
                <div className={cn('h-4 w-4 rounded', emp.color)} />
                <span className="text-sm">{emp.firstName} {emp.lastName}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Годовой календарь */}
      <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
        {months.map((monthDate, monthIndex) => {
          const monthDays = getMonthDays(monthDate)
          
          return (
            <Card key={monthIndex} className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-center text-sm">
                  {MONTHS[monthIndex]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {/* Дни недели */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEKDAYS.map(day => (
                    <div key={day} className="text-xs text-center text-muted-foreground font-medium">
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Дни месяца */}
                <div className="grid grid-cols-7 gap-1">
                  {monthDays.map((day, dayIndex) => {
                    if (!day) {
                      return <div key={dayIndex} className="aspect-square" />
                    }

                    const vacations = getVacationsForDay(day)
                    const isCurrentMonth = getMonth(day) === monthIndex
                    const isTodayDate = isToday(day)

                    return (
                      <div
                        key={dayIndex}
                        className={cn(
                          'aspect-square rounded-md flex flex-col items-center justify-center text-xs relative',
                          isTodayDate && 'ring-2 ring-primary',
                          !isCurrentMonth && 'opacity-30',
                          vacations.length > 0 && 'p-0'
                        )}
                      >
                        {vacations.length > 0 ? (
                          <div className="w-full h-full flex flex-col gap-0.5 p-0.5">
                            {vacations.map((vacation, vIndex) => {
                              const employee = mockEmployees.find(e => e.id === vacation.userId)
                              return (
                                <div
                                  key={vIndex}
                                  className={cn(
                                    'flex-1 rounded-sm',
                                    employee?.color || 'bg-gray-400'
                                  )}
                                  title={`${employee?.firstName} ${employee?.lastName}: ${formatDate(vacation.startDate)} - ${formatDate(vacation.endDate)}`}
                                />
                              )
                            })}
                          </div>
                        ) : (
                          <span className={cn(isTodayDate && 'font-bold')}>{format(day, 'd')}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Статистика */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Всего отпусков</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vacationRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Сотрудников в отпуске</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(vacationRequests.map(r => r.userId)).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Мой отпуск</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vacationRequests.filter(r => r.userId === user?.id).length}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
