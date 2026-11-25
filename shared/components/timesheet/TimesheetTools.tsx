import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Select } from '@/shared/components/ui/Select'
import { TimesheetAuditLog } from '@/shared/components/timesheet/TimesheetAuditLog'
import { Button } from '@/shared/components/ui/Button'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { apiGet, apiPost, apiPut, fetchWithRetry } from '@/shared/lib/apiClient'
import type { Timesheet } from './TimesheetGrid'

interface Props {
  sheet: Timesheet | null
  versions: Timesheet[]
  departmentId: number | null
  manage?: boolean
  journal?: boolean
  onSelect: (id: number) => void
  onChanged: (id?: number, year?: number, month?: number, departmentId?: number) => void
}
interface Manager { id: number; name: string; primary: boolean; assigned: boolean }

export function TimesheetTools({ sheet, versions, departmentId, manage = false, journal = false, onSelect, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [managers, setManagers] = useState<Manager[] | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [auditOpen, setAuditOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [kind, setKind] = useState('correction')
  const [period, setPeriod] = useState('')
  const [importScope, setImportScope] = useState('organization')

  useEffect(() => { setManagers(null); setAuditOpen(false); setError('') }, [departmentId, sheet?.id])

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() } catch (err) { setError(getErrorMessage(err)) } finally { setBusy(false) }
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {sheet && <>
        <Select aria-label="Версия табеля" disabled={busy} value={sheet.id} onChange={selectedValue => onSelect(Number(selectedValue))}>
          {versions.map(version => <option key={version.id} value={version.id}>Версия {version.version} · {version.number ? `№ ${version.number}` : 'Без номера'} · {version.document_date ? formatDate(version.document_date) : ''} · {version.kind === 'correction' ? 'Корректирующий' : 'Первичный'} · {version.period === 'half' ? '1–15' : 'Месяц'}</option>)}
        </Select>
        {!manage && <Button variant="outline" size="sm" onClick={() => setAuditOpen(value => !value)}>{auditOpen ? 'Закрыть журнал' : 'Журнал'}</Button>}
      </>}
      {!journal && manage && <>
        <Select aria-label="Область импорта табеля" disabled={busy} value={importScope} onChange={selectedValue => setImportScope(selectedValue)}>
          <option value="organization">По отделам учреждения</option>
          <option value="department" disabled={!departmentId}>В выбранный отдел</option>
        </Select>
        <label className={`rounded-lg border border-border px-3 py-2 text-sm ${busy ? 'opacity-50' : 'cursor-pointer'}`}>
          Импорт 0504421 (XLSX)
          <input type="file" accept=".xlsx" disabled={busy || (importScope === 'department' && !departmentId)} className="sr-only" aria-label="Импорт формы 0504421" onChange={event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            run(async () => {
              const body = new FormData()
              body.append('file', file)
              if (importScope === 'department' && departmentId) body.append('department_id', String(departmentId))
              const response = await fetchWithRetry(`${API_BASE_URL}/timesheet/import`, { method: 'POST', headers: getAuthHeaders(), body })
              const data = await response.json()
              if (!response.ok) throw new Error(data.error || 'Ошибка импорта')
              const sheets: Timesheet[] = data.sheets ?? [data]
              const target = sheets.find(version => version.department_id === departmentId) ?? sheets[0]
              onChanged(target.id, target.year, target.month, target.department_id)
              toast.success(`Импортировано табелей: ${sheets.length}`)
            })
          }} />
        </label>
        {departmentId && <Button hidden className="hidden" variant="outline" size="sm" disabled={busy} onClick={() => run(async () => {
          const data = await apiGet<{ candidates: Manager[] }>(`/timesheet/departments/${departmentId}/managers`)
          setManagers(data.candidates); setSelected(data.candidates.filter(u => u.assigned).map(u => u.id))
        })}>Руководители табеля</Button>}
      </>}
    </div>
    {!journal && manage && sheet && <details className="rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Создать версию табеля</summary>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault(); run(async () => {
          const created = await apiPost<Timesheet>(`/timesheet/${sheet.id}/versions`, { number, document_date: documentDate || undefined, kind, period: period || sheet.period })
          onChanged(created.id)
        })
      }}>
        <label className="space-y-1">Номер<input aria-label="Номер новой версии" value={number} maxLength={64} onChange={e => setNumber(e.target.value)} className="block rounded border border-border bg-background p-2" /></label>
        <label className="space-y-1">Дата (пусто — сегодня)<input type="date" min="2000-01-01" max="2100-12-31" value={documentDate} onChange={e => setDocumentDate(e.target.value)} className="block rounded border border-border bg-background p-2" /></label>
        <label className="space-y-1">Тип<Select value={kind} onChange={selectedValue => setKind(selectedValue)}><option value="original">Первичный</option><option value="correction">Корректирующий</option></Select></label>
        <label className="space-y-1">Период<Select value={period || sheet.period} onChange={selectedValue => setPeriod(selectedValue)}><option value="half">Первая половина</option><option value="month">Месяц</option></Select></label>
        <Button size="sm" disabled={busy}>Создать версию</Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Отметки копируются, отправленные дни возвращаются на доработку в новой версии. Предыдущая версия сохраняется.</p>
    </details>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {managers && <form hidden className="hidden space-y-3 rounded-lg border border-border p-3" onSubmit={event => {
      event.preventDefault(); run(async () => {
        await apiPut(`/timesheet/departments/${departmentId}/managers`, { user_ids: selected })
        setManagers(null); onChanged()
      })
    }}>
      <p className="text-sm font-medium">Дополнительные руководители. Замещения на время отпуска настраиваются в разделе отпусков.</p>
      <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{managers.map(user => <label key={user.id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={user.primary || selected.includes(user.id)} disabled={user.primary || busy} onChange={event => setSelected(previous => event.target.checked ? [...previous, user.id] : previous.filter(id => id !== user.id))} />
        {user.name}{user.primary && ' · начальник отдела'}
      </label>)}</div>
      <Button size="sm" disabled={busy}>Сохранить руководителей</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setManagers(null)}>Закрыть</Button>
    </form>}
    {auditOpen && sheet && !manage && <TimesheetAuditLog key={sheet.id} sheetId={sheet.id} />}
  </div>
}
