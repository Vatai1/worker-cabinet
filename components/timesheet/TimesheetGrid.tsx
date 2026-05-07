import { useState, useMemo, useEffect } from 'react'
import { TIMESHEET_CODES, CODE_COLORS } from '@/lib/timesheetCodes'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/Button'

export interface TimesheetEntry {
  id: number
  employee_id: number
  date: string
  code: string | null
  is_submitted: boolean
  first_name: string
  last_name: string
}

interface Employee {
  id: number
  first_name: string
  last_name: string
}

interface Props {
  timesheetId: number
  entries: TimesheetEntry[]
  employees: Employee[]
  year: number
  month: number
  readonly: boolean
  role?: string
  onSave: () => void
}

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isWeekend(year: number, month: number, day: number) {
  const dow = new Date(year, month - 1, day).getDay()
  return dow === 0 || dow === 6
}

export function TimesheetGrid({ timesheetId, entries, employees, year, month, readonly, role, onSave }: Props) {
  const totalDays = daysInMonth(year, month)

  const [changes, setChanges] = useState<Record<string, { code: string | null }>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setChanges({})
    setError(null)
  }, [timesheetId])

  const entryMap = useMemo(() => {
    const map: Record<string, TimesheetEntry> = {}
    for (const e of entries) map[`${e.employee_id}:${e.date}`] = e
    return map
  }, [entries])

  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  function isFutureDay(day: number) {
    return new Date(year, month - 1, day) > today
  }

  function isToday(day: number) {
    const d = new Date(year, month - 1, day)
    return d.getTime() === today.getTime()
  }

  function getCell(empId: number, day: number) {
    if (isWeekend(year, month, day)) return { code: 'В', submitted: true }
    const date = dateStr(year, month, day)
    const key = `${empId}:${date}`
    if (changes[key] !== undefined) return { ...changes[key], submitted: false }
    const e = entryMap[key]
    return e ? { code: e.code, submitted: e.is_submitted } : { code: null, submitted: false }
  }

  function setCell(empId: number, day: number, code: string | null) {
    if (!isToday(day)) return
    const date = dateStr(year, month, day)
    const cell = getCell(empId, day)
    if (cell.submitted) return
    const vacationCodes = ['ОТ', 'ОС', 'ДО']
    if (cell.code && vacationCodes.includes(cell.code)) return
    setChanges(prev => ({ ...prev, [`${empId}:${date}`]: { code } }))
  }

  function fillEmployeeAttendance(empId: number) {
    const todayDay = today.getDate()
    const todayMonth = today.getMonth() + 1
    const todayYear = today.getFullYear()
    
    if (todayYear !== year || todayMonth !== month) return
    
    setChanges(prev => {
      const next = { ...prev }
      const date = dateStr(year, month, todayDay)
      const cell = getCell(empId, todayDay)
      if (cell.code || cell.submitted) return prev
      next[`${empId}:${date}`] = { code: 'Я' }
      return next
    })
  }

  function fillAllAttendance() {
    const todayDay = today.getDate()
    const todayMonth = today.getMonth() + 1
    const todayYear = today.getFullYear()
    
    if (todayYear !== year || todayMonth !== month) return
    
    setChanges(prev => {
      const next = { ...prev }
      const date = dateStr(year, month, todayDay)
      for (const emp of employees) {
        const cell = getCell(emp.id, todayDay)
        if (cell.code || cell.submitted) continue
        next[`${emp.id}:${date}`] = { code: 'Я' }
      }
      return next
    })
  }

  function countCode(empId: number, code: string) {
    let n = 0
    for (let d = 1; d <= totalDays; d++) {
      if (getCell(empId, d).code === code) n++
    }
    return n
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const vacationCodes = ['ОТ', 'ОС', 'ДО']
      const body = Object.entries(changes)
        .map(([key, val]) => {
          const colonIdx = key.indexOf(':')
          const empId = key.slice(0, colonIdx)
          const date = key.slice(colonIdx + 1)
          return { employee_id: Number(empId), date, code: val.code, hours: null }
        })
        .filter(entry => {
          const cell = entryMap[`${entry.employee_id}:${entry.date}`]
          if (!cell) return true
          if (cell.code && vacationCodes.includes(cell.code)) return false
          return true
        })
      const res = await fetch(`${API_BASE_URL}/timesheet/${timesheetId}/entries`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка сохранения')
      }
      setChanges({})
      onSave()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleExport(format: 'excel' | 'pdf') {
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet/${timesheetId}/export/${format}`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Ошибка экспорта')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `timesheet-${year}-${month}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const days = Array.from({ length: totalDays }, (_, i) => i + 1)
  const hasChanges = Object.keys(changes).length > 0

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</div>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {!readonly && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground font-medium">Массовые действия:</span>
            <Button variant="outline" size="sm" onClick={fillAllAttendance}>
              Явка всем
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {!readonly && hasChanges && (
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? 'Сохранение...' : `Сохранить изменения`}
            </Button>
          )}
          {!readonly && hasChanges && (
            <Button variant="outline" size="sm" onClick={() => setChanges({})}>
              Сбросить
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>Excel</Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>PDF</Button>
        </div>
      </div>

      {hasChanges && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-lg">
          Есть несохранённые изменения — {Object.keys(changes).length} ячеек
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
        <table className="text-xs border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-muted border-b border-r border-border px-3 py-2 text-left font-semibold min-w-[180px] text-sm">
                Сотрудник
              </th>
              {days.map(d => {
                const weekend = isWeekend(year, month, d)
                const todayDay = isToday(d)
                return (
                  <th
                    key={d}
                    className={[
                      'border-b border-r border-border px-0 py-1 text-center min-w-[42px] select-none',
                      weekend ? 'bg-red-50 dark:bg-red-950/40' : 'bg-muted',
                      todayDay ? 'ring-2 ring-inset ring-primary' : '',
                    ].join(' ')}
                  >
                    <div className="font-bold text-sm leading-tight">{d}</div>
                    <div className={`text-[10px] font-normal leading-tight ${weekend ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {WEEKDAY_SHORT[new Date(year, month - 1, d).getDay()]}
                    </div>
                  </th>
                )
              })}
              <th className="border-b border-r border-border px-2 py-2 text-center bg-muted font-semibold min-w-[52px] text-xs">
                Я
              </th>
              <th className="border-b border-border px-2 py-2 text-center bg-muted font-semibold min-w-[52px] text-xs">
                ОТ
              </th>
              {!readonly && (
                <th className="sticky right-0 z-20 border-b border-l border-border px-2 py-2 text-center bg-muted font-semibold min-w-[64px] text-xs">
                  Действия
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, idx) => (
              <tr
                key={emp.id}
                className={[
                  'group transition-colors',
                  idx % 2 === 0 ? 'bg-card' : 'bg-muted/20',
                  'hover:bg-primary/5',
                ].join(' ')}
              >
                <td className="sticky left-0 z-10 border-r border-b border-border px-3 py-2 font-medium bg-inherit whitespace-nowrap">
                  {emp.last_name} {emp.first_name}
                </td>
                {days.map(day => {
                  const cell = getCell(emp.id, day)
                  const colorClass = cell.code ? (CODE_COLORS[cell.code] ?? '') : ''
                  const weekend = isWeekend(year, month, day)
                  const future = isFutureDay(day)
                  const todayDay = isToday(day)
                  const vacationCodes = ['ОТ', 'ОС', 'ДО']
                  const isVacation = cell.code && vacationCodes.includes(cell.code)
                  const cellReadonly = readonly || !todayDay || weekend || isVacation || cell.submitted
                  return (
                    <td
                      key={day}
                      className={[
                        'border-r border-b border-border p-0 text-center transition-colors relative',
                        colorClass || (weekend && !cell.code ? 'bg-red-50/60 dark:bg-red-950/20' : ''),
                        future ? 'opacity-35' : '',
                        todayDay && !colorClass ? 'ring-2 ring-inset ring-primary/40' : '',
                      ].join(' ')}
                    >
                      {cellReadonly ? (
                        <span className="block py-2 px-1 font-semibold text-center leading-none">
                          {cell.code ?? ''}
                          {!cell.submitted && cell.code && !future && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" title="Не отправлено" />
                          )}
                        </span>
                      ) : (
                        <span className="relative">
                          <select
                            value={cell.code ?? ''}
                            onChange={e => setCell(emp.id, day, e.target.value || null)}
                            className="w-full h-full bg-transparent text-center text-xs focus:outline-none cursor-pointer py-2 px-0 font-medium"
                          >
                            <option value=""></option>
                            {TIMESHEET_CODES.filter(c => role === 'hr' || role === 'admin' || !['ОТ','ОС','ДО'].includes(c.code)).map(c => (
                              <option key={c.code} value={c.code}>{c.code}</option>
                            ))}
                          </select>
                          {!cell.submitted && cell.code && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" title="Не отправлено" />
                          )}
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="border-r border-b border-border px-2 py-2 text-center font-bold text-blue-600 dark:text-blue-400">
                  {countCode(emp.id, 'Я') || ''}
                </td>
                <td className="border-b border-border px-2 py-2 text-center font-bold text-blue-400 dark:text-blue-300">
                  {countCode(emp.id, 'ОТ') || ''}
                </td>
                {!readonly && (
                  <td className="sticky right-0 z-10 border-l border-b border-border px-2 py-1.5 text-center bg-inherit">
                    <button
                      onClick={() => fillEmployeeAttendance(emp.id)}
                      className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-primary hover:text-primary-foreground transition-colors font-medium whitespace-nowrap"
                      title="Заполнить явкой"
                    >
                      Явка
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
