export type ModuleId = 'vacation' | 'calendar' | 'notifications' | 'auth'

export interface ModuleInfo {
  id: ModuleId
  name: string
  icon: string
  color: string
  status: 'active' | 'disabled' | 'error'
}

export interface ModuleTab {
  id: string
  name: string
  icon?: string
}

export interface VacationSettings {
  active: boolean
  allowRetroactive: boolean
  allowFractional: boolean
  minDuration: number
  maxDuration: number
  minTenure: number
  weekStart: string
  approvalType: string
  requireRejectComment: boolean
  reviewDeadline: number
  notifyOverdue: boolean
  approvalStages: string[]
  baseVacationDays: number
  carryOver: boolean
  maxCarryOver: number
  extraDaysRules: { label: string; days: number }[]
  syncExchange: boolean
  exchangeField: string
  createCalendarEvent: boolean
  targetCalendar: string
  notifyOnSubmit: boolean
  notifyOnSubmitChannel: string
  notifyOnApprove: boolean
  notifyOnApproveChannel: string
  notifyOnReject: boolean
  notifyOnRejectChannel: string
  remindBeforeDays: boolean
  remindDays: number
}

export interface CalendarSettings {
  active: boolean
  timezone: string
  dateFormat: string
  timeFormat: string
  workHoursStart: string
  workHoursEnd: string
  showWeekends: boolean
  showWeekNumbers: boolean
  viewMonth: boolean
  viewWeek: boolean
  viewDay: boolean
  viewList: boolean
  defaultView: string
  minEventDuration: number
  maxEventDuration: number
  allowOutsideWorkHours: boolean
  allowEventOverlap: boolean
  categories: { name: string; color: string }[]
  syncExchange: boolean
  ewsUrl: string
  oauthClientId: string
  oauthSecret: string
  syncFrequency: string
  bidirectionalSync: boolean
}

export interface NotificationsSettings {
  emailEnabled: boolean
  smtpServer: string
  smtpPort: number
  smtpLogin: string
  smtpPassword: string
  smtpTls: boolean
  pushEnabled: boolean
  teamsEnabled: boolean
  teamsWebhookUrl: string
  slackEnabled: boolean
  slackWebhookUrl: string
  smsEnabled: boolean
  smsProvider: string
  smsApiKey: string
  smsSenderId: string
  maxPerHour: number
  groupSimilar: boolean
  groupInterval: number
  nightMode: boolean
  nightStart: string
  nightEnd: string
}

export interface AuthSettings {
  active: boolean
  authType: string
  allowRegistration: boolean
  confirmEmail: boolean
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireDigit: boolean
  requireSpecial: boolean
  passwordExpiry: number
  passwordHistory: number
  mfaType: string
  totpEnabled: boolean
  smsEnabled: boolean
  emailCodeEnabled: boolean
  pushEnabled: boolean
  mfaGracePeriod: number
  sessionLifetime: number
  refreshLifetime: number
  multiDevice: boolean
  ipBinding: boolean
  idleTimeout: boolean
  idleTimeoutMinutes: number
  maxLoginAttempts: number
  lockoutTime: number
  captchaAfterAttempts: boolean
  captchaThreshold: number
  ipWhitelist: boolean
  allowedIps: string
  logAllAttempts: boolean
  ldapUrl: string
  ldapBindDn: string
  ldapBindPassword: string
  ldapBaseDn: string
  ldapUserFilter: string
  ldapUsernameAttr: string
  ssoProviders: { name: string; clientId: string; clientSecret: string; authUrl: string; tokenUrl: string; scopes: string }[]
}

export type ModuleSettings = VacationSettings | CalendarSettings | NotificationsSettings | AuthSettings
