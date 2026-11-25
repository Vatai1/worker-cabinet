import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { TimesheetGrid, TIMESHEET_DAY_LABELS } from '@/shared/components/timesheet/TimesheetGrid'
import { TimesheetTools } from '@/shared/components/timesheet/TimesheetTools'
import { TimesheetLegend } from '@/shared/components/timesheet/TimesheetLegend'
import { PageBanner, BannerPill } from '@/shared/components/PageBanner'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { Sparkles, Users } from 'lucide-react'
import { getErrorMessage, formatDate } from '@/shared/lib/utils'
import { ApiError, apiGet, apiPost } from '@/shared/lib/apiClient'
import type { Timesheet, TimesheetDetails } from '@/shared/components/timesheet/TimesheetGrid'

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTH_OPTIONS = MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label }))

export function ManagerTimesheet() {
  const [params] = useSearchParams()
  const { key: navigationKey } = useLocation()
  const linkedDate = params.get('date') ?? ''
  const linkedVersion = Number(params.get('timesheetId'))
  const linkedDepartment = Number(params.get('departmentId'))
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [sheet, setSheet] = useState<TimesheetDetails | null>(null)
  const [versions, setVersions] = useState<Timesheet[]>([])
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    apiGet<{ id: number; name: string }[]>('/timesheet/my-departments')
      .then(list => {
        if (!active) return
        setDepartments(list)
        const linked = list.find(d => d.id === linkedDepartment)
        if (linkedDepartment && !linked) {
          setDepartmentId(null)
          setError('Отдел из уведомления недоступен')
          setLoading(false)
          return
        }
        setDepartmentId(linked?.id ?? list[0]?.id ?? null)
        if (linkedVersion) setSelectedVersion(linkedVersion)
        if (linked && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(linkedDate)) {
          setYear(Number(linkedDate.slice(0, 4)))
          setMonth(Number(linkedDate.slice(5, 7)))
          setSelectedDate(linkedDate)
          setReload(value => value + 1)
        }
        if (!list.length) setLoading(false)
      })
      .catch(err => {
        if (!active) return
        setError(getErrorMessage(err))
        setLoading(false)
      })
    return () => { active = false }
  }, [linkedDate, linkedDepartment, linkedVersion, navigationKey])

  useEffect(() => {
    if (!departmentId) return
    let active = true
    const listPath = `/timesheet?departmentId=${departmentId}&year=${year}&month=${month}`
    setLoading(true)
    setError(null)
    setSheet(null)
    async function load() {
      try {
        let list = await apiGet<Timesheet[]>(listPath)
        if (!active) return
        let found = list.find(item => item.id === selectedVersion) ?? list[0]
        if (!active) return
        if (!found) {
          try {
            found = await apiPost<Timesheet>('/timesheet', { department_id: departmentId, year, month })
          } catch (err) {
            if (!(err instanceof ApiError) || err.status !== 409) throw err
            const [existing] = await apiGet<Timesheet[]>(listPath)
            if (!existing) throw err
            found = existing
          }
        }
        if (found && !list.some(item => item.id === found.id)) list = [found, ...list]
        setVersions(list)
        const data = await apiGet<TimesheetDetails>(`/timesheet/${found.id}`)
        if (active) setSheet(data)
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [departmentId, year, month, reload, selectedVersion])

  const currentSheet = sheet?.department_id === departmentId && sheet.year === year && sheet.month === month ? sheet : null
  const today = currentSheet?.today.startsWith(`${year}-${String(month).padStart(2, '0')}-`) && (currentSheet.period !== 'half' || Number(currentSheet.today.slice(-2)) <= 15) ? currentSheet.today : ''
  const dates = [...new Set([today, ...(currentSheet?.days.map(d => d.date) ?? [])].filter(Boolean))].sort().reverse()
  const date = dates.includes(selectedDate) ? selectedDate : currentSheet?.days.find(d => d.status === 'returned')?.date ?? today
  const day = currentSheet?.days.find(d => d.date === date)
  const editable = currentSheet?.status === 'draft' && !!date && (day ? day.status === 'returned' : date === today)
  const years = [...new Set([now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, year])].sort()

  return (
    <div className="space-y-6" data-timesheet-page>
      <PageBanner
        icon={Sparkles}
        eyebrow="Табель"
        title="Табель"
        subtitle="Учёт посещаемости работников подразделения"
        meta={currentSheet && <BannerPill icon={Users}>{currentSheet.currentEmployeeIds.length} работников</BannerPill>}
        extra={
          <div className="flex flex-wrap gap-2">
            {departments.length > 1 && (
              <SelectDropdown
                aria-label="Отдел"
                placeholder="Выберите отдел"
                options={departments.map(department => ({ value: String(department.id), label: department.name }))}
                value={String(departmentId ?? '')}
                className="max-w-64"
                onChange={value => { setDepartmentId(Number(value)); setSelectedDate('') }}
              />
            )}
            <SelectDropdown
              aria-label="Месяц"
              options={MONTH_OPTIONS}
              value={String(month)}
              onChange={value => { setMonth(Number(value)); setSelectedDate('') }}
            />
            <SelectDropdown
              aria-label="Год"
              options={years.map(item => ({ value: String(item), label: String(item) }))}
              value={String(year)}
              className="min-w-24"
              onChange={value => { setYear(Number(value)); setSelectedDate('') }}
            />
          </div>
        }
      />
      {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
      {loading ? (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">Загрузка табеля…</p>
      ) : currentSheet ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{currentSheet.department_name}</span>
            {dates.length > 0 && (
              <SelectDropdown
                aria-label="Дата табеля"
                placeholder="Выберите дату"
                options={dates.map(item => {
                  const status = currentSheet.days.find(day => day.date === item)?.status
                  return { value: item, label: `${formatDate(item)} · ${status ? TIMESHEET_DAY_LABELS[status] : 'Черновик'}` }
                })}
                value={date}
                onChange={setSelectedDate}
              />
            )}
            {currentSheet.status !== 'draft' && <span className="text-sm text-muted-foreground">{currentSheet.status === 'approved' ? 'Месячный табель утверждён' : 'Месячный табель отправлен'}</span>}
          </div>
          {day?.status === 'returned' && <p role="status" className="whitespace-pre-wrap rounded-lg bg-amber-500/10 p-3 text-sm">HR вернул табель на доработку. {day.reason}</p>}
          <TimesheetGrid key={`${currentSheet.id}:${date}`} sheet={currentSheet} selectedDate={date} editable={editable} onSaved={() => setReload(value => value + 1)} />
          <TimesheetTools sheet={currentSheet} versions={versions} departmentId={departmentId} onSelect={setSelectedVersion} onChanged={() => setReload(value => value + 1)} />
          <TimesheetLegend />
        </div>
      ) : !error && <p className="text-sm text-muted-foreground">За вами не закреплены подразделения.</p>}
    </div>
  )
}
