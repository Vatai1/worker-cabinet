import React, { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useModuleSettingsStore } from '@/core/admin/store/moduleSettingsStore'
import { SettingField, SettingToggle, SettingInput, SettingSelect, SettingSection, SettingDivider } from './SettingFormElements'
import type { CalendarSettings } from './types'

interface Props {
  activeTab: string
}

const TIMEZONE_OPTIONS = [
  { value: 'Europe/Moscow', label: 'Europe/Moscow' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'UTC', label: 'UTC' },
]

const DATE_FORMAT_OPTIONS = [
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
]

const TIME_FORMAT_OPTIONS = [
  { value: '24', label: '24ч' },
  { value: '12', label: '12ч' },
]

const VIEW_OPTIONS = [
  { value: 'month', label: 'Месяц' },
  { value: 'week', label: 'Неделя' },
  { value: 'day', label: 'День' },
  { value: 'list', label: 'Список' },
]

const SYNC_FREQUENCY_OPTIONS = [
  { value: '5min', label: '5 мин' },
  { value: '15min', label: '15 мин' },
  { value: '30min', label: '30 мин' },
  { value: '1hour', label: '1 час' },
  { value: 'manual', label: 'Вручную' },
]

const PRESET_COLORS = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

const PERMISSION_ROWS = [
  { action: 'Создание событий', admin: true, manager: true, user: true },
  { action: 'Редактирование своих', admin: true, manager: true, user: true },
  { action: 'Редактирование чужих', admin: true, manager: false, user: false },
  { action: 'Удаление своих', admin: true, manager: true, user: false },
  { action: 'Удаление чужих', admin: true, manager: false, user: false },
]

