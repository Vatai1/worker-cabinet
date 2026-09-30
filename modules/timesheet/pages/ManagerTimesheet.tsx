import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { TimesheetGrid, TimesheetEntry } from '@/shared/components/timesheet/TimesheetGrid'
import { TimesheetLegend } from '@/shared/components/timesheet/TimesheetLegend'
import { Sparkles, Users, Send, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage, personName } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { PageBanner, BannerPill } from '@/shared/components/PageBanner'

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
  const [timesheetData, setTimesheetData] = useState<{ entries: TimesheetEntry[]; employees: { id: number; first_name: string; last_name: string; middle_name?: string | null }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [departments, setDepartments] = useState<{ id: number; name: string }[] | null>(null)
  const [departmentId, setDepartmentId] = useState<number | null>(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/timesheet/my-departments`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: number; name: string }[]) => {
        setDepartments(list)
        setDepartmentId(list[0]?.id ?? null)
      })
      .catch(() => setDepartments([]))
  }, [])

  async function loadTimesheet() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка загрузки')
      const list: Timesheet[] = await res.json()
      const found = list.find(t => t.year === year && t.month === month && (departmentId === null || t.department_id === departmentId)) ?? null

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (departments !== null) loadTimesheet() }, [year, month, departmentId, departments])

  async function handleCreate() {
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ year, month, ...(departmentId !== null ? { department_id: departmentId } : {}) }),
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
        return emp ? personName(emp.last_name, emp.first_name, emp.middle_name) : `ID ${e.employee_id}`
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
      <PageBanner
        icon={Sparkles}
        eyebrow="Табель"
        title="Табель"
        subtitle="Учёт рабочего времени работников"
        meta={timesheetData?.employees && <BannerPill icon={Users}>{timesheetData.employees.length} работников</BannerPill>}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            {departments && departments.length > 1 && (
              <select
                value={departmentId ?? ''}
                onChange={e => setDepartmentId(Number(e.target.value))}
                aria-label="Отдел"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        }
      />

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
