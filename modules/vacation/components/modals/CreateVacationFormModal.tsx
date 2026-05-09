import { useState, useEffect } from 'react'
import { VacationType, VACATION_TYPES } from '@/shared/types'
import { Button } from '@/shared/components/ui/Button'
import { X, FileText, Upload, AlertTriangle } from 'lucide-react'

interface CreateVacationFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    startDate: string
    endDate: string
    vacationType: VacationType
    hasTravel: boolean
    travelDestination?: string
    comment: string
    referenceDocument?: string
  }) => void
  loading?: boolean
  balance?: {
    availableDays: number
    travelAvailable: boolean
    travelNextAvailableDate?: string
  }
  restrictionWarnings?: Array<{
    message: string
    details?: any
  }>
  userId?: string
  onCheckRestrictions?: (userId: string, data: { startDate: string; endDate: string }) => void
}

export function CreateVacationFormModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  balance,
  restrictionWarnings = [],
  userId,
  onCheckRestrictions,
}: CreateVacationFormModalProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [vacationType, setVacationType] = useState<VacationType>(VacationType.ANNUAL_PAID)
  const [hasTravel, setHasTravel] = useState(false)
  const [travelDestination, setTravelDestination] = useState('')
  const [comment, setComment] = useState('')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [lastCheckedDates, setLastCheckedDates] = useState<{startDate: string; endDate: string} | null>(null)
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  if (!isOpen) return null

  useEffect(() => {
    if (isOpen) {
      console.log('[CreateVacationFormModal] Modal opened', { userId })
    }
  }, [isOpen])

  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    if (userId && startDate && endDate && onCheckRestrictions) {
      if (lastCheckedDates?.startDate === startDate && lastCheckedDates?.endDate === endDate) {
        console.log('[CreateVacationFormModal] Already checked these dates, skipping')
        return
      }

      const timer = setTimeout(() => {
        console.log('[CreateVacationFormModal] Debounced checkRestrictions')
        checkRestrictions()
      }, 500)

      setDebounceTimer(timer)
    }

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
  }, [startDate, endDate, userId, onCheckRestrictions, lastCheckedDates])

  const checkRestrictions = () => {
    console.log('[CreateVacationFormModal] checkRestrictions called', { userId, startDate, endDate, hasOnCheck: !!onCheckRestrictions })
    if (userId && startDate && endDate && onCheckRestrictions) {
      console.log('[CreateVacationFormModal] Calling onCheckRestrictions')
      setLastCheckedDates({ startDate, endDate })
      onCheckRestrictions(userId, { startDate, endDate })
    } else {
      console.log('[CreateVacationFormModal] Not calling onCheckRestrictions:', {
        hasUserId: !!userId,
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
        hasOnCheck: !!onCheckRestrictions
      })
    }
  }

  const validateDates = () => {
    const newErrors: Record<string, string> = {}

    if (!startDate) {
      newErrors.startDate = 'Выберите дату начала'
    } else if (new Date(startDate) < new Date(new Date().setHours(0, 0, 0, 0))) {
      newErrors.startDate = 'Дата начала не может быть в прошлом'
    }

    if (!endDate) {
      newErrors.endDate = 'Выберите дату окончания'
    } else if (startDate && new Date(endDate) < new Date(startDate)) {
      newErrors.endDate = 'Дата окончания не может быть раньше даты начала'
    }

    return newErrors
  }

  const calculateDuration = () => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const validationErrors = validateDates()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) return

    const referenceDocument = referenceFile ? referenceFile.name : undefined

    onSubmit({
      startDate,
      endDate,
      vacationType,
      hasTravel,
      travelDestination: hasTravel ? travelDestination : undefined,
      comment,
      referenceDocument,
    })
  }

  const vacationTypeInfo = VACATION_TYPES[vacationType]
  const countsInCounter = vacationTypeInfo?.countedInCounter
  const duration = calculateDuration()
  const requiredDays = countsInCounter ? duration : 0
  const hasEnoughDays = !countsInCounter || (balance?.availableDays || 0) >= requiredDays
  const canUseTravel = balance?.travelAvailable && hasTravel

  const handleReset = () => {
    setStartDate('')
    setEndDate('')
    setVacationType(VacationType.ANNUAL_PAID)
    setHasTravel(false)
    setComment('')
    setReferenceFile(null)
    setErrors({})
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Создать заявку на отпуск</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Период отпуска */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-muted-foreground mb-1">
                Дата начала
              </label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading}
              />
              {errors.startDate && (
                <p className="text-xs text-destructive mt-1">{errors.startDate}</p>
              )}
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-muted-foreground mb-1">
                Дата окончания
              </label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().split('T')[0]}
                className="w-full border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading || !startDate}
              />
              {errors.endDate && (
                <p className="text-xs text-destructive mt-1">{errors.endDate}</p>
              )}
            </div>
          </div>

          {duration > 0 && (
            <div className="text-sm text-muted-foreground">
              Продолжительность: {duration} {duration === 1 ? 'день' : duration >= 2 && duration <= 4 ? 'дня' : 'дней'}
            </div>
          )}

          {/* Тип отпуска */}
          <div>
            <label htmlFor="vacationType" className="block text-sm font-medium text-muted-foreground mb-1">
              Тип отпуска
            </label>
            <select
              id="vacationType"
              value={vacationType}
              onChange={(e) => setVacationType(e.target.value as VacationType)}
              className="w-full border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
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
              <p className="text-xs text-muted-foreground mt-1">{vacationTypeInfo.description}</p>
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
              className="mt-1 h-4 w-4 text-primary focus:ring-ring border-input rounded"
            />
             <div className="flex-1">
              <label htmlFor="hasTravel" className="block text-sm font-medium text-muted-foreground">
                С проездом к месту проведения отпуска
              </label>
               {balance?.travelAvailable ? (
                 <p className="text-xs text-muted-foreground mt-1">
                   Доступно
                   {balance.travelNextAvailableDate && ` до ${new Date(balance.travelNextAvailableDate).toLocaleDateString('ru-RU')}`}
                  </p>
                ) : (
                  <p className="text-xs text-destructive mt-1">
                    Недоступно
                    {balance?.travelNextAvailableDate && ` (доступно с ${new Date(balance.travelNextAvailableDate).toLocaleDateString('ru-RU')})`}
                  </p>
                )}
              </div>
            </div>

            {hasTravel && (
              <div>
                <label htmlFor="travelDestination" className="block text-sm font-medium text-muted-foreground mb-1">
                  Город назначения
                </label>
                <input
                  type="text"
                  id="travelDestination"
                  value={travelDestination}
                  onChange={(e) => setTravelDestination(e.target.value)}
                  className="w-full border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Введите город проезда"
                  disabled={loading}
                />
              </div>
            )}

          {/* Комментарий */}
          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-muted-foreground mb-1">
              Комментарий <span className="text-muted-foreground">(необязательно)</span>
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Укажите причину или дополнительные сведения..."
              disabled={loading}
            />
          </div>

          {/* Справка для учебного отпуска */}
          {vacationType === VacationType.EDUCATIONAL && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Справка <span className="text-destructive">*</span>
              </label>
              <div className="mt-1">
                {referenceFile ? (
                  <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="flex-1 text-sm text-primary truncate">{referenceFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setReferenceFile(null)}
                      disabled={loading}
                      className="text-primary hover:text-primary/80 p-1"
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
                          ? 'border-input bg-muted text-muted-foreground cursor-not-allowed'
                          : 'border-input hover:border-primary hover:bg-primary/10'
                      }`}
                    >
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Загрузите справку (PDF, изображение)
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Информация о днях */}
          {countsInCounter && duration > 0 && (
            <div className={`p-3 rounded-lg ${hasEnoughDays ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="text-sm">
                <div className="font-medium mb-1">
                  {hasEnoughDays ? '✅ Достаточно дней' : '⚠️ Недостаточно дней'}
                </div>
                <div className="text-muted-foreground">
                  Требуется: {requiredDays} дней
                </div>
                {balance && (
                  <div className="text-muted-foreground">
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
              onClick={handleReset}
              disabled={loading}
            >
              Очистить
            </Button>
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
                !startDate ||
                !endDate ||
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
