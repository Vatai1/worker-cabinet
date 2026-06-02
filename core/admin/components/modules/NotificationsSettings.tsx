import { useState } from 'react'
import { Send, RefreshCw, Eye } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useModuleSettingsStore } from '@/core/admin/store/moduleSettingsStore'
import { SettingField, SettingToggle, SettingInput, SettingSelect, SettingSection, SettingDivider } from './SettingFormElements'
import type { NotificationsSettings } from './types'

interface Props {
  activeTab: string
}

const TEMPLATES = [
  { id: 'meeting_invite', name: 'Приглашение на встречу', defaultSubject: 'Приглашение: {{event_title}}', defaultBody: 'Здравствуйте, {{user_name}}!\n\nВы приглашены на «{{event_title}}».\n\nДата: {{date}}\n\nПожалуйста, подтвердите участие.' },
  { id: 'event_reminder', name: 'Напоминание о событии', defaultSubject: 'Напоминание: {{event_title}}', defaultBody: 'Здравствуйте, {{user_name}}!\n\nНапоминаем о событии «{{event_title}}».\n\nДата: {{date}}' },
  { id: 'vacation_approved', name: 'Отпуск одобрен', defaultSubject: 'Ваша заявка на отпуск одобрена', defaultBody: 'Здравствуйте, {{user_name}}!\n\nВаша заявка на отпуск на {{date}} одобрена.' },
  { id: 'vacation_rejected', name: 'Отпуск отклонён', defaultSubject: 'Ваша заявка на отпуск отклонена', defaultBody: 'Здравствуйте, {{user_name}}!\n\nК сожалению, ваша заявка на отпуск на {{date}} отклонена.\n\nСвяжитесь с HR-отделом для уточнения.' },
]

interface LogEntry {
  time: string
  recipient: string
  channel: string
  type: string
  status: 'delivered' | 'error' | 'queued'
}

const MOCK_LOGS: LogEntry[] = [
  { time: '10:32', recipient: 'ivanov@example.com', channel: 'Email', type: 'Отпуск одобрен', status: 'delivered' },
  { time: '10:28', recipient: 'petrov@example.com', channel: 'Push', type: 'Напоминание', status: 'delivered' },
  { time: '10:15', recipient: 'sidorov@example.com', channel: 'Email', type: 'Приглашение', status: 'error' },
  { time: '09:50', recipient: 'kozlov@example.com', channel: 'Teams', type: 'Согласование', status: 'queued' },
]

const STATUS_STYLES: Record<string, string> = {
  delivered: 'bg-[rgba(16,185,129,0.15)] text-[#10B981] border border-[rgba(16,185,129,0.3)]',
  error: 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)]',
  queued: 'bg-[rgba(245,158,11,0.15)] text-[#F59E0B] border border-[rgba(245,158,11,0.3)]',
}

const STATUS_LABELS: Record<string, string> = {
  delivered: 'Доставлено',
  error: 'Ошибка',
  queued: 'В очереди',
}

