import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { TableCard, TableEmptyRow, TableFrame, TableHeadRow, TableSearch, TableSkeleton, TD, TH, TR } from '@/shared/components/ui/DataTable'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { Plus, Users, X } from 'lucide-react'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { apiGet, apiPut } from '@/shared/lib/apiClient'

interface Employee {
  id: number
  name: string
  position: string
  department_id: number | null
  department_name: string | null
  staff_number: string | null
  staff_numbers: string[]
  hourly: boolean
}

type Settings = Pick<Employee, 'staff_numbers' | 'hourly'>
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
      .then(rows => {
        if (active) setEmployees(rows.map(row => ({ ...row, staff_numbers: row.staff_numbers ?? (row.staff_number ? [row.staff_number] : []) })))
      })
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
      && (!query || [employee.name, employee.position, employee.department_name, ...employee.staff_numbers, ...current.staff_numbers].some(value => value?.toLocaleLowerCase('ru-RU').includes(query)))
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
        if (current.staff_numbers.length !== employee.staff_numbers.length || current.staff_numbers.some((number, index) => number !== employee.staff_numbers[index])) {
          changed.staff_numbers = current.staff_numbers
        }
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
      const payload = Object.entries(changes).map(([id, patch]) => ({
        employee_id: Number(id),
        ...patch,
        ...(patch.staff_numbers && { staff_numbers: patch.staff_numbers.map(number => number.trim()).filter(Boolean) }),
      }))
      const { updated } = await apiPut<{ updated: (Settings & { employee_id: number; staff_number: string | null })[] }>('/timesheet/employees/settings', payload)
      const byId = new Map(updated.map(item => [item.employee_id, item]))
      setEmployees(previous => previous.map(employee => {
        const settings = byId.get(employee.id)
        return settings ? { ...employee, staff_number: settings.staff_number, staff_numbers: settings.staff_numbers, hourly: settings.hourly } : employee
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
      <SelectDropdown
        aria-label="Отдел сотрудников"
        options={[
          { value: 'all', label: 'Все отделы' },
          ...departments.map(([id, label]) => ({ value: String(id), label })),
          { value: 'none', label: 'Без отдела' },
        ]}
        value={department}
        disabled={saving}
        className="max-w-64"
        onChange={value => { setDepartment(value); setSelected([]) }}
      />
      <SelectDropdown
        aria-label="Режим учёта сотрудников"
        options={[
          { value: 'all', label: 'Любой режим учёта' },
          { value: 'hourly', label: 'Почасовой учёт' },
          { value: 'attendance', label: 'Без почасового учёта' },
        ]}
        value={mode}
        disabled={saving}
        onChange={value => { setMode(value); setSelected([]) }}
      />
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
          <th scope="col" className={TH}>Табельные номера</th>
          <th scope="col" className={TH}>Почасовой учёт</th>
        </TableHeadRow></thead>
        <tbody>
          {!rows.length && <TableEmptyRow colSpan={5} icon={Users} title={employees.length ? 'Сотрудники не найдены' : 'В учреждении пока нет сотрудников'} />}
          {rows.map(employee => {
            const current = { ...employee, ...changes[employee.id] }
            const numbers = current.staff_numbers.length ? current.staff_numbers : ['']
            return <tr key={employee.id} className={cn(TR, selected.includes(employee.id) && 'bg-primary/5')}>
              <td className={TD}><input type="checkbox" aria-label={`Выбрать — ${employee.name}`} checked={selected.includes(employee.id)} disabled={saving} onChange={event => setSelected(previous => event.target.checked ? [...previous, employee.id] : previous.filter(id => id !== employee.id))} /></td>
              <th scope="row" className={cn(TD, 'text-left')}><div className="font-medium">{employee.name}</div><div className="text-xs font-normal text-muted-foreground">{employee.position}</div></th>
              <td className={cn(TD, 'text-muted-foreground')}>{employee.department_name ?? 'Без отдела'}</td>
              <td className={TD}>
                <div className="space-y-1.5">
                  {numbers.map((number, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <input
                        aria-label={`Табельный номер${index ? ` ${index + 1}` : ''} — ${employee.name}`}
                        value={number}
                        maxLength={64}
                        disabled={saving}
                        placeholder="Не указан"
                        onChange={event => changeSettings([employee.id], { staff_numbers: numbers.map((item, i) => i === index ? event.target.value : item) })}
                        className="h-9 w-40 rounded-lg border border-border bg-background px-3 text-sm"
                      />
                      {numbers.length > 1 && <Button type="button" variant="ghost" size="icon" disabled={saving}
                        aria-label={`Удалить табельный номер ${index + 1} — ${employee.name}`}
                        onClick={() => changeSettings([employee.id], { staff_numbers: numbers.filter((_, i) => i !== index) })}>
                        <X className="h-4 w-4" />
                      </Button>}
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" disabled={saving} className="h-7 px-1"
                    aria-label={`Добавить табельный номер — ${employee.name}`}
                    onClick={() => changeSettings([employee.id], { staff_numbers: [...numbers, ''] })}>
                    <Plus className="h-3.5 w-3.5" /> Добавить номер
                  </Button>
                </div>
              </td>
              <td className={TD}><label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" aria-label={`Почасовой учёт — ${employee.name}`} checked={current.hourly} disabled={saving} onChange={event => changeSettings([employee.id], { hourly: event.target.checked })} /><span className="text-xs">Почасовой</span></label></td>
            </tr>
          })}
        </tbody>
      </TableFrame>
    </>}
  </TableCard>
}
