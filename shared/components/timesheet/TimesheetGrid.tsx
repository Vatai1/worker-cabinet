import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { Send } from 'lucide-react'
import { ATTENDANCE_CODES, CODE_COLORS, MINUTE_CODES } from '@/shared/lib/timesheetCodes'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { getErrorMessage, personName } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { apiPost, apiPut, fetchWithRetry } from '@/shared/lib/apiClient'

interface TimesheetEntry {
  employee_id: number
  staff_number?: string | null
  date: string
  code: string | null
  minutes?: number | null
  is_automatic?: boolean
}

interface Employee {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  staff_number?: string | null
  hourly?: boolean
}

interface TransferSpan {
  employee_id: number
  staff_number?: string | null
  start_date: string
  end_date: string
  label: string
}

interface StaffRow {
  employee_id: number
  staff_number: string | null
}

export interface TimesheetDay {
  date: string
  status: 'submitted' | 'approved' | 'returned'
  revision: number
  employee_ids: number[]
  staff_rows?: StaffRow[]
  reason: string | null
}

export interface Timesheet {
  id: number
  department_id: number
  department_name: string
  year: number
  month: number
  status: 'draft' | 'submitted' | 'approved'
  version: number
  number: string | null
  document_date: string
  kind: 'original' | 'correction'
  period: 'half' | 'month'
}

