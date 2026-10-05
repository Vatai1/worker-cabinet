import { useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { useModulesStore } from '@/shared/store/modulesStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import { Switch } from '@/shared/components/ui/Switch'
import { ModuleSettingsModal } from '@/core/admin/components/modules/ModuleSettingsModal'
import type { ModuleId } from '@/core/admin/components/modules/types'
import { Loader2, Check, X, AlertTriangle, Lock, RotateCcw, Globe, BarChart3, FileText, UserPlus, Boxes, FolderKanban, Settings, Zap, Pencil, Tag } from 'lucide-react'
import type { SystemSetting } from '@/core/admin/types/admin'
import { AssistantSettingsTab } from '@/core/admin/pages/tabs/AssistantSettingsTab'

interface ModuleItem {
  id: number
  code: string
  name: string
  description: string | null
  icon: string | null
  route: string | null
  category: string
  sort_order: number
  is_enabled: boolean
  locked?: boolean
  updated_at: string
  global_name?: string | null
  global_is_enabled?: boolean
  org_name?: string | null
  org_settings?: Record<string, unknown> | null
  settings?: Record<string, unknown> | null
  is_overridden?: boolean
  is_enabled_override?: boolean | null
  effective_enabled?: boolean
}

const DASHBOARD_BADGE_MODULES = new Set([
  'vacation', 'projects', 'documents', 'surveys', 'timesheet', 'hierarchy', 'onboarding', 'mailing',
])

type ModuleCategoryKey = 'core' | 'hr' | 'work' | 'docs' | 'admin'

interface ModuleCategory {
  key: ModuleCategoryKey
  name: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

export function CustomSettingsModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col overflow-hidden border border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-5">{children}</div>
      </div>
    </div>
  )
}

export function TimesheetSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<SystemSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tsCreating, setTsCreating] = useState(false)
  const [tsResult, setTsResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/settings`, { headers: getAuthHeaders() })
      if (res.ok) {
        const all = await res.json()
        setSettings(all.filter((s: SystemSetting) => s.key === 'timesheet_auto_create'))
      }
    } catch {} finally { setLoading(false) }
  }

  const saveSettings = async () => {
    setSaving(true); setError(null); setSuccess(false)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/settings`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ settings: settings.map((s) => ({ key: s.key, value: s.value })) }),
      })
      if (res.ok) setSuccess(true)
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  const updateValue = (key: string, value: string) => {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))
  }

  const handleAutoCreateTimesheets = async () => {
    setTsCreating(true)
    setTsResult(null)
    setError(null)
    try {
      const now = new Date()
      const res = await fetchWithRetry(`${API_BASE_URL}/timesheet/auto-create`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ year: now.getFullYear(), month: now.getMonth() + 1 }),
      })
      const data = await res.json()
      if (res.ok || res.status === 201) {
        setTsResult(data.message || `Создано: ${data.created}`)
      } else {
        setError(data.error || 'Ошибка')
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setTsCreating(false)
    }
  }

  const tsAutoEnabled = settings.find(s => s.key === 'timesheet_auto_create')
  const tsAutoOn = tsAutoEnabled?.value === 'true'

  return (
    <CustomSettingsModal title="📋 Табели" onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-sm">
              <Check className="h-4 w-4 shrink-0" /> Настройки сохранены
            </div>
          )}

          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50">
            <div>
              <p className="font-medium text-sm">Автосоздание табелей</p>
              <p className="text-xs text-muted-foreground">Автоматически создавать табели для всех отделов за текущий месяц при первом обращении</p>
            </div>
            <Switch
              checked={tsAutoOn}
              onCheckedChange={(checked) => {
                if (tsAutoEnabled) {
                  updateValue('timesheet_auto_create', String(checked))
                } else {
                  setSettings(prev => [...prev, { key: 'timesheet_auto_create', value: String(checked), description: 'Автосоздание табелей', updated_at: '' }])
                }
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleAutoCreateTimesheets} disabled={tsCreating} variant={tsAutoOn ? 'default' : 'outline'}>
              {tsCreating ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Создание...</>
              ) : (
                <><Zap className="h-4 w-4 mr-1.5" /> Создать табели за текущий месяц</>
              )}
            </Button>
            {tsResult && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">{tsResult}</span>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Сохранить
            </Button>
          </div>
        </div>
      )}
    </CustomSettingsModal>
  )
}

