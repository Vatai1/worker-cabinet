import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/shared/components/ui/Button'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { MINUTE_CODES } from '@/shared/lib/timesheetCodes'
import { apiGet } from '@/shared/lib/apiClient'

interface Worker {
  id: number
  name: string
  department: string | null
  code: string | null
  marks?: { staff_number: string | null; code: string | null }[]
}

const CATEGORIES = [
  { id: 'absent', label: 'Неявка', color: 'border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300' },
  { id: 'missing', label: 'Нет данных', color: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300' },
  { id: 'present', label: 'Явка', color: 'border-green-500/25 bg-green-500/10 text-green-800 dark:text-green-300' },
  { id: 'all', label: 'Всего', color: 'border-blue-500/25 bg-blue-500/10 text-blue-800 dark:text-blue-300' },
] as const
const NUMBER_FORMAT = new Intl.NumberFormat('ru-RU')
const PERSON_PLURALS = new Intl.PluralRules('ru-RU')

export function TimesheetReport() {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [rows, setRows] = useState<Worker[] | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<typeof CATEGORIES[number]['id'] | null>(null)

  useEffect(() => {
    if (!date) return
    let active = true
    apiGet<Worker[]>(`/timesheet/report?date=${encodeURIComponent(date)}`)
      .then(data => { if (active) setRows(data) })
      .catch(err => { if (active) setError(getErrorMessage(err)) })
    return () => { active = false }
  }, [date])

  const workers = rows ?? []
  const groups = { absent: [], missing: [], present: [], all: workers } as Record<typeof CATEGORIES[number]['id'], Worker[]>
  for (const worker of workers) {
    const codes = worker.marks?.map(mark => mark.code).filter((code): code is string => code !== null)
      ?? (worker.code ? [worker.code] : [])
    groups[codes.some(code => MINUTE_CODES.includes(code)) ? 'present' : codes.length ? 'absent' : 'missing'].push(worker)
  }

  return (
    <section className="space-y-4" aria-label="Отчёт по табелю">
      <label className="flex w-fit flex-col gap-1 text-sm font-medium">
        Дата отчёта
        <input
          type="date"
          value={date}
          min="2000-01-01"
          max="2100-12-31"
          onChange={event => {
            setDate(event.target.value)
            setRows(null)
            setError('')
          }}
          className="rounded-lg border border-border bg-card px-3 py-2"
        />
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
        : !date ? <p className="text-sm text-muted-foreground">Выберите дату отчёта.</p>
        : rows === null ? <p role="status" className="text-sm text-muted-foreground">Загрузка отчёта…</p>
        : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {CATEGORIES.map(({ id, label, color }) => {
                const count = groups[id].length
                return (
                  <div key={id} className={cn('space-y-2 rounded-xl border p-4', color)}>
                    <h3 className="text-sm font-medium">{label}</h3>
                    <p className="text-lg font-semibold tabular-nums">{NUMBER_FORMAT.format(count)} {PERSON_PLURALS.select(count) === 'few' ? 'человека' : 'человек'}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-foreground"
                      aria-label={`${expanded === id ? 'Скрыть' : 'Показать'} список · ${label}`}
                      aria-expanded={expanded === id}
                      onClick={() => setExpanded(expanded === id ? null : id)}
                    >
                      {expanded === id ? 'Скрыть список' : 'Показать список'}
                    </Button>
                  </div>
                )
              })}
            </div>
            {expanded && (
              <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="timesheet-report-list">
                <h3 id="timesheet-report-list" className="border-b border-border px-4 py-3 font-semibold">{CATEGORIES.find(category => category.id === expanded)?.label}</h3>
                {groups[expanded].length > 0 ? (
                  <ul aria-labelledby="timesheet-report-list" tabIndex={0} className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
                    {groups[expanded].map(worker => (
                      <li key={worker.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                        <div>
                          <span>{worker.name}</span>
                          {worker.marks?.some(mark => mark.staff_number) && <p className="mt-1 text-xs text-muted-foreground">
                            {worker.marks.map(mark => `${mark.staff_number ?? 'Без номера'} · ${mark.code ?? '—'}`).join(', ')}
                          </p>}
                        </div>
                        {worker.department && <span className="text-muted-foreground">{worker.department}</span>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="px-4 py-3 text-sm text-muted-foreground">Список пуст.</p>}
              </section>
            )}
          </>
        )}
    </section>
  )
}
