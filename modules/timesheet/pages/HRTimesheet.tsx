import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { TimesheetEmployees } from '@/modules/timesheet/components/TimesheetEmployees'
import { TimesheetReport } from '@/modules/timesheet/components/TimesheetReport'
import { TimesheetAuditLog } from '@/shared/components/timesheet/TimesheetAuditLog'
import { TimesheetGrid, TIMESHEET_DAY_LABELS } from '@/shared/components/timesheet/TimesheetGrid'
import { TimesheetTools } from '@/shared/components/timesheet/TimesheetTools'
import { TimesheetLegend } from '@/shared/components/timesheet/TimesheetLegend'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { ApiError, apiGet, apiPost, apiPut } from '@/shared/lib/apiClient'
import type { Timesheet, TimesheetDetails } from '@/shared/components/timesheet/TimesheetGrid'

type PendingDay = Pick<Timesheet, 'department_id' | 'department_name' | 'year' | 'month' | 'version' | 'number'> & { timesheet_id: number; date: string }

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTH_OPTIONS = MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label }))

const TABS = [
  { id: 'review', label: 'Табель' },
  { id: 'report', label: 'Отчёт' },
  { id: 'employees', label: 'Сотрудники' },
  { id: 'audit', label: 'Журнал' },
] as const

export function HRTimesheet() {
  const [tab, setTab] = useState<typeof TABS[number]['id']>('review')
  const [settingsRevision, setSettingsRevision] = useState(0)
  const [journal, setJournal] = useState(false)

  function selectTab(value: typeof TABS[number]['id']) {
    setTab(value)
    if (value === 'review' || value === 'audit') setJournal(value === 'audit')
  }

  return (
    <div className="space-y-4" data-timesheet-page>
      <div
        role="tablist"
        aria-label="Разделы табеля"
        className="inline-flex flex-wrap gap-1.5 rounded-2xl bg-muted/50 p-1.5"
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const index = TABS.findIndex(item => item.id === tab)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
          selectTab(TABS[next].id)
          event.currentTarget.querySelectorAll('button')[next]?.focus()
        }}
      >
        {TABS.map(item => <Button key={item.id} id={`timesheet-${item.id}-tab`} type="button" role="tab" size="lg" className="text-base" variant={tab === item.id ? 'secondary' : 'ghost'} aria-selected={tab === item.id} aria-controls={`timesheet-${item.id === 'review' || item.id === 'audit' ? 'sheet' : item.id}-panel`} tabIndex={tab === item.id ? 0 : -1} onClick={() => selectTab(item.id)}>{item.label}</Button>)}
      </div>
      <div id="timesheet-sheet-panel" role="tabpanel" aria-labelledby={journal ? 'timesheet-audit-tab' : 'timesheet-review-tab'} hidden={tab !== 'review' && tab !== 'audit'}>
        <TimesheetReview settingsRevision={settingsRevision} journal={journal} />
      </div>
      <div id="timesheet-report-panel" role="tabpanel" aria-labelledby="timesheet-report-tab" hidden={tab !== 'report'}>
        {tab === 'report' && <TimesheetReport />}
      </div>
      <div id="timesheet-employees-panel" role="tabpanel" aria-labelledby="timesheet-employees-tab" hidden={tab !== 'employees'}>
        <TimesheetEmployees onSaved={() => setSettingsRevision(value => value + 1)} />
      </div>
    </div>
  )
}

function TimesheetReview({ settingsRevision, journal }: { settingsRevision: number; journal: boolean }) {
  const now = new Date()
  const departments = useDepartmentsStore(s => s.departments)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState('')
  const [sheet, setSheet] = useState<TimesheetDetails | null>(null)
  const [versions, setVersions] = useState<Timesheet[]>([])
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
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
        let list = await apiGet<Timesheet[]>(listPath)
        if (!active) return
        let found = list.find(item => item.id === selectedVersion) ?? list[0]
        if (!active) return
        if (!found && !journal) {
          try {
            found = await apiPost<Timesheet>('/timesheet', { department_id: departmentId, year, month })
          } catch (err) {
            if (!(err instanceof ApiError) || err.status !== 409) throw err
            list = await apiGet<Timesheet[]>(listPath)
            found = list[0]
          }
        }
        if (found && !list.some(item => item.id === found.id)) list = [found, ...list]
        setVersions(list)
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
  }, [departmentId, year, month, reload, selectedVersion, settingsRevision, journal])

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
      {!journal && <section className="space-y-2" aria-labelledby="pending-timesheets">
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
                    setSelectedVersion(item.timesheet_id)
                    selectDate(item.date)
                  }}
                >
                  {item.department_name} · {formatDate(item.date)} · версия {item.version}{item.number ? ` № ${item.number}` : ''}
                </Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Нет табелей, ожидающих проверки</p>}
      </section>}

      <div className="flex flex-wrap items-center gap-2">
        <SelectDropdown
          aria-label="Отдел"
          floating
          placeholder="Выберите отдел"
          options={departments.map(department => ({ value: String(department.id), label: department.name }))}
          value={String(departmentId ?? '')}
          disabled={reviewing}
          className="max-w-64"
          onChange={value => { setDepartmentId(Number(value)); selectDate('') }}
        />
        <SelectDropdown
          aria-label="Месяц"
          floating
          options={MONTH_OPTIONS}
          value={String(month)}
          disabled={reviewing}
          onChange={value => { setMonth(Number(value)); selectDate('') }}
        />
        <SelectDropdown
          aria-label="Год"
          floating
          options={years.map(item => ({ value: String(item), label: String(item) }))}
          value={String(year)}
          className="min-w-24"
          disabled={reviewing}
          onChange={value => { setYear(Number(value)); selectDate('') }}
        />
        {!journal && currentSheet && day && (
          <SelectDropdown
            aria-label="Дата табеля"
            floating
            options={currentSheet.days.map(item => ({ value: item.date, label: `${formatDate(item.date)} · ${TIMESHEET_DAY_LABELS[item.status]}` }))}
            value={day.date}
            disabled={reviewing}
            onChange={selectDate}
          />
        )}
        <Button variant="outline" size="sm" disabled={loading || reviewing} onClick={() => { setError(null); setReload(value => value + 1) }}>Обновить</Button>
      </div>

      <TimesheetTools sheet={currentSheet} versions={versions} departmentId={departmentId} manage journal={journal} onSelect={setSelectedVersion} onChanged={(id, importedYear, importedMonth, importedDepartment) => {
        if (id) setSelectedVersion(id)
        if (importedYear) setYear(importedYear)
        if (importedMonth) setMonth(importedMonth)
        if (importedDepartment) {
          setDepartmentId(importedDepartment)
          selectDate('')
        }
        setReload(value => value + 1)
      }} />
      {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
      {loading ? (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">Загрузка табеля…</p>
      ) : currentSheet ? journal ? (
        <TimesheetAuditLog key={currentSheet.id} sheetId={currentSheet.id} refreshKey={reload} />
      ) : (
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
          <TimesheetGrid key={`${currentSheet.id}:${reload}`} sheet={currentSheet} selectedDate={day?.date ?? ''} />
          <TimesheetLegend />
        </div>
      ) : <p className="py-8 text-center text-sm text-muted-foreground">{journal ? 'За выбранный период нет табелей' : 'Табель не найден'}</p>}
    </div>
  )
}
