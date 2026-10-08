import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Download, Loader2, type LucideIcon } from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { SortButton, TableEmpty, TableFrame, TableHeadRow, TableSearch, TableSkeleton, TD, TH, TR, useTableSort } from '@/shared/components/ui/DataTable'
import { apiGet } from '@/shared/lib/apiClient'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { useOrgStore } from '@/shared/store/orgStore'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { ReportCharts, type ReportChart } from '@/modules/reports/components/ReportCharts'

export interface ReportDef {
  id: string
  name: string
  hint: string
  yearly: boolean
  icon: LucideIcon
  accent: string
  monthsFilter?: boolean
}
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'default'
type Cell = string | number | null

interface Report {
  title: string
  columns: { key: string; label: string; type: 'text' | 'number' | 'badge' | 'percent'; wide?: boolean }[]
  rows: (Record<string, Cell> & { _tone?: Record<string, Tone | undefined> })[]
  totals?: Record<string, number>
  summary?: { label: string; value: string | number; tone: Tone; hint?: string }[]
  charts?: ReportChart[]
}


const TONE_BADGE: Record<Tone, string> = {
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  danger: 'bg-red-500/10 text-red-700 dark:text-red-400',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  muted: 'bg-muted text-muted-foreground',
  default: 'bg-muted/60 text-foreground',
}
const TONE_TEXT: Record<Tone, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  info: 'text-sky-600 dark:text-sky-400',
  muted: 'text-muted-foreground',
  default: 'text-foreground',
}
const TONE_BAR: Record<Tone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  muted: 'bg-muted-foreground/40',
  default: 'bg-primary',
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]
const ROW_LIMIT = 500

function ReportCell({ column, value, tone }: { column: Report['columns'][number]; value: Cell; tone?: Tone }) {
  if (value === null || value === '') return <span className="text-muted-foreground/60">—</span>
  if (column.type === 'badge') {
    return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', TONE_BADGE[tone || 'default'])}>{value}</span>
  }
  if (column.type === 'percent') {
    const pct = Math.max(0, Math.min(100, Number(value)))
    return (
      <div className="flex items-center justify-end gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', TONE_BAR[tone || 'default'])} style={{ width: `${pct}%` }} />
        </div>
        <span className={cn('w-9 text-right tabular-nums', tone && TONE_TEXT[tone])}>{pct}%</span>
      </div>
    )
  }
  if (column.type === 'number') {
    return <span className={cn('tabular-nums', tone && cn(TONE_TEXT[tone], 'font-semibold'))}>{Number(value).toLocaleString('ru-RU')}</span>
  }
  return <span className={cn(tone && TONE_TEXT[tone])}>{value}</span>
}

