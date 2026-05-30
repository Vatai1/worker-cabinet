import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
}

let confirmResolve: ((value: boolean) => void) | null = null
let confirmSetState: ((s: ConfirmOptions | null) => void) | null = null

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolve = resolve
    confirmSetState?.(options)
  })
}

export function ConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)

  useEffect(() => {
    confirmSetState = setOptions
    return () => { confirmSetState = null }
  }, [])

  const handleConfirm = useCallback(() => {
    confirmResolve?.(true)
    confirmResolve = null
    setOptions(null)
  }, [])

  const handleCancel = useCallback(() => {
    confirmResolve?.(false)
    confirmResolve = null
    setOptions(null)
  }, [])

  useEffect(() => {
    if (!options) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [options, handleCancel])

  if (!options) return null

  const variantClass = options.variant === 'danger'
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    : options.variant === 'warning'
      ? 'bg-amber-600 text-white hover:bg-amber-600/90'
      : 'bg-primary text-primary-foreground hover:bg-primary/90'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />
      <div className="relative bg-card rounded-xl border border-border shadow-2xl p-6 max-w-md w-full mx-4 animate-scale-in">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold">{options.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{options.message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            {options.cancelText || 'Отмена'}
          </button>
          <button
            onClick={handleConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${variantClass}`}
          >
            {options.confirmText || 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  )
}
