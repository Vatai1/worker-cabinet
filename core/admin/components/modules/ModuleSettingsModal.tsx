import { useState, useEffect, useCallback, useRef } from 'react'
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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', animation: closing ? 'modalOverlayOut 0.2s ease forwards' : 'none' }}
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
        className="relative flex flex-col overflow-hidden rounded-2xl border border-[#252A3D] shadow-[0_24px_48px_rgba(0,0,0,0.6)]"
        style={{
          backgroundColor: '#161822',
          width: 'min(960px, calc(100vw - 32px))',
          height: 'min(92vh, 880px)',
          animation: closing ? 'modalOut 0.2s ease forwards' : 'modalIn 0.2s ease-out',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2130]" style={{ backgroundColor: '#1A1D2B' }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg text-lg" style={{ backgroundColor: `${info.color}20` }}>
              {info.emoji}
            </div>
            <div>
              <h2 className="text-base font-bold text-[#FFFFFF]">Настройки модуля «{info.name}»</h2>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#6B7280] hover:text-[#E8E8ED] hover:bg-[#252A3D] transition-colors duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="hidden md:flex flex-col w-[180px] shrink-0 border-r border-[#1E2130] overflow-y-auto" style={{ backgroundColor: '#11131A' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center px-4 py-3 text-sm text-left transition-all duration-200',
                  activeTab === tab.id
                    ? 'text-[#FFFFFF] bg-[#1A1D2B]'
                    : 'text-[#6B7280] hover:text-[#E8E8ED] hover:bg-[#1A1D2B]/50',
                )}
              >
                {activeTab === tab.id && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#8B5CF6]" />
                )}
                {tab.name}
              </button>
            ))}
          </nav>

          <div className="md:hidden border-b border-[#1E2130] px-4 py-2" style={{ backgroundColor: '#11131A' }}>
            <div className="relative">
              <button
                onClick={() => setMobileTabOpen(!mobileTabOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-[#E8E8ED] bg-[#1A1D2B] border border-[#252A3D]"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-[#8B5CF6]" />
                  {tabs.find(t => t.id === activeTab)?.name}
                </span>
                <svg className={cn('w-4 h-4 transition-transform', mobileTabOpen && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {mobileTabOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-[#252A3D] overflow-hidden z-10 shadow-lg" style={{ backgroundColor: '#1A1D2B' }}>
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setMobileTabOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        activeTab === tab.id ? 'text-[#FFFFFF] bg-[#252A3D]' : 'text-[#6B7280] hover:text-[#E8E8ED]',
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
                <div className="w-6 h-6 border-2 border-[#8B5CF6] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              renderContent()
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1E2130]" style={{ backgroundColor: '#161822' }}>
          <button
            onClick={handleClose}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-[#E8E8ED] border border-[#252A3D] transition-colors duration-200 hover:bg-[#252A3D]"
            style={{ backgroundColor: '#1A1D2B' }}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-[#FFFFFF] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#7C3AED] active:bg-[#6D28D9]"
            style={{ backgroundColor: '#8B5CF6' }}
          >
            {saving ? 'Сохранение...' : 'Сохранить изменения'}
          </button>
        </div>

        {showDirtyWarning && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-2xl">
            <div className="mx-4 max-w-sm w-full rounded-xl border border-[#252A3D] p-6 text-center" style={{ backgroundColor: '#1A1D2B' }}>
              <h3 className="text-base font-bold text-[#FFFFFF] mb-2">Несохранённые изменения</h3>
              <p className="text-sm text-[#6B7280] mb-5">У вас есть несохранённые изменения. Вы уверены, что хотите закрыть без сохранения?</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowDirtyWarning(false)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-[#E8E8ED] border border-[#252A3D] transition-colors hover:bg-[#252A3D]"
                  style={{ backgroundColor: '#1A1D2B' }}
                >
                  Продолжить редактирование
                </button>
                <button
                  onClick={handleDiscardAndClose}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#DC2626]"
                  style={{ backgroundColor: '#EF4444' }}
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