const MODULE_CATEGORIES: ModuleCategory[] = [
  { key: 'core', name: 'Основные', icon: Boxes, color: 'text-blue-500' },
  { key: 'hr', name: 'HR и Люди', icon: UserPlus, color: 'text-emerald-500' },
  { key: 'work', name: 'Проекты и Работа', icon: FolderKanban, color: 'text-violet-500' },
  { key: 'docs', name: 'Документы и Коммуникации', icon: FileText, color: 'text-amber-500' },
  { key: 'admin', name: 'Аналитика и Управление', icon: BarChart3, color: 'text-pink-500' },
]

const MODULE_COLORS: Record<string, { active: string; inactive: string; icon: string }> = {
  vacation:     { active: 'from-blue-500 to-indigo-600',   inactive: 'bg-blue-100 dark:bg-blue-900/30',  icon: 'text-blue-600 dark:text-blue-400' },
  surveys:      { active: 'from-violet-500 to-purple-600', inactive: 'bg-violet-100 dark:bg-violet-900/30', icon: 'text-violet-600 dark:text-violet-400' },
  projects:     { active: 'from-emerald-500 to-teal-600',  inactive: 'bg-emerald-100 dark:bg-emerald-900/30', icon: 'text-emerald-600 dark:text-emerald-400' },
  documents:    { active: 'from-amber-500 to-orange-600',  inactive: 'bg-amber-100 dark:bg-amber-900/30', icon: 'text-amber-600 dark:text-amber-400' },
  timesheet:    { active: 'from-cyan-500 to-blue-600',     inactive: 'bg-cyan-100 dark:bg-cyan-900/30', icon: 'text-cyan-600 dark:text-cyan-400' },
  onboarding:   { active: 'from-pink-500 to-rose-600',     inactive: 'bg-pink-100 dark:bg-pink-900/30', icon: 'text-pink-600 dark:text-pink-400' },
  hierarchy:    { active: 'from-indigo-500 to-blue-600',   inactive: 'bg-indigo-100 dark:bg-indigo-900/30', icon: 'text-indigo-600 dark:text-indigo-400' },
  dictionaries: { active: 'from-teal-500 to-emerald-600',  inactive: 'bg-teal-100 dark:bg-teal-900/30', icon: 'text-teal-600 dark:text-teal-400' },
  calendar:     { active: 'from-sky-500 to-blue-600',      inactive: 'bg-sky-100 dark:bg-sky-900/30', icon: 'text-sky-600 dark:text-sky-400' },
}

