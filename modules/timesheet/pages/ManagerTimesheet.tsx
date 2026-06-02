import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { TimesheetGrid, TimesheetEntry } from '@/shared/components/timesheet/TimesheetGrid'
import { TimesheetLegend } from '@/shared/components/timesheet/TimesheetLegend'
import { Sparkles, Users, Send, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { confirmDialog } from '@/shared/components/ConfirmDialog'

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
      const names = emptyCells.map((e: TimesheetEntry) => {
        const emp = timesheetData.employees.find((em: { id: number }) => em.id === e.employee_id)
        return emp ? `${emp.first_name} ${emp.last_name}` : `ID ${e.employee_id}`
      })
      await confirmDialog({
        title: 'Не все ячейки заполнены',
        message: `За сегодня не заполнено ${emptyCells.length} из ${todayEntries.length} записей:\n\n${names.join(', ')}\n\nСначала заполните все ячейки за сегодня.`,
        confirmText: 'Понятно',
        variant: 'warning',
      })
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

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-white/70" />
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Табель</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Табель</h1>
          <p className="mt-2 text-white/50 text-sm">Учёт рабочего времени сотрудников</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-6">
          {timesheetData?.employees && (
            <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
              <Users className="h-3.5 w-3.5" />{timesheetData.employees.length} сотрудников
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-white/20 rounded-lg px-3 py-2 text-sm bg-card/10 text-white"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1} className="text-black">{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-white/20 rounded-lg px-3 py-2 text-sm bg-card/10 text-white"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y} className="text-black">{y}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : timesheet && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">{timesheet.department_name}</span>
            {(() => {
              const today = new Date()
              const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
              const todayEntries = (timesheetData?.entries ?? []).filter((e: TimesheetEntry) => e.date === todayStr)
              const allSubmitted = todayEntries.length > 0 && todayEntries.every((e: TimesheetEntry) => e.is_submitted)

              if (allSubmitted) {
                return (
                  <Button disabled className="opacity-60 cursor-not-allowed">
                    <CheckCircle2 className="h-4 w-4 mr-1.5" /> Отправлено за сегодня
                  </Button>
                )
              }
              return (
                <Button onClick={handleSubmitToday} disabled={submitting}>
                  {submitting ? 'Отправка...' : <><Send className="h-4 w-4 mr-1.5" /> Отправить за сегодня</>}
                </Button>
              )
            })()}
          </div>

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
