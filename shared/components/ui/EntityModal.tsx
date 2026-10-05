import { useEffect, type ComponentType, type ReactNode } from 'react'
import { AlertTriangle, Check, Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/lib/utils'

type IconType = ComponentType<{ className?: string }>

export function EntityModal({ icon: Icon, title, subtitle, tabs, tab = 'settings', onTabChange, busy, locked = false, canSave, saveLabel = 'Сохранить', onSave, onDelete, onClose, children }: {
  icon: IconType
  title: string
  subtitle?: string
  tabs?: { id: string; label: string; icon: IconType }[]
  tab?: string
  onTabChange?: (tab: string) => void
  busy: boolean
  locked?: boolean
  canSave: boolean
  saveLabel?: string
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !locked) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, busy, locked])

  const isSettings = tab === 'settings'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => !busy && !locked && onClose()}>
      <form
        className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-scale-in"
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (isSettings && canSave && !busy) onSave() }}
      >
        <div className={cn('shrink-0 border-b border-border px-5 pt-5', !tabs && 'pb-4')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 shrink-0 text-muted-foreground" /> <span className="truncate">{title}</span></h3>
              {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Закрыть" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
          </div>
          {tabs && (
            <div className="mt-4 flex gap-4" role="tablist">
              {tabs.map(({ id, label, icon: TabIcon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => onTabChange?.(id)}
                  className={cn(
                    '-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors',
                    tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <TabIcon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin overscroll-contain p-5">{children}</div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border p-4">
          {onDelete && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} disabled={busy}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Удалить
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{isSettings ? 'Отмена' : 'Закрыть'}</Button>
            {isSettings && (
              <Button type="submit" disabled={busy || !canSave}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                {saveLabel}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

export function ModalError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {error}
    </div>
  )
}