export function NotificationsSettings({ activeTab }: Props) {
  const settings = useModuleSettingsStore((s) => s.getSettings<NotificationsSettings>('notifications'))
  const updateSetting = useModuleSettingsStore((s) => s.updateSetting)

  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [smtpChecking, setSmtpChecking] = useState(false)
  const [logChannelFilter, setLogChannelFilter] = useState('all')
  const [logStatusFilter, setLogStatusFilter] = useState('all')

  const update = (key: keyof NotificationsSettings, value: unknown) => {
    updateSetting('notifications', key, value)
  }

  const handleEditTemplate = (templateId: string) => {
    const tmpl = TEMPLATES.find((t) => t.id === templateId)
    if (!tmpl) return
    setEditingTemplate(templateId)
    setTemplateSubject(tmpl.defaultSubject)
    setTemplateBody(tmpl.defaultBody)
  }

  const handleSaveTemplate = () => {
    setEditingTemplate(null)
  }

  const handleCancelTemplate = () => {
    setEditingTemplate(null)
  }

  const handleResetTemplate = (templateId: string) => {
    const tmpl = TEMPLATES.find((t) => t.id === templateId)
    if (!tmpl) return
    setTemplateSubject(tmpl.defaultSubject)
    setTemplateBody(tmpl.defaultBody)
  }

  const handleCheckSmtp = async () => {
    setSmtpChecking(true)
    await new Promise((r) => setTimeout(r, 1500))
    setSmtpChecking(false)
  }

  const filteredLogs = MOCK_LOGS.filter((log) => {
    if (logChannelFilter !== 'all' && log.channel !== logChannelFilter) return false
    if (logStatusFilter !== 'all' && log.status !== logStatusFilter) return false
    return true
  })

  if (activeTab === 'channels') {
    return (
      <div className="space-y-6">
        <SettingSection title="Email уведомления">
          <div className="space-y-4">
            <SettingToggle
              label="Email уведомления"
              checked={settings.emailEnabled}
              onChange={(v) => update('emailEnabled', v)}
            />
            {settings.emailEnabled && (
              <div className="space-y-4 pl-0">
                <SettingField label="SMTP сервер">
                  <SettingInput
                    value={settings.smtpServer}
                    onChange={(v) => update('smtpServer', v)}
                    placeholder="smtp.example.com"
                  />
                </SettingField>
                <SettingField label="Порт">
                  <SettingInput
                    value={settings.smtpPort}
                    onChange={(v) => update('smtpPort', Number(v) || 0)}
                    type="number"
                    placeholder="587"
                  />
                </SettingField>
                <SettingField label="Логин">
                  <SettingInput
                    value={settings.smtpLogin}
                    onChange={(v) => update('smtpLogin', v)}
                    placeholder="user@example.com"
                  />
                </SettingField>
                <SettingField label="Пароль">
                  <SettingInput
                    value={settings.smtpPassword}
                    onChange={(v) => update('smtpPassword', v)}
                    type="password"
                    placeholder="••••••••"
                  />
                </SettingField>
                <SettingToggle
                  label="TLS"
                  checked={settings.smtpTls}
                  onChange={(v) => update('smtpTls', v)}
                />
                <button
                  type="button"
                  onClick={handleCheckSmtp}
                  disabled={smtpChecking}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-primary bg-transparent transition-colors duration-200 hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={cn('w-4 h-4', smtpChecking && 'animate-spin')} />
                  {smtpChecking ? 'Проверка...' : 'Проверить соединение'}
                </button>
              </div>
            )}
          </div>
        </SettingSection>

        <SettingDivider />

        <SettingSection title="Push-уведомления">
          <SettingToggle
            label="Push-уведомления браузера"
            checked={settings.pushEnabled}
            onChange={(v) => update('pushEnabled', v)}
          />
        </SettingSection>

        <SettingDivider />

        <SettingSection title="Microsoft Teams">
          <div className="space-y-4">
            <SettingToggle
              label="Microsoft Teams"
              checked={settings.teamsEnabled}
              onChange={(v) => update('teamsEnabled', v)}
            />
            {settings.teamsEnabled && (
              <SettingField label="Webhook URL">
                <SettingInput
                  value={settings.teamsWebhookUrl}
                  onChange={(v) => update('teamsWebhookUrl', v)}
                  placeholder="https://outlook.office.com/webhook/..."
                />
              </SettingField>
            )}
          </div>
        </SettingSection>

        <SettingDivider />

        <SettingSection title="Slack">
          <div className="space-y-4">
            <SettingToggle
              label="Slack"
              checked={settings.slackEnabled}
              onChange={(v) => update('slackEnabled', v)}
            />
            {settings.slackEnabled && (
              <SettingField label="Webhook URL">
                <SettingInput
                  value={settings.slackWebhookUrl}
                  onChange={(v) => update('slackWebhookUrl', v)}
                  placeholder="https://hooks.slack.com/services/..."
                />
              </SettingField>
            )}
          </div>
        </SettingSection>

        <SettingDivider />

        <SettingSection title="SMS">
          <div className="space-y-4">
            <SettingToggle
              label="SMS"
              checked={settings.smsEnabled}
              onChange={(v) => update('smsEnabled', v)}
            />
            {settings.smsEnabled && (
              <div className="space-y-4">
                <SettingField label="Провайдер">
                  <SettingSelect
                    value={settings.smsProvider}
                    onChange={(v) => update('smsProvider', v)}
                    options={[
                      { value: 'twilio', label: 'Twilio' },
                      { value: 'smsc', label: 'SMSC' },
                      { value: 'other', label: 'Другой' },
                    ]}
                  />
                </SettingField>
                <SettingField label="API ключ">
                  <SettingInput
                    value={settings.smsApiKey}
                    onChange={(v) => update('smsApiKey', v)}
                    placeholder="••••••••"
                  />
                </SettingField>
                <SettingField label="Sender ID">
                  <SettingInput
                    value={settings.smsSenderId}
                    onChange={(v) => update('smsSenderId', v)}
                    placeholder="MyCompany"
                  />
                </SettingField>
              </div>
            )}
          </div>
        </SettingSection>
      </div>
    )
  }

  if (activeTab === 'templates') {
    return (
      <div className="space-y-4">
        {TEMPLATES.map((tmpl) => (
          <div key={tmpl.id} className="rounded-xl border border-border bg-card">
            {editingTemplate === tmpl.id ? (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{tmpl.name}</span>
                </div>
                <SettingField label="Тема письма">
                  <SettingInput
                    value={templateSubject}
                    onChange={setTemplateSubject}
                    placeholder="Тема уведомления"
                  />
                </SettingField>
                <SettingField label="Тело письма">
                  <textarea
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    rows={5}
                    className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-primary resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Доступные переменные: {'{{user_name}}'}, {'{{event_title}}'}, {'{{date}}'}</p>
                </SettingField>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/80 active:bg-primary bg-primary"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelTemplate}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-foreground border border-border transition-colors duration-200 hover:bg-secondary bg-secondary"
                  >
                    Отменить
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetTemplate(tmpl.id)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground hover:bg-secondary"
                  >
                    Сбросить по умолчанию
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-foreground">{tmpl.name}</span>
                <button
                  type="button"
                  onClick={() => handleEditTemplate(tmpl.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-primary bg-transparent transition-colors duration-200 hover:bg-primary/10"
                >
                  <Eye className="w-4 h-4" />
                  Редактировать
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (activeTab === 'frequency') {
    return (
      <div className="space-y-6">
        <SettingSection title="Ограничения">
          <div className="space-y-4">
            <SettingField label="Максимум уведомлений в час">
              <SettingInput
                value={settings.maxPerHour}
                onChange={(v) => update('maxPerHour', Number(v) || 0)}
                type="number"
                placeholder="100"
              />
            </SettingField>
            <SettingToggle
              label="Группировать похожие уведомления"
              checked={settings.groupSimilar}
              onChange={(v) => update('groupSimilar', v)}
            />
            {settings.groupSimilar && (
              <SettingField label="Интервал группировки">
                <SettingInput
                  value={settings.groupInterval}
                  onChange={(v) => update('groupInterval', Number(v) || 0)}
                  type="number"
                  suffix="мин"
                  placeholder="30"
                />
              </SettingField>
            )}
          </div>
        </SettingSection>

        <SettingDivider />

        <SettingSection title="Ночной режим">
          <div className="space-y-4">
            <SettingToggle
              label="Не отправлять ночью"
              checked={settings.nightMode}
              onChange={(v) => update('nightMode', v)}
            />
            {settings.nightMode && (
              <div className="grid grid-cols-2 gap-4">
                <SettingField label="Ночной интервал с">
                  <SettingInput
                    value={settings.nightStart}
                    onChange={(v) => update('nightStart', v)}
                    type="time"
                  />
                </SettingField>
                <SettingField label="Ночной интервал до">
                  <SettingInput
                    value={settings.nightEnd}
                    onChange={(v) => update('nightEnd', v)}
                    type="time"
                  />
                </SettingField>
              </div>
            )}
          </div>
        </SettingSection>
      </div>
    )
  }

  if (activeTab === 'logs') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <SettingSelect
            value={logChannelFilter}
            onChange={setLogChannelFilter}
            options={[
              { value: 'all', label: 'Все каналы' },
              { value: 'Email', label: 'Email' },
              { value: 'Push', label: 'Push' },
              { value: 'Teams', label: 'Teams' },
              { value: 'SMS', label: 'SMS' },
            ]}
          />
          <SettingSelect
            value={logStatusFilter}
            onChange={setLogStatusFilter}
            options={[
              { value: 'all', label: 'Все статусы' },
              { value: 'delivered', label: 'Доставлено' },
              { value: 'error', label: 'Ошибка' },
              { value: 'queued', label: 'В очереди' },
            ]}
          />
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-secondary">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Время</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Получатель</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Канал</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Тип</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Статус</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log, i) => (
                <tr
                  key={i}
                  className="bg-card border-b border-border transition-colors duration-150 hover:bg-secondary"
                >
                  <td className="px-4 py-3 text-sm text-foreground">{log.time}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{log.recipient}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{log.channel}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{log.type}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[log.status])}>
                      {STATUS_LABELS[log.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {log.status === 'error' && (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg text-sm text-primary bg-transparent transition-colors duration-200 hover:bg-primary/10"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Повторить отправку
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Нет записей
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return null
}