export interface TimesheetDetails extends Timesheet {
  today: string
  entries: TimesheetEntry[]
  employees: Employee[]
  currentEmployeeIds: number[]
  current_staff_rows?: StaffRow[]
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
const formatTime = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
const rowKey = (employeeId: number, staffNumber?: string | null) => `${employeeId}:${staffNumber ?? ''}`
export const TIMESHEET_DAY_LABELS = {
  submitted: 'На проверке у HR',
  approved: 'Принят',
  returned: 'На доработке',
}

export function TimesheetGrid({ sheet, selectedDate, editable = false, onSaved }: Props) {
  const { id, entries, employees, year, month, today, nonWorkingDays, days, transfers } = sheet
  const [changes, setChanges] = useState<Record<string, { code: string | null; minutes: number | null }>>({})
  const [working, setWorking] = useState<'saving' | 'submitting' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focusHoursFor, setFocusHoursFor] = useState<string | null>(null)
  const hoursInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusHoursFor === null) return
    hoursInput.current?.focus()
    setFocusHoursFor(null)
  }, [focusHoursFor])
  const entryMap = useMemo(() => new Map(entries.map(e => [`${e.date}:${rowKey(e.employee_id, e.staff_number)}`, e])), [entries])
  const dayMap = useMemo(() => new Map(days.map(d => [d.date, d])), [days])
  const transfersByRow = useMemo(() => {
    const grouped = new Map<string, TransferSpan[]>()
    for (const span of transfers) {
      const key = rowKey(span.employee_id, span.staff_number)
      const row = grouped.get(key) ?? []
      row.push(span)
      grouped.set(key, row)
    }
    return grouped
  }, [transfers])
  const day = dayMap.get(selectedDate)
  const activeRows = day?.staff_rows?.length ? day.staff_rows : !day?.employee_ids.length ? sheet.current_staff_rows : undefined
  const activeIds = new Set(day?.employee_ids.length ? day.employee_ids : sheet.currentEmployeeIds)
  const editableRows = new Set(activeRows
    ? activeRows.map(row => rowKey(row.employee_id, row.staff_number))
    : employees.filter(employee => activeIds.has(employee.id)).map(employee => rowKey(employee.id, employee.staff_number)))
  const rowCounts = new Map<number, number>()
  for (const employee of employees) rowCounts.set(employee.id, (rowCounts.get(employee.id) ?? 0) + 1)
  const workingDay = !nonWorkingDays.includes(selectedDate)
  const allowedCodes = workingDay ? ATTENDANCE_CODES : ATTENDANCE_CODES.filter(item => item.code === 'РП')
  const markOptions = [
    { value: '', label: workingDay ? 'Без отметки' : 'В — Выходной', shortLabel: workingDay ? '—' : 'В' },
    ...allowedCodes.map(item => ({ value: item.code, label: `${item.code} — ${item.label}`, shortLabel: item.code })),
  ]
  const hourlyMarkOptions = markOptions.map(option => option.value === 'Я'
    ? { ...option, label: 'Указать часы работы', shortLabel: 'Часы' }
    : option)
  const attendanceRows = employees.filter(employee => !employee.hourly).map(employee => rowKey(employee.id, employee.staff_number))
  const hasHourlyEmployees = attendanceRows.length < employees.length
  const editableColumnWidth = hasHourlyEmployees ? 'w-16' : 'w-12'
  const dates = Array.from({ length: sheet.period === 'half' ? 15 : new Date(year, month, 0).getDate() }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
  const hasChanges = Object.keys(changes).length > 0

  function codeAt(key: string, date: string) {
    return date === selectedDate && Object.prototype.hasOwnProperty.call(changes, key)
      ? changes[key].code
      : entryMap.get(`${date}:${key}`)?.code ?? null
  }

  function canEdit(key: string, date: string) {
    const entry = entryMap.get(`${date}:${key}`)
    return editable && date === selectedDate && editableRows.has(key)
      && (!entry?.is_automatic || (!workingDay && entry.code === 'В'))
      && !transfersByRow.get(key)?.some(span => date >= span.start_date && date <= span.end_date)
  }

  function fillAttendance(keys: string[]) {
    setChanges(previous => {
      const next = { ...previous }
      for (const key of keys) {
        if (canEdit(key, selectedDate) && !codeAt(key, selectedDate)) next[key] = { code: 'Я', minutes: null }
      }
      return next
    })
  }

  function minutesAt(key: string, date: string) {
    return date === selectedDate && changes[key] ? changes[key].minutes : entryMap.get(`${date}:${key}`)?.minutes ?? null
  }

  function changeCode(key: string, code: string | null) {
    setChanges(previous => ({ ...previous, [key]: { code, minutes: code && MINUTE_CODES.includes(code) ? minutesAt(key, selectedDate) : null } }))
  }

  function editHours(key: string) {
    changeCode(key, 'Я')
    setFocusHoursFor(key)
  }

  function changeTime(key: string, hours: number, minutes: number) {
    const code = codeAt(key, selectedDate)
    setChanges(previous => ({ ...previous, [key]: { code, minutes: hours * 60 + minutes } }))
  }

  async function save(submit: boolean) {
    setWorking(submit ? 'submitting' : 'saving')
    setError(null)
    const marks = employees.flatMap(employee => {
      const mark = changes[rowKey(employee.id, employee.staff_number)]
      return mark ? [{ employee_id: employee.id, staff_number: employee.staff_number ?? null, date: selectedDate, ...mark }] : []
    })
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
        {editable && workingDay && attendanceRows.length > 0 && (
          <Button variant="outline" size="sm" disabled={!!working} onClick={() => fillAttendance(attendanceRows)}>
            {hasHourlyEmployees ? 'Явка всем с обычным учётом' : 'Явка всем'}
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
          <Button size="sm" disabled={!!working || editableRows.size === 0} onClick={() => save(true)}>
            <Send className="h-4 w-4" />
            {working === 'submitting' ? 'Отправка…' : 'Отправить на проверку'}
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" disabled={!!working} onClick={() => handleExport('excel')}>Excel</Button>
          <Button variant="outline" size="sm" disabled={!!working} onClick={() => handleExport('pdf')}>PDF</Button>
        </div>
      </div>
      {hasChanges && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-foreground">
          Есть несохранённые изменения. При отправке они будут включены в табель.
        </div>
      )}
      <div role="region" aria-label="Табель за месяц" tabIndex={0} className="overflow-x-auto overscroll-x-contain rounded-xl border border-border shadow-sm focus-visible:ring-2 focus-visible:ring-primary">
        <table className="w-full min-w-[54rem] table-fixed border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 w-36 border-b border-r bg-muted px-3 py-2 text-left text-sm xl:w-40 2xl:w-56">Работник</th>
              {dates.map(date => {
                const day = dayMap.get(date)
                const status = day ? TIMESHEET_DAY_LABELS[day.status] : undefined
                return (
                  <th
                    key={date}
                    scope="col"
                    title={status}
                    className={`border-b border-r py-1 text-center ${nonWorkingDays.includes(date) ? 'bg-red-500/10' : 'bg-muted'} ${date === selectedDate ? 'ring-2 ring-inset ring-primary' : ''} ${editable && date === selectedDate ? editableColumnWidth : ''}`}
                  >
                    <div className="text-sm">{Number(date.slice(-2))}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">{WEEKDAY_SHORT[new Date(date).getUTCDay()]}</div>
                    {status && <div aria-label={status} className="text-primary">{day?.status === 'returned' ? '↶' : day?.status === 'approved' ? '✓' : '•'}</div>}
                  </th>
                )
              })}
              <th scope="col" className="w-8 border-b border-r bg-muted">Я</th>
              <th scope="col" className="w-8 border-b bg-muted">О</th>
              <th scope="col" className="w-16 border-b border-r bg-muted">Часы</th>
              {editable && workingDay && <th scope="col" className="sticky right-0 w-[4.5rem] border-b border-l bg-muted">Действия</th>}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee, index) => {
              const fullName = personName(employee.last_name, employee.first_name, employee.middle_name)
              const name = (rowCounts.get(employee.id) ?? 0) > 1 && employee.staff_number ? `${fullName} · ${employee.staff_number}` : fullName
              const key = rowKey(employee.id, employee.staff_number)
              const codes = dates.map(date => codeAt(key, date))
              const transferSpans = transfersByRow.get(key) ?? []
              return (
                <tr key={key} className={index % 2 ? 'bg-muted/20' : 'bg-card'}>
                  <th scope="row" className="sticky left-0 z-10 break-words border-b border-r bg-card px-3 py-2 text-left font-medium">
                    {fullName}{employee.staff_number && <span className="block text-[10px] text-muted-foreground">{employee.staff_number}</span>}
                  </th>
                  {dates.map((date, i) => {
                    const span = transferSpans.find(item => date >= item.start_date && date <= item.end_date)
                    if (span) {
                      return date === span.start_date && (
                        <td
                          key={date}
                          colSpan={dates.indexOf(span.end_date) - i + 1}
                          className="border-b border-r bg-muted/50 px-1 py-2 text-center text-muted-foreground"
                        >
                          <span className="block max-w-64 whitespace-normal break-words mx-auto">{span.label}</span>
                        </td>
                      )
                    }
                    const code = codes[i]
                    const minutes = minutesAt(key, date)
                    const color = code ? CODE_COLORS[code] : ''
                    const hourlyAttendance = employee.hourly && code === 'Я'
                    return (
                      <td key={date} className={`border-b border-r text-center ${color ?? ''} ${date > today ? 'opacity-60' : ''}`}>
                        {canEdit(key, date) ? (
                          <>
                          <SelectDropdown
                            aria-label={`Отметка за ${date} — ${name}`}
                            options={employee.hourly ? hourlyMarkOptions : markOptions}
                            placeholder={code ?? '—'}
                            value={code === 'В' && !workingDay ? '' : code ?? ''}
                            disabled={!!working}
                            onChange={value => {
                              if (value === 'Я' && employee.hourly) editHours(key)
                              else changeCode(key, value || null)
                            }}
                            className="mx-auto h-7 w-[calc(100%-0.25rem)] min-w-0 justify-center gap-0.5 rounded-md border-border/70 bg-card/70 px-0.5 py-0 text-xs font-semibold text-current [&_svg]:size-2.5"
                          />
                          {code && MINUTE_CODES.includes(code) && (employee.hourly || code !== 'Я') && <div className="flex flex-col gap-1 pb-1">
                            <input ref={focusHoursFor === key ? hoursInput : undefined} type="number" min={0} max={24} aria-label={`Часы за ${date} — ${name}`} placeholder="ч" value={minutes == null ? '' : Math.floor(minutes / 60)} disabled={!!working} onChange={e => changeTime(key, Number(e.target.value), (minutes ?? 0) % 60)} className="w-full bg-background text-center" />
                            <input type="number" min={0} max={59} aria-label={`Минуты за ${date} — ${name}`} placeholder="м" value={minutes == null ? '' : minutes % 60} disabled={!!working} onChange={e => changeTime(key, Math.floor((minutes ?? 0) / 60), Number(e.target.value))} className="w-full bg-background text-center" />
                          </div>}
                          </>
                        ) : <span className="block py-2 font-semibold">
                          {hourlyAttendance && minutes != null ? formatTime(minutes) : code ?? ''}
                          {!hourlyAttendance && minutes != null && <span className="block text-[9px] font-normal">{formatTime(minutes)}</span>}
                        </span>}
                      </td>
                    )
                  })}
                  {['Я', 'О'].map(code => (
                    <td key={code} className="border-b border-r text-center font-bold">{codes.filter(mark => mark === code).length || ''}</td>
                  ))}
                  <td className="border-b border-r text-center font-bold">{(() => { const total = dates.reduce((sum, date) => sum + (minutesAt(key, date) ?? 0), 0); return total ? formatTime(total) : '—' })()}</td>
                  {editable && workingDay && (
                    <td className="sticky right-0 border-b border-l bg-card text-center">
                      {canEdit(key, selectedDate) && !codeAt(key, selectedDate) && (
                        employee.hourly
                          ? <Button variant="ghost" size="sm" aria-label={`Указать часы — ${name}`} disabled={!!working} onClick={() => editHours(key)}>Часы</Button>
                          : <Button variant="ghost" size="sm" disabled={!!working} onClick={() => fillAttendance([key])}>Явка</Button>
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
