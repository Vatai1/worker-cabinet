import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { formatDate } from '@/shared/lib/utils'
import type { VacationRequest } from '@/shared/types'

interface VacationTransferModalProps {
  isOpen: boolean
  request: VacationRequest | null
  onClose: () => void
  onSubmit: (data: { newStartDate: string; newEndDate: string; reason: string }) => Promise<void>
  loading?: boolean
}

export function VacationTransferModal({ isOpen, request, onClose, onSubmit, loading }: VacationTransferModalProps) {
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen || !request) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    if (!newStartDate) newErrors.newStartDate = 'Укажите дату начала'
    if (!newEndDate) newErrors.newEndDate = 'Укажите дату окончания'
    if (!reason.trim()) newErrors.reason = 'Укажите причину переноса'

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(newStartDate)
    const end = new Date(newEndDate)

    if (newStartDate && start < today) {
      newErrors.newStartDate = 'Дата не может быть в прошлом'
    }

    if (newStartDate && newEndDate && end < start) {
      newErrors.newEndDate = 'Дата окончания не может быть раньше даты начала'
    }

    const originalYear = new Date(request.startDate).getFullYear()
    if (newStartDate && new Date(newStartDate).getFullYear() !== originalYear) {
      newErrors.newStartDate = 'Перенос возможен только в пределах того же года'
    }
    if (newEndDate && new Date(newEndDate).getFullYear() !== originalYear) {
      newErrors.newEndDate = 'Перенос возможен только в пределах того же года'
    }

    if (newStartDate && newEndDate) {
      const newDuration = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      if (newDuration > request.duration) {
        newErrors.newEndDate = `Новая продолжительность (${newDuration} дн.) превышает исходную (${request.duration} дн.)`
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setSubmitting(true)
    try {
      await onSubmit({ newStartDate, newEndDate, reason })
      setNewStartDate('')
      setNewEndDate('')
      setReason('')
      onClose()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Ошибка при отправке запроса'
      setErrors({ submit: message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setNewStartDate('')
    setNewEndDate('')
    setReason('')
    setErrors({})
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Перенос отпуска</h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Внимание!</span>
              </div>
              <p className="text-sm text-amber-700 mt-2">
                Будет создана новая заявка на согласовании. После её одобрения старая заявка будет отменена.
                <strong> Новая продолжительность не должна превышать {request.duration} дней.</strong>
              </p>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Текущий отпуск</div>
              <div className="font-medium">
                {formatDate(request.startDate)} — {formatDate(request.endDate)}
              </div>
              <div className="text-sm text-muted-foreground">{request.duration} дней</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Новая дата начала
                </label>
                <input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="w-full border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                  disabled={loading || submitting}
                />
                {errors.newStartDate && (
                  <p className="text-xs text-destructive mt-1">{errors.newStartDate}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Новая дата окончания
                </label>
                <input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="w-full border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                  disabled={loading || submitting}
                />
                {errors.newEndDate && (
                  <p className="text-xs text-destructive mt-1">{errors.newEndDate}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Причина переноса
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none bg-background"
                disabled={loading || submitting}
                placeholder="Укажите причину переноса отпуска..."
              />
              {errors.reason && (
                <p className="text-xs text-destructive mt-1">{errors.reason}</p>
              )}
            </div>

            {errors.submit && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                {errors.submit}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading || submitting}
                className="flex-1"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={loading || submitting || !reason.trim() || !newStartDate || !newEndDate}
                className="flex-1"
              >
                {submitting ? 'Отправка...' : 'Запросить перенос'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
