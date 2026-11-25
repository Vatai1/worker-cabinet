import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { formatDate, formatDateTime, getErrorMessage } from '@/shared/lib/utils'
import { apiGet } from '@/shared/lib/apiClient'

interface AuditRow {
  id: string
  actor: string
  employee: string
  action: string
  created_at: string
  data: { date?: string; staff_number?: string | null; before?: unknown; after?: unknown; filename?: string; reason?: string }
}

function auditValue(value: unknown): string {
  if (value == null) return '—'
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (typeof value === 'object') {
    const fields: Record<string, string> = { code: 'Отметка', minutes: 'Минуты', staff_number: 'Табельный номер', staff_numbers: 'Табельные номера', hourly: 'Почасовой учёт' }
    return Object.entries(value)
      .filter(([key]) => key !== 'staff_number' || !('staff_numbers' in value))
      .map(([key, item]) => `${fields[key] ?? key}: ${typeof item === 'boolean' ? item ? 'да' : 'нет' : auditValue(item)}`).join(', ')
  }
  return String(value)
}

export function TimesheetAuditLog({ sheetId, refreshKey = 0 }: { sheetId: number; refreshKey?: number }) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    apiGet<AuditRow[]>(`/timesheet/${sheetId}/audit`)
      .then(data => { if (active) { setRows(data); setMore(data.length === 100) } })
      .catch(err => { if (active) setError(getErrorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sheetId, refreshKey])

  async function loadMore() {
    setLoading(true)
    setError('')
    try {
      const data = await apiGet<AuditRow[]>(`/timesheet/${sheetId}/audit?before=${rows[rows.length - 1].id}`)
      setRows(previous => [...previous, ...data])
      setMore(data.length === 100)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Журнал табеля">
    <h2 className="text-sm font-semibold">Журнал табеля</h2>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Загрузка журнала…</p>}
    {!loading && !error && !rows.length && <p className="text-sm text-muted-foreground">Событий пока нет</p>}
    <ol className="space-y-3">{rows.map(row => <li key={row.id} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
      <p>{formatDateTime(row.created_at)} · {row.actor || 'Система'} · {row.action} {row.employee}{row.data.staff_number && ` · ${row.data.staff_number}`} {row.data.date && formatDate(row.data.date)}</p>
      {(row.data.before !== undefined || row.data.after !== undefined) && <p className="mt-1 break-words text-xs text-muted-foreground">Было: {auditValue(row.data.before)} → Стало: {auditValue(row.data.after)}</p>}
      {row.data.filename && <p className="mt-1 text-xs text-muted-foreground">{row.data.filename}</p>}
      {row.data.reason && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{row.data.reason}</p>}
    </li>)}</ol>
    {more && <Button size="sm" variant="outline" disabled={loading} onClick={loadMore}>Предыдущие события</Button>}
  </section>
}
