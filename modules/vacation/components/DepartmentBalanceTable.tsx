import { useEffect, useState } from 'react'
import type { DepartmentBalanceEntry } from '@/shared/types'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { buildUserColorMap } from '@/shared/components/calendar/YearCalendar'
import { cn } from '@/shared/lib/utils'
import { HelpCircle } from 'lucide-react'

const USED_HINT = 'Дни согласованных отпусков за год, включая ещё не наступившие'

interface DepartmentBalanceTableProps {
  departmentIds: string[]
  departmentNames?: Map<string, string>
  year: number
  currentUserId?: string
  tagId?: string
  search?: string
  onlyUserIds?: Set<string> | null
  emptyHint?: string
}

type Row = DepartmentBalanceEntry & { departmentId: string }

export function DepartmentBalanceTable({ departmentIds, departmentNames, year, currentUserId, tagId, search = '', onlyUserIds = null, emptyHint }: DepartmentBalanceTableProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const idsKey = [...new Set(departmentIds.filter(Boolean))].sort().join(',')

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all(ids.map((id) => vacationApi.getDepartmentBalances(id, year, tagId).then((list) => list.map((r) => ({ ...r, departmentId: id })))))
      .then((lists) => {
        if (cancelled) return
        const byUser = new Map<string, Row>()
        for (const r of lists.flat()) if (!byUser.has(r.userId)) byUser.set(r.userId, r)
        setRows([...byUser.values()].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'ru')))
      })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [idsKey, year, tagId])

  const q = search.trim().toLowerCase()
  const visible = rows.filter((r) =>
    (!q || `${r.lastName} ${r.firstName}`.toLowerCase().includes(q) || `${r.firstName} ${r.lastName}`.toLowerCase().includes(q)) &&
    (!onlyUserIds || onlyUserIds.has(r.userId)))
  const showDepartment = idsKey.includes(',')

  if (loading) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Загрузка…</div>
  }

  if (visible.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        {emptyHint || (rows.length > 0 || tagId ? 'Нет работников, подходящих под фильтры' : 'Нет данных по отделу')}
      </div>
    )
  }

  const colorMap = buildUserColorMap(visible.map(r => r.userId))

  return (
    <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/60">
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">ФИО</th>
            {showDepartment && <th className="px-3 py-2 font-medium">Отдел</th>}
            <th className="px-3 py-2 font-medium text-right">Всего дней</th>
            <th className="px-3 py-2 font-medium text-right">
              <span className="group relative inline-flex items-center justify-end gap-1">
                Использовано
                <HelpCircle
                  tabIndex={0}
                  aria-label={USED_HINT}
                  className="h-3.5 w-3.5 cursor-help text-muted-foreground/70 outline-none hover:text-foreground focus:text-foreground"
                />
                <span
                  role="tooltip"
                  className="pointer-events-none invisible absolute right-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-border bg-popover px-2.5 py-2 text-left text-xs font-normal normal-case tracking-normal text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                >
                  {USED_HINT}
                </span>
              </span>
            </th>
            <th className="px-3 py-2 font-medium text-right">Осталось</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const isMe = !!currentUserId && row.userId === currentUserId
            return (
              <tr key={row.userId} className={cn('border-t border-border', isMe && 'bg-primary/5 font-medium')}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: colorMap.get(row.userId) ?? undefined }} />
                    <span className="truncate">{row.lastName} {row.firstName}</span>
                  </span>
                </td>
                {showDepartment && <td className="px-3 py-2 text-muted-foreground">{departmentNames?.get(row.departmentId) ?? '—'}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{row.totalDays}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.usedDays}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.availableDays}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
