import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { TimesheetGrid, TIMESHEET_DAY_LABELS } from '@/shared/components/timesheet/TimesheetGrid'
import { TimesheetLegend } from '@/shared/components/timesheet/TimesheetLegend'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import { hasAnyRoleSync } from '@/shared/lib/permissions'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { apiGet, apiPost, apiPut } from '@/shared/lib/apiClient'
import type { Timesheet, TimesheetDetails } from '@/shared/components/timesheet/TimesheetGrid'

type PendingDay = Pick<Timesheet, 'department_id' | 'department_name' | 'year' | 'month'> & { timesheet_id: number; date: string }

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export function HRTimesheet() {
  const now = new Date()
  const departments = useDepartmentsStore(s => s.departments)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState('')
  const [sheet, setSheet] = useState<TimesheetDetails | null>(null)
  const [pending, setPending] = useState<PendingDay[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    useDepartmentsStore.getState().fetchDepartments()
      .then(() => setDepartmentId(previous => previous ?? useDepartmentsStore.getState().departments[0]?.id ?? null))
      .catch(err => setError(getErrorMessage(err)))
  }, [])

  useEffect(() => {
    let active = true
    apiGet<PendingDay[]>('/timesheet/days/submitted')
      .then(rows => { if (active) setPending(rows) })
      .catch(err => { if (active) setError(getErrorMessage(err)) })
    return () => { active = false }
  }, [reload])

  useEffect(() => {
    if (!departmentId) return
    let active = true
    setLoading(true)
    setSheet(null)
    const listPath = `/timesheet?departmentId=${departmentId}&year=${year}&month=${month}`
    async function load() {
      try {
        let [found] = await apiGet<Timesheet[]>(listPath)
        if (!active) return
        if (!found && hasAnyRoleSync('admin')) {
          await apiPost('/timesheet/auto-create', { year, month })
          ;[found] = await apiGet<Timesheet[]>(listPath)
        }
        const data = found ? await apiGet<TimesheetDetails>(`/timesheet/${found.id}`) : null
        if (active) setSheet(data)
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [departmentId, year, month, reload])

  const currentSheet = sheet?.department_id === departmentId && sheet.year === year && sheet.month === month ? sheet : null
  const day = currentSheet?.days.find(d => d.date === selectedDate)
    ?? currentSheet?.days.find(d => d.status === 'submitted') ?? currentSheet?.days[0]
  const years = [...new Set([now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, year])].sort()

  function selectDate(date: string) {
    setSelectedDate(date)
    setReturning(false)
    setReason('')
    setError(null)
  }

  async function review(status: 'approved' | 'returned') {
    if (!currentSheet || !day) return
    setReviewing(true)
    setError(null)
    try {
      await apiPut(`/timesheet/${currentSheet.id}/days/${day.date}/review`, { status, revision: day.revision, reason })
      selectDate(day.date)
      setReload(value => value + 1)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2" aria-labelledby="pending-timesheets">
        <h2 id="pending-timesheets" className="font-semibold">Табели на проверке</h2>
        {pending.length ? (
          <ul className="flex flex-wrap gap-2">
            {pending.map(item => (
              <li key={`${item.timesheet_id}:${item.date}`}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reviewing}
                  onClick={() => {
                    setDepartmentId(item.department_id)
                    setYear(item.year)
                    setMonth(item.month)
                    selectDate(item.date)
                  }}
                >
                  {item.department_name} · {formatDate(item.date)}
                </Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Нет табелей, ожидающих проверки</p>}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Отдел" value={departmentId ?? ''} disabled={reviewing} onChange={e => { setDepartmentId(Number(e.target.value)); selectDate('') }} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select aria-label="Месяц" value={month} disabled={reviewing} onChange={e => { setMonth(Number(e.target.value)); selectDate('') }} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
        <select aria-label="Год" value={year} disabled={reviewing} onChange={e => { setYear(Number(e.target.value)); selectDate('') }} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {day && (
          <select aria-label="Дата табеля" value={day.date} disabled={reviewing} onChange={e => selectDate(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            {currentSheet?.days.map(d => <option key={d.date} value={d.date}>{formatDate(d.date)} · {TIMESHEET_DAY_LABELS[d.status]}</option>)}
          </select>
        )}
        <Button variant="outline" size="sm" disabled={loading || reviewing} onClick={() => { setError(null); setReload(value => value + 1) }}>Обновить</Button>
      </div>

      {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
      {loading ? (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">Загрузка табеля…</p>
      ) : currentSheet ? (
        <div className="space-y-4">
          {day?.status === 'submitted' && (
            <div className="flex flex-wrap items-end gap-2">
              {returning ? (
                <form
                  className="flex w-full flex-wrap items-end gap-2"
                  onSubmit={e => { e.preventDefault(); review('returned') }}
                >
                  <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">
                    Причина возврата
                    <textarea autoFocus required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} disabled={reviewing} className="rounded-lg border border-border bg-background px-3 py-2" />
                  </label>
                  <Button type="submit" disabled={reviewing || !reason.trim()}>Вернуть табель</Button>
                  <Button type="button" variant="outline" disabled={reviewing} onClick={() => setReturning(false)}>Отмена</Button>
                </form>
              ) : (
                <>
                  <Button disabled={reviewing} onClick={() => review('approved')}>Принять табель</Button>
                  <Button variant="outline" disabled={reviewing} onClick={() => setReturning(true)}>Вернуть на доработку</Button>
                </>
              )}
            </div>
          )}
          {day?.status === 'returned' && <p className="whitespace-pre-wrap text-sm text-muted-foreground">Причина возврата. {day.reason}</p>}
          {!day && currentSheet.status !== 'draft' && <p className="text-sm text-muted-foreground">{currentSheet.status === 'approved' ? 'Месячный табель утверждён' : 'Месячный табель отправлен'}</p>}
          <TimesheetGrid key={currentSheet.id} sheet={currentSheet} selectedDate={day?.date ?? ''} />
          <TimesheetLegend />
        </div>
      ) : <p className="py-8 text-center text-sm text-muted-foreground">Табель не найден</p>}
    </div>
  )
}
