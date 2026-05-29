import { Button } from '@/shared/components/ui/Button'

interface ConfirmModalProps {
  open?: boolean
  isOpen?: boolean
  onClose?: () => void
  onCancel?: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
}

export function ConfirmModal({ open, isOpen, onClose, onCancel, onConfirm, title, message, confirmText = 'Подтвердить', cancelText = 'Отмена', danger, loading }: ConfirmModalProps) {
  const visible = open ?? isOpen ?? false
  const handleCancel = onCancel ?? onClose ?? (() => {})

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={handleCancel} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-xl animate-scale-in">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={handleCancel} disabled={loading}>{cancelText}</Button>
          <Button variant={danger ? 'destructive' : 'default'} onClick={onConfirm} disabled={loading}>
            {loading && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
