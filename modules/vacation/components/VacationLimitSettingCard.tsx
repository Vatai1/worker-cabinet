import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Scale } from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Switch } from '@/shared/components/ui/Switch'
import { getErrorMessage } from '@/shared/lib/utils'
import { useVacationSettingsStore } from '@/modules/vacation/store/vacationSettingsStore'

export function VacationLimitSettingCard() {
  const allow = useVacationSettingsStore((s) => s.allowOverBalance)
  const load = useVacationSettingsStore((s) => s.load)
  const save = useVacationSettingsStore((s) => s.setAllowOverBalance)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [load])

  const toggle = async (value: boolean) => {
    setSaving(true)
    try {
      await save(value)
      toast.success(value ? 'Заявки сверх положенных дней разрешены' : 'Лимит дней отпуска снова проверяется')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Scale className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Разрешить отпуск сверх положенных дней</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {allow
                ? 'Работники могут подавать заявки и переносы длиннее доступного остатка — баланс уйдёт в минус. Заявка всё равно проходит согласование.'
                : 'Заявку длиннее доступного остатка подать нельзя.'}
            </p>
          </div>
        </div>
        <Switch
          checked={allow}
          onCheckedChange={toggle}
          disabled={saving}
          aria-label="Разрешить отпуск сверх положенных дней"
        />
      </div>
    </Card>
  )
}
