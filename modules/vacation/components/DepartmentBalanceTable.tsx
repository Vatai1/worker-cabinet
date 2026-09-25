import { useEffect, useState } from 'react'
import type { DepartmentBalanceEntry } from '@/shared/types'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { buildUserColorMap } from '@/shared/components/calendar/YearCalendar'
import { cn } from '@/shared/lib/utils'

interface DepartmentBalanceTableProps {
  departmentId: string
  year: number
  currentUserId?: string
  tagId?: string
}

export function DepartmentBalanceTable({ departmentId, year, currentUserId, tagId }: DepartmentBalanceTableProps) {
  const [rows, setRows] = useState<DepartmentBalanceEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!departmentId) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    vacationApi.getDepartmentBalances(departmentId, year, tagId)
      .then((data) => { if (!cancelled) setRows(data) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [departmentId, year, tagId])

  if (loading) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Загрузка…</div>
  }

  if (rows.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        {tagId ? 'Нет работников отдела с выбранным тегом' : 'Нет данных по отделу'}
      </div>
    )
  }

  const colorMap = buildUserColorMap(rows.map(r => r.userId))

  return (
    <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/60">
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">ФИО</th>
            <th className="px-3 py-2 font-medium text-right">Всего дней</th>
            <th className="px-3 py-2 font-medium text-right">Использовано</th>
            <th className="px-3 py-2 font-medium text-right">Запланировано</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isMe = !!currentUserId && row.userId === currentUserId
            return (
              <tr key={row.userId} className={cn('border-t border-border', isMe && 'bg-primary/5 font-medium')}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: colorMap.get(row.userId) ?? undefined }} />
                    <span className="truncate">{row.lastName} {row.firstName}</span>
                  </span>
                </td>
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
