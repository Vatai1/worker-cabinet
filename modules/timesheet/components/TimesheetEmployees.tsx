import { useEffect, useRef, useState } from 'react'
import { Select } from '@/shared/components/ui/Select'
import { Button } from '@/shared/components/ui/Button'
import { TableCard, TableEmptyRow, TableFrame, TableHeadRow, TableSearch, TableSkeleton, TD, TH, TR } from '@/shared/components/ui/DataTable'
import { Users } from 'lucide-react'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { apiGet, apiPut } from '@/shared/lib/apiClient'

interface Employee {
  id: number
  name: string
  position: string
  department_id: number | null
  department_name: string | null
  staff_number: string | null
  hourly: boolean
}

type Settings = Pick<Employee, 'staff_number' | 'hourly'>
type Changes = Partial<Settings>

export function TimesheetEmployees({ onSaved }: { onSaved: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [mode, setMode] = useState('all')
  const [selected, setSelected] = useState<number[]>([])
  const [changes, setChanges] = useState<Record<number, Changes>>({})
  const [reload, setReload] = useState(0)
  const selectAll = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    apiGet<Employee[]>('/timesheet/employees/settings')
      .then(rows => { if (active) setEmployees(rows) })
      .catch(err => { if (active) setError(getErrorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  const departments = [...new Map(employees.filter(employee => employee.department_id !== null).map(employee => [employee.department_id, employee.department_name ?? 'Без названия'])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
  const query = search.trim().toLocaleLowerCase('ru-RU')
  const rows = employees.filter(employee => {
    const current = { ...employee, ...changes[employee.id] }
    return (department === 'all' || String(employee.department_id ?? 'none') === department)
      && (mode === 'all' || employee.hourly === (mode === 'hourly'))
      && (!query || [employee.name, employee.position, employee.department_name, employee.staff_number, current.staff_number].some(value => value?.toLocaleLowerCase('ru-RU').includes(query)))
  })
  const selectedCount = rows.filter(employee => selected.includes(employee.id)).length
  const changedCount = Object.keys(changes).length

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedCount > 0 && selectedCount < rows.length
  }, [selectedCount, rows.length])

  function changeSettings(ids: number[], patch: Changes) {
    setSuccess('')
    setError('')
    setChanges(previous => {
      const next = { ...previous }
      for (const employee of employees) {
        if (!ids.includes(employee.id)) continue
        const current = { ...employee, ...previous[employee.id], ...patch }
        const changed: Changes = {}
        if ((current.staff_number?.trim() || null) !== employee.staff_number) changed.staff_number = current.staff_number
        if (current.hourly !== employee.hourly) changed.hourly = current.hourly
        if (Object.keys(changed).length) next[employee.id] = changed
        else delete next[employee.id]
      }
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = Object.entries(changes).map(([id, patch]) => ({ employee_id: Number(id), ...patch }))
      const { updated } = await apiPut<{ updated: (Settings & { employee_id: number })[] }>('/timesheet/employees/settings', payload)
      const byId = new Map(updated.map(item => [item.employee_id, item]))
      setEmployees(previous => previous.map(employee => {
        const settings = byId.get(employee.id)
        return settings ? { ...employee, staff_number: settings.staff_number, hourly: settings.hourly } : employee
      }))
      setChanges({})
      setSelected([])
      setSuccess(`Сохранено сотрудников: ${updated.length}`)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return <TableCard icon={Users} title="Сотрудники" subtitle="Табельные номера и режим учёта в выбранном учреждении">
    <div className="flex flex-wrap items-center gap-2">
      <TableSearch value={search} onChange={value => { setSearch(value); setSelected([]) }} placeholder="Поиск по ФИО, должности или табельному номеру" />
      <Select aria-label="Отдел сотрудников" value={department} disabled={saving} onChange={selectedValue => { setDepartment(selectedValue); setSelected([]) }}>
        <option value="all">Все отделы</option>
        {departments.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
        <option value="none">Без отдела</option>
      </Select>
      <Select aria-label="Режим учёта сотрудников" value={mode} disabled={saving} onChange={selectedValue => { setMode(selectedValue); setSelected([]) }}>
        <option value="all">Любой режим учёта</option>
        <option value="hourly">Почасовой учёт</option>
        <option value="attendance">Без почасового учёта</option>
      </Select>
      <Button variant="outline" disabled={saving || loading || changedCount > 0} onClick={() => { setSelected([]); setSuccess(''); setReload(value => value + 1) }}>Обновить</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {success && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}
    {loading ? <TableSkeleton /> : <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-3">
        <span className="mr-2 text-sm" aria-live="polite">Выбрано: {selectedCount}</span>
        <Button variant="outline" size="sm" disabled={saving || selectedCount === 0} onClick={() => changeSettings(rows.filter(employee => selected.includes(employee.id)).map(employee => employee.id), { hourly: true })}>Включить почасовой учёт</Button>
        <Button variant="outline" size="sm" disabled={saving || selectedCount === 0} onClick={() => changeSettings(rows.filter(employee => selected.includes(employee.id)).map(employee => employee.id), { hourly: false })}>Отключить почасовой учёт</Button>
        <Button variant="ghost" size="sm" disabled={saving || selected.length === 0} onClick={() => setSelected([])}>Снять выбор</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Показано: {rows.length} из {employees.length}</span>
        <div className="flex flex-wrap items-center gap-2">
          {changedCount > 0 && <span role="status" className="text-amber-700 dark:text-amber-300">Не сохранено: {changedCount}</span>}
          <Button variant="ghost" disabled={saving || changedCount === 0} onClick={() => { setChanges({}); setError(''); setSuccess('') }}>Отменить изменения</Button>
          <Button disabled={saving || changedCount === 0} onClick={save}>{saving ? 'Сохранение…' : `Сохранить изменения${changedCount ? ` (${changedCount})` : ''}`}</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Массовые действия применяются к выбранным строкам. Изменения вступят в силу после сохранения.</p>
      <TableFrame>
        <thead><TableHeadRow>
          <th scope="col" className={cn(TH, 'w-12')}><input ref={selectAll} type="checkbox" aria-label="Выбрать всех показанных сотрудников" checked={rows.length > 0 && selectedCount === rows.length} disabled={saving || rows.length === 0} onChange={event => setSelected(event.target.checked ? rows.map(employee => employee.id) : [])} /></th>
          <th scope="col" className={TH}>Сотрудник</th>
          <th scope="col" className={TH}>Отдел</th>
          <th scope="col" className={TH}>Табельный номер</th>
          <th scope="col" className={TH}>Почасовой учёт</th>
        </TableHeadRow></thead>
        <tbody>
          {!rows.length && <TableEmptyRow colSpan={5} icon={Users} title={employees.length ? 'Сотрудники не найдены' : 'В учреждении пока нет сотрудников'} />}
          {rows.map(employee => {
            const current = { ...employee, ...changes[employee.id] }
            return <tr key={employee.id} className={cn(TR, selected.includes(employee.id) && 'bg-primary/5')}>
              <td className={TD}><input type="checkbox" aria-label={`Выбрать — ${employee.name}`} checked={selected.includes(employee.id)} disabled={saving} onChange={event => setSelected(previous => event.target.checked ? [...previous, employee.id] : previous.filter(id => id !== employee.id))} /></td>
              <th scope="row" className={cn(TD, 'text-left')}><div className="font-medium">{employee.name}</div><div className="text-xs font-normal text-muted-foreground">{employee.position}</div></th>
              <td className={cn(TD, 'text-muted-foreground')}>{employee.department_name ?? 'Без отдела'}</td>
              <td className={TD}><input aria-label={`Табельный номер — ${employee.name}`} value={current.staff_number ?? ''} maxLength={64} disabled={saving} placeholder="Не указан" onChange={event => changeSettings([employee.id], { staff_number: event.target.value })} className="h-9 w-40 rounded-lg border border-border bg-background px-3 text-sm" /></td>
              <td className={TD}><label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" aria-label={`Почасовой учёт — ${employee.name}`} checked={current.hourly} disabled={saving} onChange={event => changeSettings([employee.id], { hourly: event.target.checked })} /><span className="text-xs">Почасовой</span></label></td>
            </tr>
          })}
        </tbody>
      </TableFrame>
    </>}
  </TableCard>
}
