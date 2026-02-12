import { useState, useEffect } from 'react'
import { VacationType, VACATION_TYPES } from '@/types'
import { Button } from '@/components/ui/Button'
import { Upload, FileText, X, AlertTriangle } from 'lucide-react'
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
    referenceDocument?: string
  }) => void
  loading?: boolean
  balance?: {
    availableDays: number
    travelAvailable: boolean
    travelNextAvailableDate?: string
  }
  userId?: string
  restrictionWarnings?: Array<{
    message: string
    details?: any
  }>
  onCheckRestrictions?: (userId: string, data: { startDate: string; endDate: string }) => void
}

export function CreateVacationModal({
  isOpen,
  startDate,
  endDate,
  onClose,
  onSubmit,
  loading = false,
  balance,
  userId,
  restrictionWarnings = [],
  onCheckRestrictions,
}: CreateVacationModalProps) {
  const [vacationType, setVacationType] = useState<VacationType>(VacationType.ANNUAL_PAID)
  const [hasTravel, setHasTravel] = useState(false)
  const [comment, setComment] = useState('')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [lastCheckedDates, setLastCheckedDates] = useState<{startDate: string; endDate: string} | null>(null)

  useEffect(() => {
    if (isOpen) {
      console.log('[CreateVacationModal] Modal opened', { userId, startDate, endDate })
      checkRestrictions()
    }
  }, [isOpen])

  const checkRestrictions = () => {
    console.log('[CreateVacationModal] checkRestrictions called', { userId, startDate, endDate, hasOnCheck: !!onCheckRestrictions })
    if (userId && startDate && endDate && onCheckRestrictions) {
      const dateKey = `${startDate}-${endDate}`
      if (lastCheckedDates?.startDate === startDate && lastCheckedDates?.endDate === endDate) {
        console.log('[CreateVacationModal] Already checked these dates, skipping')
        return
      }
      console.log('[CreateVacationModal] Calling onCheckRestrictions')
      setLastCheckedDates({ startDate, endDate })
      onCheckRestrictions(userId, { startDate, endDate })
    } else {
      console.log('[CreateVacationModal] Not calling onCheckRestrictions:', {
        hasUserId: !!userId,
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
        hasOnCheck: !!onCheckRestrictions
      })
    }
  }

  if (!isOpen || !startDate || !endDate) {
    return null
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const referenceDocument = referenceFile ? referenceFile.name : undefined
    
    onSubmit({
      vacationType,
      hasTravel,
      comment,
      referenceDocument,
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

          {/* Справка для учебного отпуска */}
          {vacationType === VacationType.EDUCATIONAL && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Справка <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                {referenceFile ? (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <span className="flex-1 text-sm text-blue-900 truncate">{referenceFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setReferenceFile(null)}
                      disabled={loading}
                      className="text-blue-600 hover:text-blue-800 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="file"
                      id="referenceFile"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setReferenceFile(file)
                        }
                      }}
                      disabled={loading}
                      className="hidden"
                    />
                    <label
                      htmlFor="referenceFile"
                      className={`flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
                        loading
                          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      <Upload className="h-5 w-5 text-gray-500" />
                      <span className="text-sm text-gray-600">
                        Загрузите справку (PDF, изображение)
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

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

          {/* Предупреждения о нарушении ограничений */}
          {restrictionWarnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-sm">
                <div className="font-medium mb-2 flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  ⚠️ Внимание
                </div>
                {restrictionWarnings.map((warning, index) => (
                  <div key={index} className="text-amber-700 mb-2 last:mb-0">
                    <div>{warning.message}</div>
                    {warning.details?.conflictingEmployee && (
                      <div className="text-xs text-amber-600 mt-1">
                        Даты: {warning.details.conflictingEmployee.dates}
                      </div>
                    )}
                  </div>
                ))}
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
              disabled={
                loading ||
                (countsInCounter && !hasEnoughDays) ||
                (hasTravel && !canUseTravel) ||
                (vacationType === VacationType.EDUCATIONAL && !referenceFile)
              }
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
