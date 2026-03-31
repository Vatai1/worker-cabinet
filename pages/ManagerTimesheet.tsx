import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { TimesheetGrid, TimesheetEntry } from '@/components/timesheet/TimesheetGrid'

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
  const [timesheetData, setTimesheetData] = useState<{ entries: TimesheetEntry[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function loadTimesheet() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка загрузки')
      const list: Timesheet[] = await res.json()
      const found = list.find(t => t.year === year && t.month === month) ?? null
      setTimesheet(found)

      if (found) {
        const res2 = await fetch(`${API_BASE_URL}/timesheet/${found.id}`, { headers: getAuthHeaders() })
        if (!res2.ok) throw new Error('Ошибка загрузки данных')
        setTimesheetData(await res2.json())
      } else {
        setTimesheetData(null)
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTimesheet() }, [year, month])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const deptRes = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      const depts = await deptRes.json()
      const myDept = depts.find((d: { manager_id: number }) => d.manager_id === user?.id)
      if (!myDept) throw new Error('Вы не являетесь руководителем ни одного отдела')

      const res = await fetch(`${API_BASE_URL}/timesheet`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ department_id: myDept.id, year, month }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка создания')
      }
      await loadTimesheet()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleSubmit() {
    if (!timesheet) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet/${timesheet.id}/status`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ status: 'submitted' }),
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

  const readonly = timesheet?.status !== 'draft'

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
      ) : !timesheet ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">Табель за {MONTH_NAMES[month - 1]} {year} не создан</p>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Создание...' : 'Создать табель'}
          </Button>
        </div>
      ) : (
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
            {timesheet.status === 'draft' && (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Отправка...' : 'Отправить на утверждение'}
              </Button>
            )}
          </div>

          {timesheetData && (
            <TimesheetGrid
              timesheetId={timesheet.id}
              entries={timesheetData.entries}
              year={year}
              month={month}
              readonly={readonly}
              onSave={loadTimesheet}
            />
          )}
        </div>
      )}
    </div>
  )
}