export function ReportsWorkspace({ endpoint, reports }: { endpoint: string; reports: ReportDef[] }) {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const [type, setType] = useState(reports[0].id)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const [months, setMonths] = useState('6')
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const sort = useTableSort<string>('')

  const meta = reports.find((r) => r.id === type) ?? reports[0]

  useEffect(() => {
    apiGet<{ id: number; name: string }[]>('/dictionaries/departments').then(setDepartments).catch(() => setDepartments([]))
  }, [currentOrgId])

  const params = useMemo(() => {
    const p = new URLSearchParams({ year: String(year) })
    if (departmentIds.length) p.set('departmentId', departmentIds.join(','))
    if (meta.monthsFilter) p.set('months', months || '6')
    return p
  }, [year, departmentIds, months, meta.monthsFilter])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiGet<Report>(`${endpoint}/${type}?${params}`)
      .then((r) => { if (!cancelled) setReport(r) })
      .catch((err) => { if (!cancelled) toast.error(getErrorMessage(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [endpoint, type, params, currentOrgId])

  useEffect(() => { setSearch('') }, [type])

  const exportExcel = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams(params)
      p.set('format', 'xlsx')
      const res = await fetch(`${API_BASE_URL}${endpoint}/${type}?${p}`, { headers: getAuthHeaders(), credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Ошибка' }))
        throw new Error(data.error || 'Ошибка')
      }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `${meta.name}${meta.yearly ? ` ${year}` : ''}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const rows = useMemo(() => {
    if (!report) return []
    const q = search.trim().toLowerCase()
    const filtered = q
      ? report.rows.filter((r) => report.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)))
      : report.rows
    if (!sort.key || !report.columns.some((c) => c.key === sort.key)) return filtered
    const numeric = ['number', 'percent'].includes(report.columns.find((c) => c.key === sort.key)?.type ?? '')
    return sort.sorted(filtered, (r, k) => (numeric ? Number(r[k] ?? -Infinity) : String(r[k] ?? '')))
  }, [report, search, sort])

  const showTotals = !!report?.totals && !search.trim() && rows.length > 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {reports.map((r) => {
          const Icon = r.icon
          const active = type === r.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setType(r.id)}
              aria-pressed={active}
              className={cn(
                'group flex items-start gap-3 rounded-2xl border bg-card p-3 text-left transition-all',
                active ? 'border-primary/50 shadow-sm ring-2 ring-primary/20' : 'border-border/60 hover:-translate-y-0.5 hover:border-border hover:shadow-sm',
              )}
            >
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', r.accent, !active && 'opacity-80 group-hover:opacity-100')}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className={cn('text-[13px] font-semibold leading-tight', active && 'text-primary')}>{r.name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{r.hint}</p>
              </div>
            </button>
          )
        })}
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border/60 p-4">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', meta.accent)}>
              <meta.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{report?.title ?? meta.name}</h2>
              <p className="text-xs text-muted-foreground">Текущая организация, активные сотрудники</p>
            </div>
          </div>
          {meta.yearly && (
            <SelectDropdown options={YEARS.map((y) => ({ value: String(y), label: `${y} год` }))} value={String(year)} onChange={(v) => setYear(Number(v))} />
          )}
          <div className="min-w-[200px]">
            <MultiSelectDropdown
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
              selected={departmentIds}
              onChange={setDepartmentIds}
              placeholder="Все отделы"
              countLabel="Отделы"
              searchable
            />
          </div>
          {meta.monthsFilter && (
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              от
              <Input type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} className="h-9 w-16 text-sm" />
              мес.
            </label>
          )}
          <Button size="sm" className="h-9" onClick={exportExcel} disabled={exporting || !report?.rows.length}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Скачать Excel
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {!report ? (
            <TableSkeleton />
          ) : (
            <div className={cn('space-y-4 transition-opacity', loading && 'pointer-events-none opacity-50')}>
              {!!report.summary?.length && (
                <div className={cn('grid gap-2.5', report.summary.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
                  {report.summary.map((k) => (
                    <div key={k.label} className={cn('rounded-xl px-3.5 py-3', TONE_BADGE[k.tone])}>
                      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{k.label}</p>
                      <p className={cn('mt-1 text-2xl font-bold tabular-nums leading-none', TONE_TEXT[k.tone])}>
                        {typeof k.value === 'number' ? k.value.toLocaleString('ru-RU') : k.value}
                      </p>
                      {k.hint && <p className="mt-1 truncate text-[11px] opacity-70" title={k.hint}>{k.hint}</p>}
                    </div>
                  ))}
                </div>
              )}

              {!!report.charts?.length && <ReportCharts charts={report.charts} />}

              <div className="flex flex-wrap items-center gap-2.5">
                <TableSearch value={search} onChange={setSearch} placeholder="Поиск по таблице…" />
                <p className="text-xs text-muted-foreground">
                  {rows.length > ROW_LIMIT ? `Показаны ${ROW_LIMIT} из ${rows.length.toLocaleString('ru-RU')} — полностью в Excel` : `Строк: ${rows.length.toLocaleString('ru-RU')}`}
                </p>
              </div>

              {rows.length === 0 ? (
                <TableEmpty icon={BarChart3} title="Нет данных" hint={search ? 'Измените поисковый запрос' : 'Выберите другой год или отделы'} />
              ) : (
                <TableFrame>
                  <thead>
                    <TableHeadRow>
                      {report.columns.map((c) => (
                        <th key={c.key} className={cn(TH, (c.type === 'number' || c.type === 'percent') && 'text-right', c.wide && 'min-w-[240px]')}>
                          <SortButton label={c.label} active={sort.key === c.key} dir={sort.dir} onClick={() => sort.toggle(c.key)} />
                        </th>
                      ))}
                    </TableHeadRow>
                  </thead>
                  <tbody>
                    {rows.slice(0, ROW_LIMIT).map((r, i) => (
                      <tr key={i} className={TR}>
                        {report.columns.map((c) => (
                          <td
                            key={c.key}
                            className={cn(
                              TD,
                              (c.type === 'number' || c.type === 'percent') && 'text-right',
                              c.key === 'name' && 'whitespace-nowrap font-medium',
                              c.wide ? 'max-w-[420px] text-muted-foreground' : 'whitespace-nowrap',
                            )}
                          >
                            <ReportCell column={c} value={r[c.key] ?? null} tone={r._tone?.[c.key]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {showTotals && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={cn(TD, c.type === 'number' && 'text-right tabular-nums')}>
                            {i === 0 ? 'Итого' : report.totals && c.key in report.totals ? report.totals[c.key].toLocaleString('ru-RU') : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </TableFrame>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
