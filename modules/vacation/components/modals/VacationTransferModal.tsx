import { useState, useEffect } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { Button } from '@/shared/components/ui/Button'
import { formatDate } from '@/shared/lib/utils'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import type { VacationRequest } from '@/shared/types'
import { useAllowOverBalance } from '@/modules/vacation/store/vacationSettingsStore'

const daysInclusive = (startDate: string, endDate: string) =>
  Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1

interface VacationTransferModalProps {
  isOpen: boolean
  request: VacationRequest | null
  onClose: () => void
  onSubmit: (data: { newStartDate: string; newEndDate: string; reason: string }) => Promise<void>
  loading?: boolean
}

export function VacationTransferModal({ isOpen, request, onClose, onSubmit, loading }: VacationTransferModalProps) {
  useModalOpen(isOpen)
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [availableDays, setAvailableDays] = useState<number | null>(null)
  const allowOverBalance = useAllowOverBalance()

  useEffect(() => {
    if (!isOpen || !request) return
    let cancelled = false
    setAvailableDays(null)
    vacationApi
      .getBalance(request.userId, new Date(request.startDate).getFullYear())
      .then((b) => { if (!cancelled) setAvailableDays(b.availableDays) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isOpen, request])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen || !request) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    if (!newStartDate) newErrors.newStartDate = 'Укажите дату начала'
    if (!newEndDate) newErrors.newEndDate = 'Укажите дату окончания'

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

    if (newStartDate && newEndDate && end >= start && availableDays !== null && !allowOverBalance) {
      const extraDays = daysInclusive(newStartDate, newEndDate) - request.duration
      if (extraDays > availableDays) {
        newErrors.newEndDate = `Не хватает дней в балансе: новый период длиннее текущего на ${extraDays} дн., а доступно ${availableDays} дн.`
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setSubmitting(true)
    try {
      await onSubmit({ newStartDate, newEndDate, reason: reason.trim() })
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
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg mx-4 animate-scale-in overflow-hidden flex max-h-[85vh] flex-col">
        <div className="p-6 border-b flex justify-between items-center shrink-0">
          <h2 className="text-xl font-semibold">Перенос отпуска</h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin overscroll-contain">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Внимание!</span>
              </div>
              <p className="text-sm text-amber-700 mt-2">
                Будет создана новая заявка на согласовании. После её одобрения старая заявка будет отменена.
                <strong>
                  {' '}Новый период может быть любой длины, если хватает дней в балансе
                  {availableDays !== null ? `: сверх текущих ${request.duration} дн. доступно ещё ${availableDays} дн.` : '.'}
                </strong>
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
                Причина переноса <span className="text-muted-foreground">(необязательно)</span>
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

          </div>
          <div className="px-6 py-4 border-t border-border shrink-0">
            <div className="flex gap-3">
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
                disabled={loading || submitting || !newStartDate || !newEndDate}
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
