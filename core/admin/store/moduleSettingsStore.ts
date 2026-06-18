import { create } from 'zustand'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import type { ModuleId, VacationSettings, CalendarSettings, NotificationsSettings, AuthSettings } from '@/core/admin/components/modules/types'

const DEFAULT_VACATION: VacationSettings = {
  active: true, allowRetroactive: false, allowFractional: false,
  minDuration: 1, maxDuration: 28, minTenure: 3, weekStart: 'mon',
  approvalType: 'manager', requireRejectComment: true, reviewDeadline: 3, notifyOverdue: true,
  approvalStages: ['Руководитель отдела', 'HR-менеджер'],
  baseVacationDays: 28, carryOver: true, maxCarryOver: 7,
  extraDaysRules: [{ label: 'За стаж (5+ лет)', days: 3 }, { label: 'За вредные условия', days: 7 }],
  syncExchange: false, exchangeField: 'categories', createCalendarEvent: true, targetCalendar: '',
  notifyOnSubmit: true, notifyOnSubmitChannel: 'email',
  notifyOnApprove: true, notifyOnApproveChannel: 'email',
  notifyOnReject: true, notifyOnRejectChannel: 'email',
  remindBeforeDays: true, remindDays: 3,
}

const DEFAULT_CALENDAR: CalendarSettings = {
  active: true, timezone: 'Europe/Moscow', dateFormat: 'DD.MM.YYYY', timeFormat: '24',
  workHoursStart: '09:00', workHoursEnd: '18:00', showWeekends: true, showWeekNumbers: false,
  viewMonth: true, viewWeek: true, viewDay: true, viewList: true, defaultView: 'month',
  minEventDuration: 15, maxEventDuration: 480, allowOutsideWorkHours: false, allowEventOverlap: true,
  categories: [
    { name: 'Работа', color: '#3B82F6' }, { name: 'Личное', color: '#10B981' },
    { name: 'Важное', color: '#EF4444' },
  ],
  syncExchange: false, ewsUrl: '', oauthClientId: '', oauthSecret: '',
  syncFrequency: '15min', bidirectionalSync: false,
}

const DEFAULT_NOTIFICATIONS: NotificationsSettings = {
  // NOTE: smtpPassword, smsApiKey, etc. are type definitions for what settings CAN contain.
  // The real credential protection should be handled on the backend (mask values in GET responses).
  emailEnabled: true, smtpServer: '', smtpPort: 587, smtpLogin: '', smtpPassword: '', smtpTls: true,
  pushEnabled: true, teamsEnabled: false, teamsWebhookUrl: '', slackEnabled: false, slackWebhookUrl: '',
  smsEnabled: false, smsProvider: 'twilio', smsApiKey: '', smsSenderId: '',
  maxPerHour: 100, groupSimilar: false, groupInterval: 30,
  nightMode: false, nightStart: '22:00', nightEnd: '08:00',
}

const DEFAULT_AUTH: AuthSettings = {
  active: true, authType: 'local', allowRegistration: true, confirmEmail: false,
  minLength: 8, requireUppercase: true, requireLowercase: true, requireDigit: true, requireSpecial: false,
  passwordExpiry: 90, passwordHistory: 5,
  mfaType: 'disabled', totpEnabled: false, smsEnabled: false, emailCodeEnabled: false, pushEnabled: false,
  mfaGracePeriod: 7,
  sessionLifetime: 480, refreshLifetime: 7, multiDevice: true, ipBinding: false,
  idleTimeout: false, idleTimeoutMinutes: 30,
  maxLoginAttempts: 5, lockoutTime: 15, captchaAfterAttempts: true, captchaThreshold: 3,
  ipWhitelist: false, allowedIps: '', logAllAttempts: true,
  ldapUrl: '', ldapBindDn: '', ldapBindPassword: '', ldapBaseDn: '',
  ldapUserFilter: '(objectClass=person)', ldapUsernameAttr: 'sAMAccountName',
  ssoProviders: [],
}

const DEFAULTS: Record<ModuleId, VacationSettings | CalendarSettings | NotificationsSettings | AuthSettings> = {
  vacation: DEFAULT_VACATION,
  calendar: DEFAULT_CALENDAR,
  notifications: DEFAULT_NOTIFICATIONS,
  auth: DEFAULT_AUTH,
}

type SettingsValue = VacationSettings | CalendarSettings | NotificationsSettings | AuthSettings

