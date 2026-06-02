import { useState, useEffect, useCallback, useRef } from 'react'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { X, Settings2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useModuleSettingsStore } from '@/core/admin/store/moduleSettingsStore'
import type { ModuleId, ModuleTab } from './types'
import { VacationSettings } from './VacationSettings'
import { CalendarSettings } from './CalendarSettings'
import { NotificationsSettings } from './NotificationsSettings'
import { AuthSettings } from './AuthSettings'

const MODULE_INFO: Record<ModuleId, { name: string; emoji: string; color: string }> = {
  vacation: { name: 'Отпуск', emoji: '🏖️', color: '#10B981' },
  calendar: { name: 'Календарь', emoji: '📅', color: '#8B5CF6' },
  notifications: { name: 'Уведомления', emoji: '🔔', color: '#F59E0B' },
  auth: { name: 'Авторизация', emoji: '🔐', color: '#3B82F6' },
}

const MODULE_TABS: Record<ModuleId, ModuleTab[]> = {
  vacation: [
    { id: 'general', name: 'Общие' },
    { id: 'approval', name: 'Согласование' },
    { id: 'limits', name: 'Лимиты' },
    { id: 'integrations', name: 'Интеграции' },
    { id: 'notify', name: 'Уведомления' },
  ],
  calendar: [
    { id: 'general', name: 'Общие' },
    { id: 'views', name: 'Виды' },
    { id: 'events', name: 'События' },
    { id: 'integrations', name: 'Интеграции' },
    { id: 'permissions', name: 'Права доступа' },
  ],
  notifications: [
    { id: 'channels', name: 'Каналы' },
    { id: 'templates', name: 'Шаблоны' },
    { id: 'frequency', name: 'Частота' },
    { id: 'logs', name: 'Логи' },
  ],
  auth: [
    { id: 'general', name: 'Общие' },
    { id: 'password', name: 'Политика паролей' },
    { id: 'mfa', name: 'MFA' },
    { id: 'sessions', name: 'Сессии' },
    { id: 'ldap', name: 'LDAP / AD' },
    { id: 'sso', name: 'OAuth / SSO' },
    { id: 'security', name: 'Безопасность' },
  ],
}

interface Props {
  moduleId: ModuleId
  isOpen: boolean
  onClose: () => void
}

export function ModuleSettingsModal({ moduleId, isOpen, onClose }: Props) {
  useModalOpen(isOpen)
  const [activeTab, setActiveTab] = useState<string>(MODULE_TABS[moduleId][0].id)
  const [mobileTabOpen, setMobileTabOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [showDirtyWarning, setShowDirtyWarning] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const isDirty = useModuleSettingsStore((s) => s.isDirty(moduleId))
  const saving = useModuleSettingsStore((s) => s.saving[moduleId])
  const loading = useModuleSettingsStore((s) => s.loading[moduleId])
  const saveSettings = useModuleSettingsStore((s) => s.saveSettings)
  const discardChanges = useModuleSettingsStore((s) => s.discardChanges)
  const loadSettings = useModuleSettingsStore((s) => s.loadSettings)

  const info = MODULE_INFO[moduleId]
  const tabs = MODULE_TABS[moduleId]

  useEffect(() => {
    if (isOpen && !useModuleSettingsStore.getState().loaded[moduleId]) {
      loadSettings(moduleId)
    }
  }, [isOpen, moduleId, loadSettings])

  useEffect(() => {
    setActiveTab(tabs[0].id)
    setMobileTabOpen(false)
  }, [moduleId, tabs])

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDirtyWarning(true)
      return
    }
    close()
  }, [isDirty])

  const close = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClose()
      setShowDirtyWarning(false)
    }, 200)
  }, [onClose])

  const handleSave = async () => {
    await saveSettings(moduleId)
    close()
  }

  const handleDiscardAndClose = () => {
    discardChanges(moduleId)
    close()
  }

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDirtyWarning) {
          setShowDirtyWarning(false)
        } else {
          handleClose()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, handleClose, showDirtyWarning])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const renderContent = () => {
    switch (moduleId) {
      case 'vacation': return <VacationSettings activeTab={activeTab} />
      case 'calendar': return <CalendarSettings activeTab={activeTab} />
      case 'notifications': return <NotificationsSettings activeTab={activeTab} />
      case 'auth': return <AuthSettings activeTab={activeTab} />
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) handleClose() }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
      style={{ animation: closing ? 'modalOverlayOut 0.2s ease forwards' : 'none' }}
    >
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes modalOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.95) translateY(20px); }
        }
        @keyframes modalOverlayOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>

      <div
        ref={contentRef}
        className="relative flex flex-col overflow-hidden rounded-2xl border border-border shadow-2xl bg-card"
        style={{
          width: 'min(960px, calc(100vw - 32px))',
          height: 'min(92vh, 880px)',
          animation: closing ? 'modalOut 0.2s ease forwards' : 'modalIn 0.2s ease-out',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg text-lg" style={{ backgroundColor: `${info.color}20` }}>
              {info.emoji}
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Настройки модуля «{info.name}»</h2>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="hidden md:flex flex-col w-[180px] shrink-0 border-r border-border overflow-y-auto bg-popover">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center px-4 py-3 text-sm text-left transition-all duration-200',
                  activeTab === tab.id
                    ? 'text-foreground bg-muted'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {activeTab === tab.id && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />
                )}
                {tab.name}
              </button>
            ))}
          </nav>

          <div className="md:hidden border-b border-border px-4 py-2 bg-popover">
            <div className="relative">
              <button
                onClick={() => setMobileTabOpen(!mobileTabOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-foreground bg-muted border border-border"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  {tabs.find(t => t.id === activeTab)?.name}
                </span>
                <svg className={cn('w-4 h-4 transition-transform', mobileTabOpen && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {mobileTabOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border overflow-hidden z-10 shadow-lg bg-muted">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setMobileTabOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        activeTab === tab.id ? 'text-foreground bg-muted' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {tab.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              renderContent()
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-card">
          <button
            onClick={handleClose}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-foreground border border-border transition-colors duration-200 hover:bg-muted bg-muted"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-primary-foreground transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 active:bg-primary/80 bg-primary"
          >
            {saving ? 'Сохранение...' : 'Сохранить изменения'}
          </button>
        </div>

        {showDirtyWarning && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-2xl">
            <div className="mx-4 max-w-sm w-full rounded-xl border border-border p-6 text-center bg-muted">
              <h3 className="text-base font-bold text-foreground mb-2">Несохранённые изменения</h3>
              <p className="text-sm text-muted-foreground mb-5">У вас есть несохранённые изменения. Вы уверены, что хотите закрыть без сохранения?</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowDirtyWarning(false)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-foreground border border-border transition-colors hover:bg-muted bg-muted"
                >
                  Продолжить редактирование
                </button>
                <button
                  onClick={handleDiscardAndClose}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-primary-foreground transition-colors hover:bg-destructive/90 bg-destructive"
                >
                  Не сохранять
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
