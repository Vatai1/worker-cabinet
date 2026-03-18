import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  loading?: boolean
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel}>
      <div className="p-6 border-b">
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>

      <div className="p-6">
        <p className="text-gray-700">{message}</p>
      </div>

      <div className="flex gap-3 px-6 pb-6">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
          className="flex-1"
        >
          {cancelText}
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="flex-1"
        >
          {loading ? 'Отмена...' : confirmText}
        </Button>
      </div>
    </Modal>
  )
}
