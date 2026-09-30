import { useState } from 'react'
import { toast } from 'sonner'
import { Coffee } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { apiPost } from '@/shared/lib/apiClient'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { useLeaveAdjustments, DAY_OFF_HINT, type LeaveAdjustment } from '@/modules/vacation/lib/dayOffs'
import { useCan } from '@/shared/lib/permissions'
import { useModulesStore } from '@/shared/store/modulesStore'

const KIND_OPTIONS = [
  { value: 'day_off', label: 'Отгулы' },
  { value: 'vacation', label: 'Дни отпуска' },
]

export function LeaveAdjustmentsSection({
  userId,
  year,
  onVacationAdjusted,
}: {
  userId: number | string
  year: number
  onVacationAdjusted?: (days: number, year: number) => void
}) {
  const { dayOffs, items, reload } = useLeaveAdjustments(userId)
  const dayOffsEnabled = useModulesStore((s) => s.isModuleEnabled('day_offs'))
  const mayGrantDayOffs = useCan('day_off:grant')
  const mayGrantVacation = useCan('vacation:manage')
  const kindOptions = KIND_OPTIONS.filter((o) => (o.value === 'day_off' ? mayGrantDayOffs && dayOffsEnabled : mayGrantVacation))
  const [kind, setKind] = useState<LeaveAdjustment['kind']>(kindOptions[0]?.value as LeaveAdjustment['kind'] ?? 'vacation')
  const [days, setDays] = useState('1')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const value = Number(days)
    if (!Number.isInteger(value) || value === 0) {
      toast.error('Укажите целое число дней, не ноль')
      return
    }
    if (!comment.trim()) {
      toast.error('Укажите комментарий — за что начисляются дни')
      return
    }
    setSaving(true)
    try {
      await apiPost('/vacation/adjustments', { userId: Number(userId), kind, days: value, comment: comment.trim(), year })
      toast.success(kind === 'day_off' ? 'Отгулы начислены' : `Дни отпуска за ${year} начислены`)
      if (kind === 'vacation') onVacationAdjusted?.(value, year)
      setComment('')
      setDays('1')
      reload()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (kindOptions.length === 0) return null

  return (
    <section className="pt-5 border-t border-border" data-testid="leave-adjustments">
      <p className="flex items-center gap-2 text-sm font-semibold mb-1">
        <Coffee className="h-4 w-4 text-muted-foreground" /> Начисление отгулов и дней отпуска
      </p>
      {dayOffsEnabled && <p className="mb-3 text-xs text-muted-foreground">
        Отгулов доступно: <span data-testid="hr-day-offs-available" className="font-semibold text-foreground">{dayOffs?.available ?? '—'}</span>
        {dayOffs && dayOffs.pending > 0 && <> · на согласовании {dayOffs.pending}</>}
        {' · '}{DAY_OFF_HINT}
      </p>}
      <div className="grid grid-cols-[1fr_5.5rem] gap-2.5 mb-2.5">
        <SelectDropdown options={kindOptions} value={kind} onChange={(v) => setKind(v as LeaveAdjustment['kind'])} className="w-full min-w-0" />
        <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Количество дней" className="h-9 text-sm" />
      </div>
      <div className="flex gap-2.5">
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={kind === 'day_off' ? 'За что: за работу в выходной 12.10' : `За что (добавится к балансу за ${year})`}
          aria-label="Комментарий к начислению"
          className="h-9 text-sm"
        />
        <Button size="sm" onClick={submit} disabled={saving}>Начислить</Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Отрицательное число списывает дни.</p>
      {items.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs">
          {items.map((a) => (
            <li key={a.id} className="flex items-baseline gap-2">
              <span className={cn('font-semibold tabular-nums', a.days > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                {a.days > 0 ? '+' : ''}{a.days}
              </span>
              <span className="shrink-0 text-muted-foreground">{a.kind === 'day_off' ? 'отгул' : `отпуск ${a.year}`}</span>
              <span className="min-w-0 flex-1 truncate" title={a.comment}>{a.comment}</span>
              <span className="shrink-0 text-muted-foreground">{new Date(a.created_at).toLocaleDateString('ru-RU')}{a.created_by_name ? ` · ${a.created_by_name}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
