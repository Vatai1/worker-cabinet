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
  hours: number | null
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
  onSave: () => void
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function TimesheetGrid({ timesheetId, entries, employees, year, month, readonly, onSave }: Props) {
  const totalDays = daysInMonth(year, month)

  const [changes, setChanges] = useState<Record<string, { code: string | null; hours: number | null }>>({})
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

  function getCell(empId: number, day: number) {
    const date = dateStr(year, month, day)
    const key = `${empId}:${date}`
    if (changes[key] !== undefined) return changes[key]
    const e = entryMap[key]
    return e ? { code: e.code, hours: e.hours } : { code: null, hours: null }
  }

  function setCell(empId: number, day: number, code: string | null, hours: number | null) {
    const date = dateStr(year, month, day)
    setChanges(prev => ({ ...prev, [`${empId}:${date}`]: { code, hours } }))
  }

  function totalHours(empId: number) {
    let total = 0
    for (let d = 1; d <= totalDays; d++) {
      const h = getCell(empId, d).hours
      if (h != null) total += h
    }
    return total
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const body = Object.entries(changes).map(([key, val]) => {
        const colonIdx = key.indexOf(':')
        const empId = key.slice(0, colonIdx)
        const date = key.slice(colonIdx + 1)
        return { employee_id: Number(empId), date, code: val.code, hours: val.hours }
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
    <div className="space-y-4">
      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="flex items-center gap-2 justify-end flex-wrap">
        {!readonly && hasChanges && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        )}
        <Button variant="outline" onClick={() => handleExport('excel')}>Экспорт Excel</Button>
        <Button variant="outline" onClick={() => handleExport('pdf')}>Экспорт PDF</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 bg-muted/80 border border-border px-2 py-1 text-left min-w-[140px] z-10">
                Сотрудник
              </th>
              {days.map(d => (
                <th key={d} className="border border-border px-1 py-1 text-center min-w-[36px]">
                  {d}
                </th>
              ))}
              <th className="border border-border px-2 py-1 text-center min-w-[48px]">Итого ч.</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-muted/20">
                <td className="sticky left-0 bg-card border border-border px-2 py-1 font-medium z-10">
                  {emp.last_name} {emp.first_name}
                </td>
                {days.map(day => {
                  const cell = getCell(emp.id, day)
                  const colorClass = cell.code ? (CODE_COLORS[cell.code] ?? '') : ''
                  return (
                    <td key={day} className={`border border-border p-0 ${colorClass}`}>
                      <div className="flex flex-col items-center">
                        {readonly ? (
                          <>
                            <span className="py-0.5 text-center w-full font-medium">{cell.code ?? ''}</span>
                            <span className="py-0.5 text-center w-full text-muted-foreground">{cell.hours ?? ''}</span>
                          </>
                        ) : (
                          <>
                            <select
                              value={cell.code ?? ''}
                              onChange={e => setCell(emp.id, day, e.target.value || null, cell.hours)}
                              className="w-full bg-transparent text-center text-xs border-b border-border/40 focus:outline-none cursor-pointer py-0.5"
                            >
                              <option value=""></option>
                              {TIMESHEET_CODES.map(c => (
                                <option key={c.code} value={c.code}>{c.code}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              value={cell.hours ?? ''}
                              onChange={e => setCell(emp.id, day, cell.code, e.target.value === '' ? null : Number(e.target.value))}
                              className="w-full bg-transparent text-center text-xs focus:outline-none py-0.5"
                            />
                          </>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td className="border border-border px-2 py-1 text-center font-semibold">
                  {totalHours(emp.id)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
