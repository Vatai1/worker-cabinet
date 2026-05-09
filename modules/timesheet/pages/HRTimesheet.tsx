import { useEffect, useState } from 'react'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { TimesheetGrid, TimesheetEntry } from '@/shared/components/timesheet/TimesheetGrid'
import { TimesheetLegend } from '@/shared/components/timesheet/TimesheetLegend'
import { useAuthStore } from '@/core/auth/store/authStore'

interface Department { id: number; name: string }
interface Timesheet {
  id: number
  department_id: number
  department_name: string
  year: number
  month: number
  status: 'draft' | 'submitted' | 'approved'
}

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export function HRTimesheet() {
  const user = useAuthStore(s => s.user)
  const now = new Date()
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState<number | null>(null)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [timesheetData, setTimesheetData] = useState<{ entries: TimesheetEntry[]; employees: { id: number; first_name: string; last_name: string }[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      .then(r => {
        if (!r.ok) throw new Error('Ошибка загрузки отделов')
        return r.json()
      })
      .then((data: Department[]) => {
        setDepartments(data)
        if (data.length > 0) setSelectedDept(data[0].id)
      })
      .catch(err => setError(getErrorMessage(err)))
  }, [])

  async function loadTimesheet() {
    if (!selectedDept) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка загрузки')
      const list: Timesheet[] = await res.json()
      const found = list.find(t => t.department_id === selectedDept && t.year === year && t.month === month) ?? null
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

  useEffect(() => { loadTimesheet() }, [selectedDept, year, month])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Табель — все отделы</h1>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selectedDept ?? ''}
          onChange={e => setSelectedDept(Number(e.target.value))}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
        >
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
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

      {error && <div className="text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : !timesheet ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">Табель не найден</p>
        </div>
      ) : (
        <div className="space-y-4">
          {timesheetData && (
            <TimesheetGrid
              timesheetId={timesheet.id}
              entries={timesheetData.entries}
              employees={timesheetData.employees}
              year={year}
              month={month}
              role={user?.role}
              onSave={loadTimesheet}
            />
          )}
          <TimesheetLegend />
        </div>
      )}
    </div>
  )
}
