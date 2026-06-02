import { Plus, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useModuleSettingsStore } from '@/core/admin/store/moduleSettingsStore'
import { SettingField, SettingToggle, SettingInput, SettingSelect, SettingSection, SettingDivider } from './SettingFormElements'
import type { VacationSettings } from './types'

const WEEK_OPTIONS = [
  { value: 'mon', label: 'Пн' },
  { value: 'tue', label: 'Вт' },
  { value: 'wed', label: 'Ср' },
  { value: 'thu', label: 'Чт' },
  { value: 'fri', label: 'Пт' },
  { value: 'sat', label: 'Сб' },
  { value: 'sun', label: 'Вс' },
]

const APPROVAL_TYPE_OPTIONS = [
  { value: 'manager', label: 'Руководитель' },
  { value: 'hr', label: 'HR' },
  { value: 'manager+hr', label: 'Руководитель + HR' },
  { value: 'auto', label: 'Авто' },
]

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
  { value: 'teams', label: 'Teams' },
]

interface Props {
  activeTab: string
}

export function VacationSettings({ activeTab }: Props) {
  const settings = useModuleSettingsStore((s) => s.getSettings<VacationSettings>('vacation'))
  const updateSetting = useModuleSettingsStore((s) => s.updateSetting)

  const set = (key: keyof VacationSettings, value: unknown) => updateSetting('vacation', key, value)

  if (activeTab === 'general') return <GeneralTab settings={settings} set={set} />
  if (activeTab === 'approval') return <ApprovalTab settings={settings} set={set} />
  if (activeTab === 'limits') return <LimitsTab settings={settings} set={set} />
  if (activeTab === 'integrations') return <IntegrationsTab settings={settings} set={set} />
  if (activeTab === 'notify') return <NotifyTab settings={settings} set={set} />
  return null
}

interface TabProps {
  settings: VacationSettings
  set: (key: keyof VacationSettings, value: unknown) => void
}

function GeneralTab({ settings, set }: TabProps) {
  return (
    <div className="space-y-6">
      <SettingSection title="Основные">
        <SettingField label="Модуль активен">
          <SettingToggle checked={settings.active} onChange={(v) => set('active', v)} />
        </SettingField>

        <SettingDivider />

        <SettingField label="Разрешить отпуск задним числом">
          <SettingToggle checked={settings.allowRetroactive} onChange={(v) => set('allowRetroactive', v)} />
        </SettingField>

        <SettingField label="Разрешить дробный отпуск (по часам)">
          <SettingToggle checked={settings.allowFractional} onChange={(v) => set('allowFractional', v)} />
        </SettingField>
      </SettingSection>

      <SettingDivider />

      <SettingSection title="Ограничения длительности">
        <SettingField label="Минимальная длительность отпуска">
          <SettingInput
            type="number"
            value={String(settings.minDuration)}
            onChange={(v) => set('minDuration', Number(v))}
            suffix="дней"
          />
        </SettingField>

        <SettingField label="Максимальная длительность отпуска">
          <SettingInput
            type="number"
            value={String(settings.maxDuration)}
            onChange={(v) => set('maxDuration', Number(v))}
            suffix="дней"
          />
        </SettingField>

        <SettingField label="Минимальный стаж для отпуска">
          <SettingInput
            type="number"
            value={String(settings.minTenure)}
            onChange={(v) => set('minTenure', Number(v))}
            suffix="месяцев"
          />
        </SettingField>
      </SettingSection>

      <SettingDivider />

      <SettingSection title="Календарь">
        <SettingField label="Первый день недели для расчёта">
          <SettingSelect
            value={settings.weekStart}
            onChange={(v) => set('weekStart', v)}
            options={WEEK_OPTIONS}
          />
        </SettingField>
      </SettingSection>
    </div>
  )
}

