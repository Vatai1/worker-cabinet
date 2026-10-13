import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, ChevronLeft, ChevronRight, Trash2, Loader2 } from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { apiGet, apiPut, apiDelete } from '@/shared/lib/apiClient'
import { invalidateProductionCalendar, type ProductionDay, type ProductionDayKind } from '@/shared/lib/productionCalendar'
import { cn, getErrorMessage } from '@/shared/lib/utils'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const KINDS: { value: ProductionDayKind; label: string; hint: string; cell: string; badge: string }[] = [
  { value: 'holiday', label: 'Праздник', hint: 'не входит в отпуск', cell: 'bg-red-500/15 text-red-600 dark:text-red-400 font-semibold', badge: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  { value: 'transfer', label: 'Выходной', hint: 'входит в отпуск', cell: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  { value: 'shortened', label: 'Сокращённый день', hint: 'рабочий, на час короче', cell: 'ring-1 ring-inset ring-primary/50 text-primary', badge: 'bg-primary/10 text-primary' },
]
const kindOf = (k: ProductionDayKind) => KINDS.find((x) => x.value === k) ?? KINDS[0]

const isoOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const ruDate = (iso: string) => iso.split('-').reverse().join('.')

export function ProductionCalendarCard() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [days, setDays] = useState<ProductionDay[] | null>(null)
  const [form, setForm] = useState<{ day: string; kind: ProductionDayKind; description: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ days: ProductionDay[] }>(`/vacation/production-calendar?year=${year}`)
      setDays(res.days)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setDays([])
    }
  }, [year])

  useEffect(() => { setDays(null); setForm(null); load() }, [load])

  const byDay = useMemo(() => new Map((days ?? []).map((d) => [d.day, d])), [days])

  const pick = (day: string) => {
    const existing = byDay.get(day)
    setForm({ day, kind: existing?.kind ?? 'holiday', description: existing?.description ?? '' })
  }

  const changed = async (day: string) => {
    invalidateProductionCalendar(Number(day.slice(0, 4)))
    if (Number(day.slice(0, 4)) !== year) setYear(Number(day.slice(0, 4)))
    else await load()
  }

  const save = async () => {
    if (!form?.day) return
    setSaving(true)
    try {
      await apiPut(`/vacation/production-calendar/${form.day}`, { kind: form.kind, description: form.description })
      toast.success(`${ruDate(form.day)}: ${kindOf(form.kind).label.toLowerCase()}`)
      await changed(form.day)
      setForm(null)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (day: string) => {
    setSaving(true)
    try {
      await apiDelete(`/vacation/production-calendar/${day}`)
      toast.success(`${ruDate(day)} — обычный день`)
      await changed(day)
      if (form?.day === day) setForm(null)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
              <CalendarDays className="h-[18px] w-[18px]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Праздники и выходные</h2>
              <p className="text-xs text-muted-foreground">Производственный календарь: праздники не входят в ежегодный отпуск. Нажмите на день, чтобы изменить его. Календарь общий для всех организаций</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y - 1)} aria-label="Предыдущий год"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="w-20 text-center text-sm font-semibold">{year} год</span>
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y + 1)} aria-label="Следующий год"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {KINDS.map((k) => (
            <span key={k.value} className="inline-flex items-center gap-1.5">
              <span className={cn('h-4 w-4 rounded', k.cell)} />
              {k.label} — {k.hint}
            </span>
          ))}
        </div>

        {form && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Дата</span>
              <Input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className="w-40" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Тип дня</span>
              <SelectDropdown
                value={form.kind}
                onChange={(v) => setForm({ ...form, kind: v as ProductionDayKind })}
                options={KINDS.map((k) => ({ value: k.value, label: `${k.label} (${k.hint})` }))}
                className="w-64"
              />
            </label>
            <label className="min-w-[200px] flex-1 space-y-1 text-xs text-muted-foreground">
              <span>Название</span>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Например, День города" />
            </label>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !form.day}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}</Button>
              {byDay.has(form.day) && (
                <Button variant="outline" onClick={() => remove(form.day)} disabled={saving}>Сделать обычным днём</Button>
              )}
              <Button variant="ghost" onClick={() => setForm(null)}>Отмена</Button>
            </div>
          </div>
        )}

        {!days ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {days.length === 0 && (
              <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                Производственный календарь на {year} год не загружен — праздники считаются по ст. 112 ТК РФ без переносов. Добавленные вручную дни заменят этот расчёт.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MONTHS.map((name, m) => {
                const total = new Date(year, m + 1, 0).getDate()
                const lead = (new Date(year, m, 1).getDay() + 6) % 7
                return (
                  <div key={name} className="rounded-xl border border-border p-3">
                    <p className="mb-2 text-center text-sm font-semibold">{name}</p>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
                      {WEEKDAYS.map((w) => <span key={w} className="text-muted-foreground">{w}</span>)}
                      {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
                      {Array.from({ length: total }, (_, i) => {
                        const iso = isoOf(year, m, i + 1)
                        const entry = byDay.get(iso)
                        const weekend = (lead + i) % 7 >= 5
                        return (
                          <button
                            key={iso}
                            type="button"
                            title={entry ? `${kindOf(entry.kind).label}${entry.description ? `: ${entry.description}` : ''}` : undefined}
                            onClick={() => pick(iso)}
                            className={cn(
                              'h-7 rounded-md transition-colors hover:ring-2 hover:ring-primary/40',
                              entry ? kindOf(entry.kind).cell : weekend ? 'bg-muted text-muted-foreground' : 'text-foreground',
                              form?.day === iso && 'ring-2 ring-primary'
                            )}
                          >
                            {i + 1}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {days.length > 0 && (
              <div className="divide-y divide-border rounded-xl border border-border">
                {days.map((d) => (
                  <div key={d.day} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <button type="button" onClick={() => pick(d.day)} className="w-24 text-left font-medium hover:text-primary">{ruDate(d.day)}</button>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', kindOf(d.kind).badge)}>{kindOf(d.kind).label}</span>
                    <span className="flex-1 truncate text-muted-foreground">{d.description}</span>
                    {d.manual && <span className="text-xs text-muted-foreground">изменено вручную</span>}
                    <Button variant="ghost" size="icon" onClick={() => remove(d.day)} disabled={saving} aria-label="Удалить"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
