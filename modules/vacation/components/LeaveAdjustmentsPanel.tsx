import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Coffee, History, Users, X } from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { SearchableCheckList } from '@/shared/components/ui/SearchableCheckList'
import { apiGet, apiPost } from '@/shared/lib/apiClient'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { DAY_OFF_HINT, type LeaveAdjustment } from '@/modules/vacation/lib/dayOffs'

interface AdjustedEmployee {
  id: number
  name: string
  position: string | null
  department: string | null
  day_off_granted: number
  day_off_used: number
  day_off_pending: number
  day_off_available: number
  last_at: string
}

type HistoryItem = LeaveAdjustment & { user_id: number; user_name: string; department: string | null }

interface Person {
  id: number
  name: string
  position: string | null
  department: string | null
}

const ALL = 'all'

const optionsOf = (values: (string | null)[], allLabel: string) => [
  { value: ALL, label: allLabel },
  ...[...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ru')).map((v) => ({ value: v, label: v })),
]

function Signed({ days }: { days: number }) {
  return (
    <span className={cn('font-semibold tabular-nums', days > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
      {days > 0 ? '+' : ''}{days}
    </span>
  )
}

export function LeaveAdjustmentsPanel() {
  const [people, setPeople] = useState<Person[]>([])
  const [scope, setScope] = useState<'all' | 'subordinates'>('all')
  const [employees, setEmployees] = useState<AdjustedEmployee[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [days, setDays] = useState('1')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [historyUserId, setHistoryUserId] = useState<number | null>(null)
  const [employeeDept, setEmployeeDept] = useState(ALL)
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyDept, setHistoryDept] = useState(ALL)
  const [historyAuthor, setHistoryAuthor] = useState(ALL)
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')

  const reload = useCallback(async () => {
    try {
      const data = await apiGet<{ scope: 'all' | 'subordinates'; people: Person[]; employees: AdjustedEmployee[]; items: HistoryItem[] }>('/vacation/adjustments/all?kind=day_off')
      setScope(data.scope)
      setPeople(data.people)
      setEmployees(data.employees)
      setHistory(data.items)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const userItems = useMemo(
    () => people.map((u) => ({ id: String(u.id), label: [u.name, u.position, u.department].filter(Boolean).join(' — ') })),
    [people]
  )

  const submit = async () => {
    const value = Number(days)
    if (selected.length === 0) return toast.error('Выберите сотрудников')
    if (!Number.isInteger(value) || value === 0) return toast.error('Укажите целое число дней, не ноль')
    if (!comment.trim()) return toast.error('Укажите комментарий — за что начисляются отгулы')
    setSaving(true)
    const failed: string[] = []
    for (const id of selected) {
      try {
        await apiPost('/vacation/adjustments', { userId: Number(id), kind: 'day_off', days: value, comment: comment.trim() })
      } catch (err: unknown) {
        failed.push(`${userItems.find((u) => u.id === id)?.label ?? id}: ${getErrorMessage(err)}`)
      }
    }
    setSaving(false)
    const done = selected.length - failed.length
    if (done > 0) toast.success(`Отгулы начислены: ${done} ${done === 1 ? 'сотруднику' : 'сотрудникам'}`)
    failed.forEach((f) => toast.error(f))
    if (failed.length === 0) {
      setSelected([])
      setComment('')
      setDays('1')
    }
    reload()
  }

  const departmentOptions = useMemo(
    () => optionsOf([...employees.map((e) => e.department), ...history.map((h) => h.department)], 'Все отделы'),
    [employees, history]
  )
  const authorOptions = useMemo(() => optionsOf(history.map((h) => h.created_by_name), 'Все, кто начислял'), [history])

  const q = employeeSearch.trim().toLowerCase()
  const visibleEmployees = employees.filter((e) =>
    (!q || `${e.name} ${e.position ?? ''} ${e.department ?? ''}`.toLowerCase().includes(q)) &&
    (employeeDept === ALL || e.department === employeeDept) &&
    (!onlyAvailable || e.day_off_available > 0)
  )

  const hq = historySearch.trim().toLowerCase()
  const visibleHistory = history.filter((h) => {
    const day = format(new Date(h.created_at), 'yyyy-MM-dd')
    return (!historyUserId || h.user_id === historyUserId) &&
      (!hq || `${h.user_name} ${h.comment}`.toLowerCase().includes(hq)) &&
      (historyDept === ALL || h.department === historyDept) &&
      (historyAuthor === ALL || h.created_by_name === historyAuthor) &&
      (!historyFrom || day >= historyFrom) &&
      (!historyTo || day <= historyTo)
  })
  const historyUserName = historyUserId ? employees.find((e) => e.id === historyUserId)?.name : null
  const historyFiltered = !!(historyUserId || hq || historyDept !== ALL || historyAuthor !== ALL || historyFrom || historyTo)
  const resetHistoryFilters = () => {
    setHistoryUserId(null)
    setHistorySearch('')
    setHistoryDept(ALL)
    setHistoryAuthor(ALL)
    setHistoryFrom('')
    setHistoryTo('')
  }

  return (
    <div className="space-y-4">
      <Card className="p-5" data-testid="adjust-form">
        <h3 className="flex items-center gap-2 text-base font-semibold"><Coffee className="h-4 w-4 text-primary" /> Начислить отгулы</h3>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          {scope === 'subordinates' && <span className="font-medium text-foreground">Доступны только ваши подчинённые. </span>}
          {DAY_OFF_HINT}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <SearchableCheckList
            emptyText={people.length === 0 ? 'Нет сотрудников, которым вы можете начислять отгулы' : 'Ничего не найдено'}
            items={userItems}
            selected={selected}
            onChange={setSelected}
            searchPlaceholder="Найти сотрудника…"
            countLabel="Выбрано"
          />
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Отгулов</label>
              <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Количество отгулов" className="h-9 w-28 text-sm" />
            </div>
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Отгулы не привязаны к году — доступны сотруднику всегда.</p>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Комментарий</label>
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="За что: за работу в выходной 12.10"
                aria-label="Комментарий к начислению"
                className="h-9 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">Отрицательное число списывает отгулы.</p>
            <Button onClick={submit} disabled={saving || selected.length === 0} className="w-full">
              {selected.length > 0 ? `Начислить (${selected.length})` : 'Начислить'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5" data-testid="adjusted-employees">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4 text-primary" /> Сотрудники с отгулами</h3>
          <span className="text-xs text-muted-foreground">Показано {visibleEmployees.length} из {employees.length}</span>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <Input value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} placeholder="ФИО, должность…" aria-label="Поиск сотрудника" className="h-9 w-56 text-sm" />
          <SelectDropdown options={departmentOptions} value={employeeDept} onChange={setEmployeeDept} className="w-56" />
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="h-4 w-4 accent-primary" />
            Есть доступные отгулы
          </label>
        </div>
        {visibleEmployees.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{employees.length > 0 ? 'Никто не подходит под фильтры' : 'Отгулы пока никому не начислялись'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Сотрудник</th>
                  <th className="px-3 py-2 text-right font-medium">Отгулов доступно</th>
                  <th className="px-3 py-2 text-right font-medium">На согласовании</th>
                  <th className="px-3 py-2 text-right font-medium">Использовано</th>
                  <th className="px-3 py-2 text-right font-medium">Начислено всего</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {visibleEmployees.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setHistoryUserId(historyUserId === e.id ? null : e.id)}
                    className={cn('cursor-pointer hover:bg-muted/40', historyUserId === e.id && 'bg-primary/5')}
                    title="Показать историю отгулов сотрудника"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">{[e.position, e.department].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-base font-bold text-teal-600 dark:text-teal-400">{e.day_off_available}</td>
                    <td className="px-3 py-2 text-right">{e.day_off_pending}</td>
                    <td className="px-3 py-2 text-right">{e.day_off_used}</td>
                    <td className="px-3 py-2 text-right">{e.day_off_granted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5" data-testid="adjust-history">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold"><History className="h-4 w-4 text-primary" /> История отгулов</h3>
          <span className="text-xs text-muted-foreground">Показано {visibleHistory.length} из {history.length}</span>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <Input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Сотрудник или комментарий…" aria-label="Поиск по истории" className="h-9 w-60 text-sm" />
          <SelectDropdown options={departmentOptions} value={historyDept} onChange={setHistoryDept} className="w-52" />
          <SelectDropdown options={authorOptions} value={historyAuthor} onChange={setHistoryAuthor} className="w-52" />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            с <Input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} aria-label="Начислено с" className="h-9 w-36 text-sm" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            по <Input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} aria-label="Начислено по" className="h-9 w-36 text-sm" />
          </label>
          {historyUserName && (
            <button
              type="button"
              onClick={() => setHistoryUserId(null)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
            >
              {historyUserName} <X className="h-3 w-3" />
            </button>
          )}
          {historyFiltered && (
            <Button variant="ghost" size="sm" onClick={resetHistoryFilters}>Сбросить</Button>
          )}
        </div>
        {visibleHistory.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{historyFiltered ? 'Ничего не найдено' : 'История пуста'}</p>
        ) : (
          <ul className="divide-y divide-border/60 text-sm">
            {visibleHistory.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString('ru-RU')}</span>
                <span className="min-w-[10rem] font-medium">{h.user_name}</span>
                <Signed days={h.days} />
                <span className="text-muted-foreground">отгул</span>
                <span className="min-w-0 flex-1">{h.comment}</span>
                {h.created_by_name && <span className="text-xs text-muted-foreground">{h.created_by_name}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