function ApprovalTab({ settings, set }: TabProps) {
  const addStage = () => {
    const stages = [...settings.approvalStages, '']
    set('approvalStages', stages)
  }

  const removeStage = (index: number) => {
    const stages = settings.approvalStages.filter((_, i) => i !== index)
    set('approvalStages', stages)
  }

  const updateStage = (index: number, value: string) => {
    const stages = [...settings.approvalStages]
    stages[index] = value
    set('approvalStages', stages)
  }

  return (
    <div className="space-y-6">
      <SettingSection title="Согласование">
        <SettingField label="Тип согласования">
          <SettingSelect
            value={settings.approvalType}
            onChange={(v) => set('approvalType', v)}
            options={APPROVAL_TYPE_OPTIONS}
          />
        </SettingField>

        <SettingDivider />

        <SettingField label="Требовать комментарий при отклонении">
          <SettingToggle checked={settings.requireRejectComment} onChange={(v) => set('requireRejectComment', v)} />
        </SettingField>

        <SettingField label="Срок рассмотрения заявки">
          <SettingInput
            type="number"
            value={String(settings.reviewDeadline)}
            onChange={(v) => set('reviewDeadline', Number(v))}
            suffix="дней"
          />
        </SettingField>

        <SettingField label="Уведомлять руководителя о просрочке">
          <SettingToggle checked={settings.notifyOverdue} onChange={(v) => set('notifyOverdue', v)} />
        </SettingField>
      </SettingSection>

      <SettingDivider />

      <SettingSection title="Этапы согласования">
        <div className="space-y-2">
          {settings.approvalStages.map((stage, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-6 shrink-0">{index + 1}.</span>
              <input
                type="text"
                value={stage}
                onChange={(e) => updateStage(index, e.target.value)}
                className="flex-1 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-primary"
              />
              <button
                type="button"
                onClick={() => removeStage(index)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors duration-200 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addStage}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors duration-200 w-full"
          >
            <Plus className="w-4 h-4" />
            Добавить этап
          </button>
        </div>
      </SettingSection>
    </div>
  )
}

function LimitsTab({ settings, set }: TabProps) {
  const addRule = () => {
    const rules = [...settings.extraDaysRules, { label: '', days: 0 }]
    set('extraDaysRules', rules)
  }

  const removeRule = (index: number) => {
    const rules = settings.extraDaysRules.filter((_, i) => i !== index)
    set('extraDaysRules', rules)
  }

  const updateRule = (index: number, field: 'label' | 'days', value: string | number) => {
    const rules = [...settings.extraDaysRules]
    rules[index] = { ...rules[index], [field]: value }
    set('extraDaysRules', rules)
  }

  return (
    <div className="space-y-6">
      <SettingSection title="Базовые лимиты">
        <SettingField label="Базовый отпуск в год">
          <SettingInput
            type="number"
            value={String(settings.baseVacationDays)}
            onChange={(v) => set('baseVacationDays', Number(v))}
            suffix="дней"
          />
        </SettingField>

        <SettingDivider />

        <SettingField label="Переводить остаток на следующий год">
          <SettingToggle checked={settings.carryOver} onChange={(v) => set('carryOver', v)} />
        </SettingField>

        {settings.carryOver && (
          <SettingField label="Максимальный перенос">
            <SettingInput
              type="number"
              value={String(settings.maxCarryOver)}
              onChange={(v) => set('maxCarryOver', Number(v))}
              suffix="дней"
            />
          </SettingField>
        )}
      </SettingSection>

      <SettingDivider />

      <SettingSection title="Дополнительные дни">
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_40px] gap-2 px-3.5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-secondary">
            <span>Правило</span>
            <span className="text-center">Дни</span>
            <span />
          </div>
          {settings.extraDaysRules.map((rule, index) => (
            <div
              key={index}
              className={cn(
                'grid grid-cols-[1fr_100px_40px] gap-2 px-3.5 py-2 items-center border-t border-border',
                index % 2 === 0 ? 'bg-transparent' : 'bg-secondary/50',
              )}
            >
              <input
                type="text"
                value={rule.label}
                onChange={(e) => updateRule(index, 'label', e.target.value)}
                placeholder="Название правила"
                className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:border-primary hover:border-primary"
              />
              <input
                type="number"
                value={String(rule.days)}
                onChange={(e) => updateRule(index, 'days', Number(e.target.value))}
                className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground text-center transition-all duration-200 focus:outline-none focus:border-primary hover:border-primary"
              />
              <button
                type="button"
                onClick={() => removeRule(index)}
                className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors duration-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRule}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          Добавить правило
        </button>
      </SettingSection>
    </div>
  )
}

function IntegrationsTab({ settings, set }: TabProps) {
  return (
    <div className="space-y-6">
      <SettingSection title="Exchange">
        <SettingField label="Синхронизировать с Exchange">
          <SettingToggle checked={settings.syncExchange} onChange={(v) => set('syncExchange', v)} />
        </SettingField>

        {settings.syncExchange && (
          <>
            <SettingDivider />
            <SettingField label="Поле в Exchange для отпуска">
              <SettingInput
                value={settings.exchangeField}
                onChange={(v) => set('exchangeField', v)}
                placeholder="categories"
              />
            </SettingField>
          </>
        )}
      </SettingSection>

      <SettingDivider />

      <SettingSection title="Календарь">
        <SettingField label="Создавать событие в календаре при одобрении">
          <SettingToggle checked={settings.createCalendarEvent} onChange={(v) => set('createCalendarEvent', v)} />
        </SettingField>

        {settings.createCalendarEvent && (
          <>
            <SettingDivider />
            <SettingField label="Целевой календарь">
              <SettingSelect
                value={settings.targetCalendar}
                onChange={(v) => set('targetCalendar', v)}
                options={[
                  { value: '', label: 'Выберите календарь' },
                  { value: 'personal', label: 'Личный' },
                  { value: 'company', label: 'Корпоративный' },
                ]}
              />
            </SettingField>
          </>
        )}
      </SettingSection>
    </div>
  )
}

function NotifyTab({ settings, set }: TabProps) {
  return (
    <div className="space-y-6">
      <SettingSection title="Уведомления">
        <NotifyChannelField
          label="Уведомление при подаче заявки"
          enabled={settings.notifyOnSubmit}
          channel={settings.notifyOnSubmitChannel}
          onToggle={(v) => set('notifyOnSubmit', v)}
          onChannel={(v) => set('notifyOnSubmitChannel', v)}
        />

        <SettingDivider />

        <NotifyChannelField
          label="Уведомление при одобрении"
          enabled={settings.notifyOnApprove}
          channel={settings.notifyOnApproveChannel}
          onToggle={(v) => set('notifyOnApprove', v)}
          onChannel={(v) => set('notifyOnApproveChannel', v)}
        />

        <SettingDivider />

        <NotifyChannelField
          label="Уведомление при отклонении"
          enabled={settings.notifyOnReject}
          channel={settings.notifyOnRejectChannel}
          onToggle={(v) => set('notifyOnReject', v)}
          onChannel={(v) => set('notifyOnRejectChannel', v)}
        />
      </SettingSection>

      <SettingDivider />

      <SettingSection title="Напоминания">
        <SettingField label="Напоминание за N дней до отпуска">
          <SettingToggle checked={settings.remindBeforeDays} onChange={(v) => set('remindBeforeDays', v)} />
        </SettingField>

        {settings.remindBeforeDays && (
          <SettingField label="Количество дней">
            <SettingInput
              type="number"
              value={String(settings.remindDays)}
              onChange={(v) => set('remindDays', Number(v))}
              suffix="дней"
            />
          </SettingField>
        )}
      </SettingSection>
    </div>
  )
}

interface NotifyChannelFieldProps {
  label: string
  enabled: boolean
  channel: string
  onToggle: (value: boolean) => void
  onChannel: (value: string) => void
}

function NotifyChannelField({ label, enabled, channel, onToggle, onChannel }: NotifyChannelFieldProps) {
  return (
    <SettingField label={label}>
      <SettingToggle checked={enabled} onChange={onToggle} />
      {enabled && (
        <div className="mt-2">
          <SettingSelect value={channel} onChange={onChannel} options={CHANNEL_OPTIONS} />
        </div>
      )}
    </SettingField>
  )
}
