import { useEffect, useState } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { TimesheetGrid, TimesheetEntry } from '@/components/timesheet/TimesheetGrid'
import { useAuthStore } from '@/store/authStore'

interface Timesheet {
  id: number
  department_id: number
  department_name: string
  year: number
  month: number
  status: 'draft' | 'submitted' | 'approved'
}

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export function ManagerTimesheet() {
  const user = useAuthStore(s => s.user)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [timesheetData, setTimesheetData] = useState<{ entries: TimesheetEntry[]; employees: { id: number; first_name: string; last_name: string }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function loadTimesheet() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка загрузки')
      const list: Timesheet[] = await res.json()
      const found = list.find(t => t.year === year && t.month === month) ?? null

      if (found) {
        setTimesheet(found)
        const res2 = await fetch(`${API_BASE_URL}/timesheet/${found.id}`, { headers: getAuthHeaders() })
        if (!res2.ok) throw new Error('Ошибка загрузки данных')
        setTimesheetData(await res2.json())
      } else {
        await handleCreate()
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTimesheet() }, [year, month])

  async function handleCreate() {
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ year, month }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка создания')
      }
      const created = await res.json()
      setTimesheet(created)
      const res2 = await fetch(`${API_BASE_URL}/timesheet/${created.id}`, { headers: getAuthHeaders() })
      if (!res2.ok) throw new Error('Ошибка загрузки данных')
      setTimesheetData(await res2.json())
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  async function handleSubmitToday() {
    if (!timesheet || !timesheetData) return
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    const todayEntries = timesheetData.entries.filter((e: TimesheetEntry) => e.date === todayStr)
    const emptyCells = todayEntries.filter((e: TimesheetEntry) => !e.code)
    if (emptyCells.length > 0) {
      setError(`Заполните все ячейки за сегодня (${emptyCells.length} пустых)`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet/${timesheet.id}/submit-today`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка')
      }
      await loadTimesheet()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const readonly = false

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Табель</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : timesheet && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{timesheet.department_name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                timesheet.status === 'draft' ? 'bg-muted text-muted-foreground' :
                timesheet.status === 'submitted' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
              }`}>
                {timesheet.status === 'draft' ? 'Черновик' :
                 timesheet.status === 'submitted' ? 'На утверждении' : 'Утверждён'}
              </span>
            </div>
            {timesheet.status === 'approved' && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Табель утверждён</span>
            )}
            <Button onClick={handleSubmitToday} disabled={submitting}>
              {submitting ? 'Отправка...' : 'Отправить за сегодня'}
            </Button>
          </div>

          {timesheetData && (
            <TimesheetGrid
              timesheetId={timesheet.id}
              entries={timesheetData.entries}
              employees={timesheetData.employees}
              year={year}
              month={month}
              readonly={readonly}
              role={user?.role}
              onSave={loadTimesheet}
            />
          )}

          <div className="mt-6 p-4 bg-muted/30 rounded-xl border border-border/50">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Легенда классификатора</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { code: 'Я', label: 'Явка', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
                { code: 'ОТ', label: 'Ежегодный отпуск', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
                { code: 'ОС', label: 'Отпуск без сохранения ЗП', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
                { code: 'ДО', label: 'Дополнительный отпуск', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
                { code: 'К', label: 'Командировка', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
                { code: 'Б', label: 'Больничный', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' },
              ].map(({ code, label, color }) => (
                <div key={code} className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md ${color} font-mono font-bold text-sm`}>{code}</span>
                  <span className="text-sm text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