export function ModulesTab({ mode = 'global' }: { mode?: 'global' | 'org' }) {
  const [modules, setModules] = useState<ModuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settingsModule, setSettingsModule] = useState<ModuleId | null>(null)
  const [customSettings, setCustomSettings] = useState<'timesheet' | 'assistant' | null>(null)
  const [editingOverride, setEditingOverride] = useState<number | null>(null)
  const [overrideValue, setOverrideValue] = useState('')
  const [savingOverrideId, setSavingOverrideId] = useState<number | null>(null)
  const [editingBadge, setEditingBadge] = useState<number | null>(null)
  const [badgeValue, setBadgeValue] = useState('')
  const [savingBadgeId, setSavingBadgeId] = useState<number | null>(null)
  const isGlobalMode = mode === 'global'

  useEffect(() => { fetchModules() }, [])

  const fetchModules = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/modules`, { headers: getAuthHeaders() })
      if (res.ok) setModules(await res.json())
    } catch {} finally { setLoading(false) }
  }

  const toggleModule = async (mod: ModuleItem) => {
    setTogglingId(mod.id)
    setError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/modules/${mod.id}/toggle`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
      })
      if (res.ok) {
        const data = await res.json()
        setModules((prev) => prev.map((m) => m.id === mod.id ? { ...m, is_enabled: data.enabled } : m))
        useModulesStore.getState().fetchModules()
      } else {
        const data = await res.json()
        setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setTogglingId(null) }
  }

  const toggleOrgModule = async (mod: ModuleItem) => {
    const newEnabled = !(mod.effective_enabled ?? mod.is_enabled)
    setTogglingId(mod.id)
    setError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/modules/${mod.code}/org-toggle`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ enable: newEnabled }),
      })
      if (res.ok) {
        const data = await res.json()
        setModules((prev) => prev.map((m) => m.id === mod.id ? {
          ...m,
          effective_enabled: data.enabled,
          is_enabled_override: newEnabled ? null : false,
        } : m))
        useModulesStore.getState().fetchModules()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setTogglingId(null) }
  }

  const saveOverride = async (mod: ModuleItem) => {
    const trimmed = overrideValue.trim()
    if (!trimmed) return
    setSavingOverrideId(mod.id)
    setError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/modules/${mod.code}/override`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const newName = data.name ?? trimmed
        setModules((prev) => prev.map((m) => m.id === mod.id ? {
          ...m, name: newName, org_name: newName, is_overridden: true,
        } : m))
        setEditingOverride(null)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSavingOverrideId(null) }
  }

  const resetOverride = async (mod: ModuleItem) => {
    setSavingOverrideId(mod.id)
    setError(null)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/modules/${mod.code}/override`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const fallbackName = mod.global_name ?? mod.name
        const newName = data.name ?? fallbackName
        setModules((prev) => prev.map((m) => m.id === mod.id ? {
          ...m, name: newName, org_name: null, is_overridden: false,
        } : m))
        if (editingOverride === mod.id) setEditingOverride(null)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSavingOverrideId(null) }
  }

  const getBadge = (mod: ModuleItem) => {
    const src = isGlobalMode ? mod.settings : (mod.org_settings ?? mod.settings)
    return (src?.dashboardBadge as string) || ''
  }

  const saveBadge = async (mod: ModuleItem, value: string) => {
    setSavingBadgeId(mod.id)
    setError(null)
    try {
      const baseSettings = (isGlobalMode ? mod.settings : mod.org_settings) || {}
      const nextSettings = { ...baseSettings, dashboardBadge: value.trim() || null }
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/modules/${mod.code}/settings`, {
        method: 'PATCH', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(nextSettings),
      })
      if (res.ok) {
        setModules((prev) => prev.map((m) => m.id === mod.id
          ? { ...m, ...(isGlobalMode ? { settings: nextSettings } : { org_settings: nextSettings }) }
          : m))
        setEditingBadge(null)
        useModulesStore.getState().fetchModules()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSavingBadgeId(null) }
  }

  const enabledCount = modules.filter(m => isGlobalMode ? m.is_enabled : (m.effective_enabled ?? m.is_enabled)).length

  const visibleModules = modules.filter(m => m.code !== 'appearance')

  const SETTINGS_MAP: Record<string, ModuleId> = {
    vacation: 'vacation',
    calendar: 'calendar',
    notifications: 'notifications',
    auth: 'auth',
  }

  const CUSTOM_SETTINGS = new Set(['timesheet', 'assistant'])

  const SETTINGS_INFO: Record<string, { emoji: string; color: string }> = {
    vacation: { emoji: '🏖️', color: '#10B981' },
    calendar: { emoji: '📅', color: '#8B5CF6' },
    notifications: { emoji: '🔔', color: '#F59E0B' },
    auth: { emoji: '🔐', color: '#3B82F6' },
    timesheet: { emoji: '📋', color: '#6366F1' },
    assistant: { emoji: '🤖', color: '#EC4899' },
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const groupedModules = MODULE_CATEGORIES
    .map(cat => ({
      ...cat,
      modules: visibleModules
        .filter(m => {
  if (m.locked) return cat.key === 'core'
  const catKey = (!m.category || m.category === 'general') ? 'core' : m.category
  return catKey === cat.key
})
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter(g => g.modules.length > 0)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" /> Модули системы</CardTitle>
              <CardDescription>Включено {enabledCount} из {modules.length} модулей</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-all duration-500"
                    style={{ width: `${modules.length > 0 ? (enabledCount / modules.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {modules.length > 0 ? Math.round((enabledCount / modules.length) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
            </div>
          )}

          <div className="space-y-6">
            {groupedModules.map(group => {
              const CategoryIcon = group.icon
              const groupEnabled = group.modules.filter(m => isGlobalMode ? m.is_enabled : (m.effective_enabled ?? m.is_enabled)).length
              return (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <CategoryIcon className={cn('h-4 w-4', group.color)} />
                    <h3 className="font-semibold text-sm text-foreground">{group.name}</h3>
                    <Badge className="text-[10px] bg-muted text-muted-foreground ml-auto">
                      {groupEnabled}/{group.modules.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {group.modules.map((mod) => {
                      const colors = MODULE_COLORS[mod.code] || MODULE_COLORS.documents
                      const isLoading = togglingId === mod.id
                      const hasSettings = mod.code in SETTINGS_MAP || CUSTOM_SETTINGS.has(mod.code)
                      const settingsInfo = SETTINGS_INFO[mod.code]
                      const enabled = isGlobalMode ? mod.is_enabled : (mod.effective_enabled ?? mod.is_enabled)

                      return (
                        <div
                          key={mod.id}
                          className={cn(
                            'relative flex flex-col p-5 rounded-2xl border-2 transition-all duration-300',
                            enabled
                              ? 'border-primary/20 bg-card shadow-sm hover:shadow-md hover:border-primary/40'
                              : 'border-border/30 bg-muted/20 opacity-70 hover:opacity-100',
                          )}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className={cn(
                              'p-2.5 rounded-xl transition-all duration-300',
                              enabled
                                ? `bg-primary/10 text-primary`
                                : colors.inactive,
                            )}>
                              {settingsInfo ? (
                                <span className="block w-5 h-5 text-center text-base leading-5">{settingsInfo.emoji}</span>
                              ) : (
                                <Boxes className={cn('h-5 w-5', !enabled && (colors.icon || 'text-muted-foreground'))} />
                              )}
                            </div>

                            {mod.locked ? (
                              <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                                <Lock className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-medium">Нельзя отключить</span>
                              </div>
                            ) : isGlobalMode ? (
                              <button
                                onClick={() => toggleModule(mod)}
                                disabled={isLoading}
                                className={cn(
                                  'relative w-12 h-7 rounded-full transition-all duration-300 shrink-0',
                                  enabled ? 'bg-primary shadow-sm' : 'bg-muted-foreground/20',
                                  isLoading && 'opacity-50 cursor-wait',
                                )}
                              >
                                <div className={cn(
                                  'absolute top-0.5 w-6 h-6 rounded-full bg-card shadow-sm transition-all duration-300',
                                  enabled ? 'left-[22px]' : 'left-0.5',
                                )} />
                                {isLoading && (
                                  <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />
                                )}
                              </button>
                            ) : mod.global_is_enabled === false ? (
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Globe className="h-3.5 w-3.5" />
                                  <span className="text-[10px] font-medium">Глобально отключён</span>
                                </div>
                                <div className="relative w-12 h-7 rounded-full shrink-0 bg-muted-foreground/20 opacity-50">
                                  <div className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-card shadow-sm" />
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => toggleOrgModule(mod)}
                                disabled={isLoading}
                                className={cn(
                                  'relative w-12 h-7 rounded-full transition-all duration-300 shrink-0',
                                  enabled ? 'bg-primary shadow-sm' : 'bg-muted-foreground/20',
                                  isLoading && 'opacity-50 cursor-wait',
                                )}
                              >
                                <div className={cn(
                                  'absolute top-0.5 w-6 h-6 rounded-full bg-card shadow-sm transition-all duration-300',
                                  enabled ? 'left-[22px]' : 'left-0.5',
                                )} />
                                {isLoading && (
                                  <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />
                                )}
                              </button>
                            )}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className={cn(
                                'font-semibold transition-colors',
                                enabled ? 'text-foreground' : 'text-muted-foreground',
                              )}>
                                {mod.name}
                              </h3>
                              {!mod.locked && (
                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={
                                  enabled
                                    ? { backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981', borderColor: 'rgba(16,185,129,0.3)' }
                                    : { backgroundColor: 'rgba(107,114,128,0.15)', color: '#6B7280', borderColor: 'transparent' }
                                }>
                                  {enabled ? 'Активен' : (isGlobalMode ? 'Отключен' : (mod.global_is_enabled === false ? 'Глобально отключён' : 'Отключён локально'))}
                                </span>
                              )}
                              {!isGlobalMode && mod.is_overridden && (
                                <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-transparent">
                                  Своё название
                                </Badge>
                              )}
                            </div>
                            {mod.description && (
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{mod.description}</p>
                            )}
                            {mod.route && (
                              <p className="text-[10px] font-mono text-muted-foreground/60 mt-2">{mod.route}</p>
                            )}
                            {!isGlobalMode && (
                              <div className="mt-3 pt-3 border-t border-border/40">
                                {editingOverride === mod.id ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={overrideValue}
                                      onChange={(e) => setOverrideValue(e.target.value)}
                                      placeholder={mod.global_name || mod.name}
                                      className="h-8 text-sm"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveOverride(mod)
                                        if (e.key === 'Escape') setEditingOverride(null)
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => saveOverride(mod)}
                                      disabled={savingOverrideId === mod.id || !overrideValue.trim()}
                                    >
                                      {savingOverrideId === mod.id
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Check className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingOverride(null)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingOverride(mod.id)
                                        setOverrideValue(mod.org_name || mod.name)
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5 mr-1" />
                                      {mod.is_overridden ? 'Изменить название' : 'Своё название'}
                                    </Button>
                                    {mod.is_overridden && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => resetOverride(mod)}
                                        disabled={savingOverrideId === mod.id}
                                      >
                                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                        Сбросить
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {DASHBOARD_BADGE_MODULES.has(mod.code) && (
                              <div className="mt-3 pt-3 border-t border-border/40">
                                {editingBadge === mod.id ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={badgeValue}
                                      onChange={(e) => setBadgeValue(e.target.value)}
                                      placeholder="Например: в разработке"
                                      className="h-8 text-sm"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveBadge(mod, badgeValue)
                                        if (e.key === 'Escape') setEditingBadge(null)
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => saveBadge(mod, badgeValue)}
                                      disabled={savingBadgeId === mod.id}
                                    >
                                      {savingBadgeId === mod.id
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Check className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingBadge(null)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingBadge(mod.id)
                                        setBadgeValue(getBadge(mod))
                                      }}
                                    >
                                      <Tag className="h-3.5 w-3.5 mr-1" />
                                      {getBadge(mod) ? `Статус: ${getBadge(mod)}` : 'Статус на дашборде'}
                                    </Button>
                                    {getBadge(mod) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => saveBadge(mod, '')}
                                        disabled={savingBadgeId === mod.id}
                                      >
                                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                        Убрать
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {hasSettings && (
                            <button
                              onClick={() => mod.code in SETTINGS_MAP ? setSettingsModule(SETTINGS_MAP[mod.code]) : setCustomSettings(mod.code as 'timesheet' | 'assistant')}
                              disabled={!enabled}
                              className={cn(
                                'flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm mt-4 transition-colors duration-200 border',
                                enabled
                                  ? 'bg-primary text-primary-foreground border-primary/20 hover:bg-primary/90'
                                  : 'text-muted-foreground cursor-not-allowed border-transparent bg-transparent',
                              )}
                            >
                              <Settings className="w-4 h-4" />
                              Настройки
                            </button>
                          )}

                          {enabled && (
                            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {settingsModule && (
        <ModuleSettingsModal
          moduleId={settingsModule}
          isOpen={true}
          onClose={() => setSettingsModule(null)}
        />
      )}

      {customSettings === 'timesheet' && (
        <TimesheetSettingsModal onClose={() => setCustomSettings(null)} />
      )}
      {customSettings === 'assistant' && (
        <CustomSettingsModal title="🤖 Ассистент" onClose={() => setCustomSettings(null)}>
          <AssistantSettingsTab />
        </CustomSettingsModal>
      )}
    </>
  )
}
