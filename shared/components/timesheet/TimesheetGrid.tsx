import { useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { Send } from 'lucide-react'
import { TIMESHEET_CODES, CODE_COLORS, VACATION_CODES } from '@/shared/lib/timesheetCodes'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { getErrorMessage, personName } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { apiPost, apiPut, fetchWithRetry } from '@/shared/lib/apiClient'

interface TimesheetEntry {
  employee_id: number
  date: string
  code: string | null
}

interface Employee {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
}

interface TransferSpan {
  employee_id: number
  start_date: string
  end_date: string
  label: string
}

export interface TimesheetDay {
  date: string
  status: 'submitted' | 'approved' | 'returned'
  revision: number
  employee_ids: number[]
  reason: string | null
}

export interface Timesheet {
  id: number
  department_id: number
  department_name: string
  year: number
  month: number
  status: 'draft' | 'submitted' | 'approved'
}

export interface TimesheetDetails extends Timesheet {
  today: string
  entries: TimesheetEntry[]
  employees: Employee[]
  currentEmployeeIds: number[]
  days: TimesheetDay[]
  nonWorkingDays: string[]
  transfers: TransferSpan[]
}

interface Props {
  sheet: TimesheetDetails
  selectedDate: string
  editable?: boolean
  onSaved?: () => void
}

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const ATTENDANCE_CODES = TIMESHEET_CODES.filter(c => !VACATION_CODES.includes(c.code))
export const TIMESHEET_DAY_LABELS = {
  submitted: 'На проверке у HR',
  approved: 'Принят',
  returned: 'На доработке',
}

export function TimesheetGrid({ sheet, selectedDate, editable = false, onSaved }: Props) {
  const { id, entries, employees, year, month, today, nonWorkingDays, days, transfers } = sheet
  const [changes, setChanges] = useState<Record<number, string | null>>({})
  const [working, setWorking] = useState<'saving' | 'submitting' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const entryMap = useMemo(() => new Map(entries.map(e => [`${e.employee_id}:${e.date}`, e.code])), [entries])
  const dayMap = useMemo(() => new Map(days.map(d => [d.date, d])), [days])
  const transfersByEmployee = useMemo(() => {
    const grouped = new Map<number, TransferSpan[]>()
    for (const span of transfers) {
      const row = grouped.get(span.employee_id) ?? []
      row.push(span)
      grouped.set(span.employee_id, row)
    }
    return grouped
  }, [transfers])
  const savedRoster = dayMap.get(selectedDate)?.employee_ids
  const editableIds = new Set(savedRoster?.length ? savedRoster : sheet.currentEmployeeIds)
  const workingDay = !nonWorkingDays.includes(selectedDate)
  const dates = Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
  const hasChanges = Object.keys(changes).length > 0

  function codeAt(employeeId: number, date: string) {
    return date === selectedDate && Object.prototype.hasOwnProperty.call(changes, employeeId)
      ? changes[employeeId]
      : entryMap.get(`${employeeId}:${date}`) ?? null
  }

  function canEdit(employeeId: number, date: string) {
    return editable && workingDay && date === selectedDate && editableIds.has(employeeId)
      && !VACATION_CODES.includes(entryMap.get(`${employeeId}:${date}`) ?? '')
      && !transfersByEmployee.get(employeeId)?.some(span => date >= span.start_date && date <= span.end_date)
  }

  function fillAttendance(ids: number[]) {
    setChanges(previous => {
      const next = { ...previous }
      for (const employeeId of ids) {
        if (canEdit(employeeId, selectedDate) && !codeAt(employeeId, selectedDate)) next[employeeId] = 'Я'
      }
      return next
    })
  }

  async function save(submit: boolean) {
    setWorking(submit ? 'submitting' : 'saving')
    setError(null)
    const marks = Object.entries(changes).map(([employeeId, code]) => ({
      employee_id: Number(employeeId),
      date: selectedDate,
      code,
    }))
    try {
      if (submit) await apiPost(`/timesheet/${id}/days/${selectedDate}/submit`, { entries: marks })
      else await apiPut(`/timesheet/${id}/entries`, marks)
      setChanges({})
      onSaved?.()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWorking(null)
    }
  }

  async function handleExport(format: 'excel' | 'pdf') {
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/timesheet/${id}/export/${format}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка экспорта')
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `timesheet-${year}-${month}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-3">
      {error && <div role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {editable && workingDay && (
          <Button variant="outline" size="sm" disabled={!!working} onClick={() => fillAttendance(sheet.employees.map(e => e.id))}>
            Явка всем
          </Button>
        )}
        {editable && hasChanges && (
          <>
            <Button variant="outline" size="sm" disabled={!!working} onClick={() => save(false)}>
              {working === 'saving' ? 'Сохранение…' : 'Сохранить изменения'}
            </Button>
            <Button variant="ghost" size="sm" disabled={!!working} onClick={() => setChanges({})}>Сбросить</Button>
          </>
        )}
        {editable && (
          <Button size="sm" disabled={!!working || editableIds.size === 0} onClick={() => save(true)}>
            <Send className="h-4 w-4" />
            {working === 'submitting' ? 'Отправка…' : 'Отправить на проверку'}
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>Excel</Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>PDF</Button>
        </div>
      </div>
      {hasChanges && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-foreground">
          Есть несохранённые изменения. При отправке они будут включены в табель.
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 min-w-[180px] border-b border-r bg-muted px-3 py-2 text-left text-sm">Работник</th>
              {dates.map(date => {
                const day = dayMap.get(date)
                const status = day ? TIMESHEET_DAY_LABELS[day.status] : undefined
                return (
                  <th
                    key={date}
                    scope="col"
                    title={status}
                    className={`min-w-[42px] border-b border-r px-1 py-1 text-center ${nonWorkingDays.includes(date) ? 'bg-red-500/10' : 'bg-muted'} ${date === selectedDate ? 'ring-2 ring-inset ring-primary' : ''}`}
                  >
                    <div className="text-sm">{Number(date.slice(-2))}</div>
                    <div className="font-normal text-muted-foreground">{WEEKDAY_SHORT[new Date(date).getUTCDay()]}</div>
                    {status && <div aria-label={status} className="text-primary">{day?.status === 'returned' ? '↶' : day?.status === 'approved' ? '✓' : '•'}</div>}
                  </th>
                )
              })}
              <th scope="col" className="border-b border-r bg-muted px-2">Я</th>
              <th scope="col" className="border-b bg-muted px-2">ОТ</th>
              {editable && workingDay && <th scope="col" className="sticky right-0 border-b border-l bg-muted px-2">Действия</th>}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee, index) => {
              const name = personName(employee.last_name, employee.first_name, employee.middle_name)
              const codes = dates.map(date => codeAt(employee.id, date))
              const transferSpans = transfersByEmployee.get(employee.id) ?? []
              return (
                <tr key={employee.id} className={index % 2 ? 'bg-muted/20' : 'bg-card'}>
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-2 text-left font-medium">{name}</th>
                  {dates.map((date, i) => {
                    const span = transferSpans.find(item => date >= item.start_date && date <= item.end_date)
                    if (span) {
                      return date === span.start_date && (
                        <td
                          key={date}
                          colSpan={dates.indexOf(span.end_date) - i + 1}
                          className="border-b border-r bg-muted/50 px-2 py-2 text-center text-muted-foreground"
                        >
                          <span className="block max-w-64 whitespace-normal break-words mx-auto">{span.label}</span>
                        </td>
                      )
                    }
                    const code = codes[i]
                    const color = code ? CODE_COLORS[code] : ''
                    return (
                      <td key={date} className={`border-b border-r text-center ${color ?? ''} ${date > today ? 'opacity-60' : ''}`}>
                        {canEdit(employee.id, date) ? (
                          <select
                            aria-label={`Отметка за ${date} — ${name}`}
                            value={code ?? ''}
                            disabled={!!working}
                            onChange={e => setChanges(previous => ({ ...previous, [employee.id]: e.target.value || null }))}
                            className="w-full cursor-pointer bg-transparent py-2 text-center font-medium"
                          >
                            <option value="">—</option>
                            {ATTENDANCE_CODES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                          </select>
                        ) : <span className="block py-2 font-semibold">{code ?? ''}</span>}
                      </td>
                    )
                  })}
                  {['Я', 'ОТ'].map(code => (
                    <td key={code} className="border-b border-r px-2 text-center font-bold">{codes.filter(mark => mark === code).length || ''}</td>
                  ))}
                  {editable && workingDay && (
                    <td className="sticky right-0 border-b border-l bg-card px-2 text-center">
                      {canEdit(employee.id, selectedDate) && !codeAt(employee.id, selectedDate) && (
                        <Button variant="ghost" size="sm" disabled={!!working} onClick={() => fillAttendance([employee.id])}>Явка</Button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