export function CalendarSettings({ activeTab }: Props) {
  const settings = useModuleSettingsStore((s) => s.getSettings<CalendarSettings>('calendar'))
  const updateSetting = useModuleSettingsStore((s) => s.updateSetting)

  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0])
  const [showAddCat, setShowAddCat] = useState(false)

  const handle = (key: keyof CalendarSettings, value: unknown) => {
    updateSetting('calendar', key, value)
  }

  const addCategory = () => {
    if (!newCatName.trim()) return
    const cats = [...settings.categories, { name: newCatName.trim(), color: newCatColor }]
    handle('categories', cats)
    setNewCatName('')
    setNewCatColor(PRESET_COLORS[0])
    setShowAddCat(false)
  }

  const removeCategory = (index: number) => {
    const cats = settings.categories.filter((_, i) => i !== index)
    handle('categories', cats)
  }

  if (activeTab === 'general') {
    return (
      <div className="space-y-6">
        <SettingSection title="Основные">
          <SettingToggle
            label="Модуль активен"
            checked={settings.active}
            onChange={(v) => handle('active', v)}
          />
          <SettingDivider />
          <SettingField label="Таймзона по умолчанию">
            <SettingSelect
              value={settings.timezone}
              onChange={(v) => handle('timezone', v)}
              options={TIMEZONE_OPTIONS}
            />
          </SettingField>
          <SettingField label="Формат даты">
            <SettingSelect
              value={settings.dateFormat}
              onChange={(v) => handle('dateFormat', v)}
              options={DATE_FORMAT_OPTIONS}
            />
          </SettingField>
          <SettingField label="Формат времени">
            <SettingSelect
              value={settings.timeFormat}
              onChange={(v) => handle('timeFormat', v)}
              options={TIME_FORMAT_OPTIONS}
            />
          </SettingField>
        </SettingSection>

        <SettingDivider />

        <SettingSection title="Рабочее время">
          <SettingField label="Рабочие часы с">
            <SettingInput
              type="time"
              value={settings.workHoursStart}
              onChange={(v) => handle('workHoursStart', v)}
            />
          </SettingField>
          <SettingField label="Рабочие часы до">
            <SettingInput
              type="time"
              value={settings.workHoursEnd}
              onChange={(v) => handle('workHoursEnd', v)}
            />
          </SettingField>
          <SettingToggle
            label="Показывать выходные"
            checked={settings.showWeekends}
            onChange={(v) => handle('showWeekends', v)}
          />
          <SettingToggle
            label="Показывать номера недель"
            checked={settings.showWeekNumbers}
            onChange={(v) => handle('showWeekNumbers', v)}
          />
        </SettingSection>
      </div>
    )
  }

  if (activeTab === 'views') {
    return (
      <div className="space-y-6">
        <SettingSection title="Доступные виды">
          <SettingToggle
            label="Доступен вид Месяц"
            checked={settings.viewMonth}
            onChange={(v) => handle('viewMonth', v)}
          />
          <SettingToggle
            label="Доступен вид Неделя"
            checked={settings.viewWeek}
            onChange={(v) => handle('viewWeek', v)}
          />
          <SettingToggle
            label="Доступен вид День"
            checked={settings.viewDay}
            onChange={(v) => handle('viewDay', v)}
          />
          <SettingToggle
            label="Доступен вид Список"
            checked={settings.viewList}
            onChange={(v) => handle('viewList', v)}
          />
          <SettingDivider />
          <SettingField label="Вид по умолчанию">
            <SettingSelect
              value={settings.defaultView}
              onChange={(v) => handle('defaultView', v)}
              options={VIEW_OPTIONS}
            />
          </SettingField>
        </SettingSection>
      </div>
    )
  }

  if (activeTab === 'events') {
    return (
      <div className="space-y-6">
        <SettingSection title="Ограничения">
          <SettingField label="Минимальная длительность события">
            <SettingInput
              type="number"
              value={String(settings.minEventDuration)}
              onChange={(v) => handle('minEventDuration', parseInt(v) || 0)}
              suffix="мин"
            />
          </SettingField>
          <SettingField label="Максимальная длительность">
            <SettingInput
              type="number"
              value={String(settings.maxEventDuration)}
              onChange={(v) => handle('maxEventDuration', parseInt(v) || 0)}
              suffix="час"
            />
          </SettingField>
          <SettingToggle
            label="Разрешить события вне рабочих часов"
            checked={settings.allowOutsideWorkHours}
            onChange={(v) => handle('allowOutsideWorkHours', v)}
          />
          <SettingToggle
            label="Разрешить пересечение событий"
            checked={settings.allowEventOverlap}
            onChange={(v) => handle('allowEventOverlap', v)}
          />
        </SettingSection>

        <SettingDivider />

        <SettingSection title="Категории событий">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {settings.categories.map((cat, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="flex-1 text-sm text-foreground truncate">{cat.name}</span>
                <button
                  type="button"
                  onClick={() => removeCategory(idx)}
                  className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {showAddCat ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 p-3 rounded-lg border border-border bg-card">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Название</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  placeholder="Название категории"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Цвет</label>
                <div className="flex items-center gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCatColor(c)}
                      className={cn(
                        'w-6 h-6 rounded-full transition-all',
                        newCatColor === c ? 'ring-2 ring-white ring-offset-2 scale-110' : 'hover:scale-110',
                      )}
                      style={{ backgroundColor: c, ['--tw-ring-offset-color' as string]: 'hsl(var(--card))' } as React.CSSProperties}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addCategory}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-primary-foreground transition-colors bg-primary"
                >
                  Добавить
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddCat(false); setNewCatName('') }}
                  className="px-3 py-2 rounded-lg text-sm text-foreground border border-border transition-colors hover:bg-secondary bg-secondary"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddCat(true)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors w-full"
            >
              <Plus className="w-4 h-4" />
              Добавить категорию
            </button>
          )}
        </SettingSection>
      </div>
    )
  }

  if (activeTab === 'integrations') {
    return (
      <div className="space-y-6">
        <SettingSection title="Exchange">
          <SettingToggle
            label="Синхронизация с Exchange"
            checked={settings.syncExchange}
            onChange={(v) => handle('syncExchange', v)}
          />
          <SettingDivider />
          <SettingField label="EWS URL">
            <SettingInput
              value={settings.ewsUrl}
              onChange={(v) => handle('ewsUrl', v)}
              placeholder="https://outlook.office365.com/EWS/Exchange.asmx"
            />
          </SettingField>
          <SettingField label="OAuth Client ID">
            <SettingInput
              value={settings.oauthClientId}
              onChange={(v) => handle('oauthClientId', v)}
              placeholder="client-id"
            />
          </SettingField>
          <SettingField label="OAuth Secret">
            <SettingInput
              type="password"
              value={settings.oauthSecret}
              onChange={(v) => handle('oauthSecret', v)}
              placeholder="client-secret"
            />
          </SettingField>
          <SettingField label="Частота синхронизации">
            <SettingSelect
              value={settings.syncFrequency}
              onChange={(v) => handle('syncFrequency', v)}
              options={SYNC_FREQUENCY_OPTIONS}
            />
          </SettingField>
          <SettingToggle
            label="Двусторонняя синхронизация"
            checked={settings.bidirectionalSync}
            onChange={(v) => handle('bidirectionalSync', v)}
          />
        </SettingSection>
      </div>
    )
  }

  if (activeTab === 'permissions') {
    return (
      <div className="space-y-6">
        <SettingSection title="Права доступа по ролям">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-secondary">
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Роль</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Право</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Доступ</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_ROWS.map((row) => (
                  <React.Fragment key={row.action}>
                    <tr className="border-t border-border transition-colors hover:bg-secondary bg-card">
                      <td className="px-4 py-2 text-sm text-primary font-medium">Admin</td>
                      <td className="px-4 py-2 text-sm text-foreground row-span-3 align-top" rowSpan={3}>{row.action}</td>
                      <td className="px-4 py-2">{row.admin ? <span style={{ color: '#10B981' }}>✅</span> : <span style={{ color: '#EF4444' }}>❌</span>}</td>
                    </tr>
                    <tr className="transition-colors hover:bg-secondary bg-card">
                      <td className="px-4 py-2 text-sm text-muted-foreground">Менеджер</td>
                      <td className="px-4 py-2">{row.manager ? <span style={{ color: '#10B981' }}>✅</span> : <span style={{ color: '#EF4444' }}>❌</span>}</td>
                    </tr>
                    <tr className="transition-colors hover:bg-secondary bg-card">
                      <td className="px-4 py-2 text-sm text-muted-foreground">Пользователь</td>
                      <td className="px-4 py-2">{row.user ? <span style={{ color: '#10B981' }}>✅</span> : <span style={{ color: '#EF4444' }}>❌</span>}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </SettingSection>
      </div>
    )
  }

  return null
}
