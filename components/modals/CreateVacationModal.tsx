import { useState } from 'react'
import { VacationType, VACATION_TYPES } from '@/types'
import { Button } from '@/components/ui/Button'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface CreateVacationModalProps {
  isOpen: boolean
  startDate: string | null
  endDate: string | null
  onClose: () => void
  onSubmit: (data: {
    vacationType: VacationType
    hasTravel: boolean
    comment: string
  }) => void
  loading?: boolean
  balance?: {
    availableDays: number
    travelAvailable: boolean
    travelNextAvailableDate?: string
  }
}

export function CreateVacationModal({
  isOpen,
  startDate,
  endDate,
  onClose,
  onSubmit,
  loading = false,
  balance,
}: CreateVacationModalProps) {
  const [vacationType, setVacationType] = useState<VacationType>(VacationType.ANNUAL_PAID)
  const [hasTravel, setHasTravel] = useState(false)
  const [comment, setComment] = useState('')

  if (!isOpen || !startDate || !endDate) {
    return null
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      vacationType,
      hasTravel,
      comment,
    })
  }

  const canUseTravel = balance?.travelAvailable && hasTravel
  const vacationTypeInfo = VACATION_TYPES[vacationType]
  const countsInCounter = vacationTypeInfo?.countedInCounter
  const requiredDays = countsInCounter ? duration : 0
  const hasEnoughDays = !countsInCounter || (balance?.availableDays || 0) >= requiredDays

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Создать заявку на отпуск</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Даты отпуска */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Период отпуска
            </label>
            <div className="flex items-center gap-2 text-sm text-gray-900">
              <span className="font-semibold">{format(start, 'dd.MM.yyyy', { locale: ru })}</span>
              <span>—</span>
              <span className="font-semibold">{format(end, 'dd.MM.yyyy', { locale: ru })}</span>
              <span className="text-gray-600">({duration} {duration === 1 ? 'день' : duration >= 2 && duration <= 4 ? 'дня' : 'дней'})</span>
            </div>
          </div>

          {/* Тип отпуска */}
          <div>
            <label htmlFor="vacationType" className="block text-sm font-medium text-gray-700 mb-1">
              Тип отпуска
            </label>
            <select
              id="vacationType"
              value={vacationType}
              onChange={(e) => setVacationType(e.target.value as VacationType)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              {Object.values(VacationType).map((type) => {
                const info = VACATION_TYPES[type]
                return (
                  <option key={type} value={type}>
                    {info.name}
                  </option>
                )
              })}
            </select>
            {vacationTypeInfo && (
              <p className="text-xs text-gray-600 mt-1">{vacationTypeInfo.description}</p>
            )}
          </div>

          {/* Проезд к месту проведения отпуска */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="hasTravel"
              checked={hasTravel}
              onChange={(e) => setHasTravel(e.target.checked)}
              disabled={loading || !balance?.travelAvailable}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <div className="flex-1">
              <label htmlFor="hasTravel" className="block text-sm font-medium text-gray-700">
                С проездом к месту проведения отпуска
              </label>
              {balance?.travelAvailable ? (
                <p className="text-xs text-gray-600 mt-1">
                  Доступно до: {balance.travelNextAvailableDate ? new Date(balance.travelNextAvailableDate).toLocaleDateString('ru-RU') : 'Не ограничено'}
                </p>
              ) : (
                <p className="text-xs text-red-600 mt-1">
                  Недоступно
                  {balance?.travelNextAvailableDate && ` (доступно с ${new Date(balance.travelNextAvailableDate).toLocaleDateString('ru-RU')})`}
                </p>
              )}
            </div>
          </div>

          {/* Комментарий */}
          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
              Комментарий <span className="text-gray-500">(необязательно)</span>
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Укажите причину или дополнительные сведения..."
              disabled={loading}
            />
          </div>

          {/* Информация о днях */}
          {countsInCounter && (
            <div className={`p-3 rounded-lg ${hasEnoughDays ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="text-sm">
                <div className="font-medium mb-1">
                  {hasEnoughDays ? '✅ Достаточно дней' : '⚠️ Недостаточно дней'}
                </div>
                <div className="text-gray-600">
                  Требуется: {requiredDays} дней
                </div>
                {balance && (
                  <div className="text-gray-600">
                    Доступно: {balance.availableDays} дней
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Кнопки */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={loading || (countsInCounter && !hasEnoughDays) || (hasTravel && !canUseTravel)}
              className="flex-1"
            >
              {loading ? 'Создание...' : 'Создать заявку'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
