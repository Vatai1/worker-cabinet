import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useModuleSettingsStore } from '@/core/admin/store/moduleSettingsStore'
import { SettingField, SettingToggle, SettingInput, SettingSelect, SettingSection, SettingDivider, SettingTextarea } from './SettingFormElements'
import type { AuthSettings } from './types'

interface Props {
  activeTab: string
}

const AUTH_TYPE_OPTIONS = [
  { value: 'local', label: 'Локальная' },
  { value: 'ldap', label: 'LDAP' },
  { value: 'saml', label: 'SAML' },
  { value: 'oauth2', label: 'OAuth2' },
]

const MFA_TYPE_OPTIONS = [
  { value: 'disabled', label: 'Отключена' },
  { value: 'optional', label: 'Опциональна' },
  { value: 'required', label: 'Обязательна' },
]

const EMPTY_SSO_PROVIDER = {
  name: '',
  clientId: '',
  clientSecret: '',
  authUrl: '',
  tokenUrl: '',
  scopes: '',
}

export function AuthSettings({ activeTab }: Props) {
  const settings = useModuleSettingsStore((s) => s.getSettings<AuthSettings>('auth'))
  const updateSetting = useModuleSettingsStore((s) => s.updateSetting)

  const [addingProvider, setAddingProvider] = useState(false)
  const [newProvider, setNewProvider] = useState(EMPTY_SSO_PROVIDER)

  const set = <K extends keyof AuthSettings>(key: K, value: AuthSettings[K]) => {
    updateSetting('auth', key, value)
  }

  const renderGeneral = () => (
    <div className="space-y-6">
      <SettingSection title="Основные">
        <SettingField label="Модуль активен">
          <SettingToggle checked={settings.active} onChange={(v) => set('active', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Тип авторизации">
          <SettingSelect
            value={settings.authType}
            onChange={(v) => set('authType', v)}
            options={AUTH_TYPE_OPTIONS}
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="Разрешить регистрацию">
          <SettingToggle checked={settings.allowRegistration} onChange={(v) => set('allowRegistration', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Подтверждение email при регистрации">
          <SettingToggle checked={settings.confirmEmail} onChange={(v) => set('confirmEmail', v)} />
        </SettingField>
      </SettingSection>
    </div>
  )

  const renderPassword = () => (
    <div className="space-y-6">
      <SettingSection title="Требования к паролю">
        <SettingField label="Минимальная длина">
          <SettingInput
            type="number"
            value={String(settings.minLength)}
            onChange={(v) => set('minLength', parseInt(v) || 0)}
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="Требовать заглавную букву">
          <SettingToggle checked={settings.requireUppercase} onChange={(v) => set('requireUppercase', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Требовать строчную букву">
          <SettingToggle checked={settings.requireLowercase} onChange={(v) => set('requireLowercase', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Требовать цифру">
          <SettingToggle checked={settings.requireDigit} onChange={(v) => set('requireDigit', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Требовать спецсимвол">
          <SettingToggle checked={settings.requireSpecial} onChange={(v) => set('requireSpecial', v)} />
        </SettingField>
      </SettingSection>
      <SettingDivider />
      <SettingSection title="Срок и история">
        <SettingField label="Срок действия пароля" description="0 = бессрочно">
          <SettingInput
            type="number"
            value={String(settings.passwordExpiry)}
            onChange={(v) => set('passwordExpiry', parseInt(v) || 0)}
            suffix="дней"
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="Запретить последние N паролей">
          <SettingInput
            type="number"
            value={String(settings.passwordHistory)}
            onChange={(v) => set('passwordHistory', parseInt(v) || 0)}
          />
        </SettingField>
      </SettingSection>
    </div>
  )

  const renderMfa = () => (
    <div className="space-y-6">
      <SettingSection title="Многофакторная аутентификация">
        <SettingField label="Многофакторная аутентификация">
          <SettingSelect
            value={settings.mfaType}
            onChange={(v) => set('mfaType', v)}
            options={MFA_TYPE_OPTIONS}
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="TOTP (Google Authenticator)">
          <SettingToggle checked={settings.totpEnabled} onChange={(v) => set('totpEnabled', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="SMS-код">
          <SettingToggle checked={settings.smsEnabled} onChange={(v) => set('smsEnabled', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Email-код">
          <SettingToggle checked={settings.emailCodeEnabled} onChange={(v) => set('emailCodeEnabled', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Push-уведомление">
          <SettingToggle checked={settings.pushEnabled} onChange={(v) => set('pushEnabled', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Grace period для настройки MFA">
          <SettingInput
            type="number"
            value={String(settings.mfaGracePeriod)}
            onChange={(v) => set('mfaGracePeriod', parseInt(v) || 0)}
            suffix="дней"
          />
        </SettingField>
      </SettingSection>
    </div>
  )

  const renderSessions = () => (
    <div className="space-y-6">
      <SettingSection title="Время жизни">
        <SettingField label="Время жизни сессии">
          <SettingInput
            type="number"
            value={String(settings.sessionLifetime)}
            onChange={(v) => set('sessionLifetime', parseInt(v) || 0)}
            suffix="мин"
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="Время жизни refresh token">
          <SettingInput
            type="number"
            value={String(settings.refreshLifetime)}
            onChange={(v) => set('refreshLifetime', parseInt(v) || 0)}
            suffix="дней"
          />
        </SettingField>
      </SettingSection>
      <SettingDivider />
      <SettingSection title="Параметры сессий">
        <SettingField label="Одинаковые сессии с разных устройств">
          <SettingToggle checked={settings.multiDevice} onChange={(v) => set('multiDevice', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Привязка к IP">
          <SettingToggle checked={settings.ipBinding} onChange={(v) => set('ipBinding', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Завершать сессию при бездействии">
          <SettingToggle checked={settings.idleTimeout} onChange={(v) => set('idleTimeout', v)} />
        </SettingField>
        {settings.idleTimeout && (
          <>
            <SettingDivider />
            <SettingField label="Таймаут бездействия">
              <SettingInput
                type="number"
                value={String(settings.idleTimeoutMinutes)}
                onChange={(v) => set('idleTimeoutMinutes', parseInt(v) || 0)}
                suffix="мин"
              />
            </SettingField>
          </>
        )}
      </SettingSection>
      <SettingDivider />
      <div>
        <button
          onClick={() => {}}
          className="px-4 py-2.5 rounded-lg text-sm font-medium text-[#FFFFFF] transition-colors duration-200 hover:bg-[#DC2626]"
          style={{ backgroundColor: '#EF4444' }}
        >
          Завершить все сессии кроме текущей
        </button>
      </div>
    </div>
  )

  const renderLdap = () => (
    <div className="space-y-6">
      <SettingSection title="Подключение">
        <SettingField label="LDAP Server URL">
          <SettingInput value={settings.ldapUrl} onChange={(v) => set('ldapUrl', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Bind DN">
          <SettingInput value={settings.ldapBindDn} onChange={(v) => set('ldapBindDn', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="Bind Password">
          <SettingInput
            type="password"
            value={settings.ldapBindPassword}
            onChange={(v) => set('ldapBindPassword', v)}
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="Base DN">
          <SettingInput value={settings.ldapBaseDn} onChange={(v) => set('ldapBaseDn', v)} />
        </SettingField>
        <SettingDivider />
        <SettingField label="User Filter" description="(objectClass=person)">
          <SettingInput
            value={settings.ldapUserFilter}
            onChange={(v) => set('ldapUserFilter', v)}
            placeholder="(objectClass=person)"
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="Username Attribute" description="sAMAccountName">
          <SettingInput
            value={settings.ldapUsernameAttr}
            onChange={(v) => set('ldapUsernameAttr', v)}
            placeholder="sAMAccountName"
          />
        </SettingField>
      </SettingSection>
      <SettingDivider />
      <div>
        <button
          onClick={() => {}}
          className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200"
          style={{ color: '#3B82F6', backgroundColor: 'transparent' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59,130,246,0.1)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
        >
          Проверить соединение
        </button>
      </div>
    </div>
  )

  const renderSso = () => {
    const handleAddProvider = () => {
      const providers = [...settings.ssoProviders, { ...newProvider }]
      set('ssoProviders', providers)
      setNewProvider(EMPTY_SSO_PROVIDER)
      setAddingProvider(false)
    }

    const handleRemoveProvider = (index: number) => {
      const providers = settings.ssoProviders.filter((_, i) => i !== index)
      set('ssoProviders', providers)
    }

    return (
      <div className="space-y-6">
        <SettingSection title="Провайдеры SSO">
          <div className="rounded-lg border border-[#252A3D] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2130]" style={{ backgroundColor: '#11131A' }}>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wider">Провайдер</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wider">Client ID</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wider">Действия</th>
                </tr>
              </thead>
              <tbody>
                {settings.ssoProviders.map((provider, index) => (
                  <tr key={index} className="border-b border-[#1E2130] last:border-b-0">
                    <td className="px-4 py-3 text-[#E8E8ED]">{provider.name}</td>
                    <td className="px-4 py-3 text-[#6B7280]">***</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {}}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200"
                          style={{ color: '#3B82F6', backgroundColor: 'transparent' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59,130,246,0.1)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleRemoveProvider(index)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200"
                          style={{ color: '#EF4444', backgroundColor: 'transparent' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.1)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {addingProvider ? (
            <div className="space-y-4 rounded-lg border border-[#252A3D] p-4" style={{ backgroundColor: '#0B0E14' }}>
              <SettingField label="Название">
                <SettingInput value={newProvider.name} onChange={(v) => setNewProvider({ ...newProvider, name: v })} />
              </SettingField>
              <SettingDivider />
              <SettingField label="Client ID">
                <SettingInput value={newProvider.clientId} onChange={(v) => setNewProvider({ ...newProvider, clientId: v })} />
              </SettingField>
              <SettingDivider />
              <SettingField label="Client Secret">
                <SettingInput type="password" value={newProvider.clientSecret} onChange={(v) => setNewProvider({ ...newProvider, clientSecret: v })} />
              </SettingField>
              <SettingDivider />
              <SettingField label="Auth URL">
                <SettingInput value={newProvider.authUrl} onChange={(v) => setNewProvider({ ...newProvider, authUrl: v })} />
              </SettingField>
              <SettingDivider />
              <SettingField label="Token URL">
                <SettingInput value={newProvider.tokenUrl} onChange={(v) => setNewProvider({ ...newProvider, tokenUrl: v })} />
              </SettingField>
              <SettingDivider />
              <SettingField label="Scopes">
                <SettingInput value={newProvider.scopes} onChange={(v) => setNewProvider({ ...newProvider, scopes: v })} />
              </SettingField>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddProvider}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[#FFFFFF] transition-colors duration-200 hover:bg-[#7C3AED]"
                  style={{ backgroundColor: '#8B5CF6' }}
                >
                  Добавить
                </button>
                <button
                  onClick={() => { setAddingProvider(false); setNewProvider(EMPTY_SSO_PROVIDER) }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[#E8E8ED] border border-[#252A3D] transition-colors duration-200 hover:bg-[#252A3D]"
                  style={{ backgroundColor: '#1A1D2B' }}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingProvider(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-[#8B5CF6] border border-[#252A3D] transition-colors duration-200 hover:bg-[#252A3D]"
              style={{ backgroundColor: 'transparent' }}
            >
              <Plus className="w-4 h-4" />
              Добавить провайдера
            </button>
          )}
        </SettingSection>
      </div>
    )
  }

  const renderSecurity = () => (
    <div className="space-y-6">
      <SettingSection title="Защита от подбора">
        <SettingField label="Макс попыток входа">
          <SettingInput
            type="number"
            value={String(settings.maxLoginAttempts)}
            onChange={(v) => set('maxLoginAttempts', parseInt(v) || 0)}
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="Время блокировки">
          <SettingInput
            type="number"
            value={String(settings.lockoutTime)}
            onChange={(v) => set('lockoutTime', parseInt(v) || 0)}
            suffix="мин"
          />
        </SettingField>
        <SettingDivider />
        <SettingField label="CAPTCHA после N неудач">
          <SettingToggle checked={settings.captchaAfterAttempts} onChange={(v) => set('captchaAfterAttempts', v)} />
        </SettingField>
        {settings.captchaAfterAttempts && (
          <>
            <SettingDivider />
            <SettingField label="Порог для CAPTCHA">
              <SettingInput
                type="number"
                value={String(settings.captchaThreshold)}
                onChange={(v) => set('captchaThreshold', parseInt(v) || 0)}
              />
            </SettingField>
          </>
        )}
      </SettingSection>
      <SettingDivider />
      <SettingSection title="Ограничения доступа">
        <SettingField label="IP whitelist">
          <SettingToggle checked={settings.ipWhitelist} onChange={(v) => set('ipWhitelist', v)} />
        </SettingField>
        {settings.ipWhitelist && (
          <>
            <SettingDivider />
            <SettingField label="Разрешённые IP">
              <SettingTextarea
                value={settings.allowedIps}
                onChange={(v) => set('allowedIps', v)}
                placeholder={"192.168.1.0/24\n10.0.0.0/8"}
              />
            </SettingField>
          </>
        )}
      </SettingSection>
      <SettingDivider />
      <SettingSection title="Логирование">
        <SettingField label="Логировать все попытки входа">
          <SettingToggle checked={settings.logAllAttempts} onChange={(v) => set('logAllAttempts', v)} />
        </SettingField>
      </SettingSection>
    </div>
  )

  const renderTab = () => {
    switch (activeTab) {
      case 'general': return renderGeneral()
      case 'password': return renderPassword()
      case 'mfa': return renderMfa()
      case 'sessions': return renderSessions()
      case 'ldap': return renderLdap()
      case 'sso': return renderSso()
      case 'security': return renderSecurity()
      default: return null
    }
  }

  return <div className="space-y-6">{renderTab()}</div>
}