interface ModuleSettingsState {
  settings: Record<ModuleId, SettingsValue>
  originalSettings: Record<ModuleId, SettingsValue>
  loading: Record<ModuleId, boolean>
  saving: Record<ModuleId, boolean>
  loaded: Record<ModuleId, boolean>
  isDirty: (moduleId: ModuleId) => boolean
  getSettings: <T>(moduleId: ModuleId) => T
  loadSettings: (moduleId: ModuleId) => Promise<void>
  updateSetting: (moduleId: ModuleId, key: string, value: unknown) => void
  updateSettings: (moduleId: ModuleId, patch: Record<string, unknown>) => void
  saveSettings: (moduleId: ModuleId) => Promise<boolean>
  resetToDefaults: (moduleId: ModuleId) => void
  discardChanges: (moduleId: ModuleId) => void
}

export const useModuleSettingsStore = create<ModuleSettingsState>((set, get) => ({
  settings: {
    vacation: { ...DEFAULT_VACATION },
    calendar: { ...DEFAULT_CALENDAR },
    notifications: { ...DEFAULT_NOTIFICATIONS },
    auth: { ...DEFAULT_AUTH },
  },
  originalSettings: {
    vacation: { ...DEFAULT_VACATION },
    calendar: { ...DEFAULT_CALENDAR },
    notifications: { ...DEFAULT_NOTIFICATIONS },
    auth: { ...DEFAULT_AUTH },
  },
  loading: { vacation: false, calendar: false, notifications: false, auth: false },
  saving: { vacation: false, calendar: false, notifications: false, auth: false },
  loaded: { vacation: false, calendar: false, notifications: false, auth: false },

  isDirty: (moduleId) => {
    const { settings, originalSettings } = get()
    return JSON.stringify(settings[moduleId]) !== JSON.stringify(originalSettings[moduleId])
  },

  getSettings: <T,>(moduleId: ModuleId) => {
    return get().settings[moduleId] as unknown as T
  },

  loadSettings: async (moduleId) => {
    set((s) => ({ loading: { ...s.loading, [moduleId]: true } }))
    try {
      const res = await fetch(`${API_BASE_URL}/admin/modules/${moduleId}/settings`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        const defaultVals = DEFAULTS[moduleId] as unknown as Record<string, unknown>
        const merged = { ...defaultVals, ...data } as SettingsValue
        set((s) => ({
          settings: { ...s.settings, [moduleId]: merged },
          originalSettings: { ...s.originalSettings, [moduleId]: { ...merged } },
          loaded: { ...s.loaded, [moduleId]: true },
        }))
      }
    } catch {
      if (!get().loaded[moduleId]) {
        set((s) => ({
          settings: { ...s.settings, [moduleId]: { ...DEFAULTS[moduleId] } },
          originalSettings: { ...s.originalSettings, [moduleId]: { ...DEFAULTS[moduleId] } },
          loaded: { ...s.loaded, [moduleId]: true },
        }))
      }
    } finally {
      set((s) => ({ loading: { ...s.loading, [moduleId]: false } }))
    }
  },

  updateSetting: (moduleId, key, value) => {
    set((s) => {
      const current = s.settings[moduleId] as unknown as Record<string, unknown>
      const updated = { ...current, [key]: value } as unknown as SettingsValue
      return { settings: { ...s.settings, [moduleId]: updated } }
    })
  },

  updateSettings: (moduleId, patch) => {
    set((s) => {
      const current = s.settings[moduleId] as unknown as Record<string, unknown>
      const updated = { ...current, ...patch } as unknown as SettingsValue
      return { settings: { ...s.settings, [moduleId]: updated } }
    })
  },

  saveSettings: async (moduleId) => {
    set((s) => ({ saving: { ...s.saving, [moduleId]: true } }))
    try {
      const settings = get().settings[moduleId]
      const res = await fetch(`${API_BASE_URL}/admin/modules/${moduleId}/settings`, {
        method: 'PATCH',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        set((s) => ({
          originalSettings: { ...s.originalSettings, [moduleId]: { ...s.settings[moduleId] } },
          saving: { ...s.saving, [moduleId]: false },
        }))
        return true
      }
    } catch {}
    set((s) => ({ saving: { ...s.saving, [moduleId]: false } }))
    return false
  },

  resetToDefaults: (moduleId) => {
    set((s) => ({
      settings: { ...s.settings, [moduleId]: { ...DEFAULTS[moduleId] } },
    }))
  },

  discardChanges: (moduleId) => {
    const original = { ...get().originalSettings[moduleId] }
    set((s) => ({
      settings: { ...s.settings, [moduleId]: original },
    }))
  },
}))
