import { useState, useEffect } from 'react'
import { VacationType, VACATION_TYPES } from '@/shared/types'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { Button } from '@/shared/components/ui/Button'
import { Upload, FileText, X, AlertTriangle, Plus, Trash2 } from 'lucide-react'
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
    travelDestination?: string
    travelChildren?: Array<{ fullName: string; birthDate: string }>
    comment: string
    referenceDocument?: string
  }) => void
  loading?: boolean
  balance?: {
    availableDays: number
    travelAvailable: boolean
    travelNextAvailableDate?: string
    travelAvailableUntil?: string
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
  useModalOpen(isOpen)
  const [vacationType, setVacationType] = useState<VacationType>(VacationType.ANNUAL_PAID)
  const [hasTravel, setHasTravel] = useState(false)
  const [travelDestination, setTravelDestination] = useState('')
  const [travelChildren, setTravelChildren] = useState<Array<{ fullName: string; birthDate: string }>>([])
  const [comment, setComment] = useState('')
  const [travelError, setTravelError] = useState<string | null>(null)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [lastCheckedDates, setLastCheckedDates] = useState<{startDate: string; endDate: string} | null>(null)

  useEffect(() => {
    if (isOpen) {
      checkRestrictions()
    }
  }, [isOpen])

  const checkRestrictions = () => {
    if (userId && startDate && endDate && onCheckRestrictions) {
      if (lastCheckedDates?.startDate === startDate && lastCheckedDates?.endDate === endDate) {
        return
      }
      setLastCheckedDates({ startDate, endDate })
      onCheckRestrictions(userId, { startDate, endDate })
    } else {
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
    setTravelError(null)

    if (hasTravel) {
      if (!travelDestination.trim()) {
        setTravelError('Укажите город проезда')
        return
      }
      for (let i = 0; i < travelChildren.length; i++) {
        if (!travelChildren[i].fullName.trim()) {
          setTravelError('Укажите ФИО ребёнка')
          return
        }
        if (!travelChildren[i].birthDate) {
          setTravelError('Укажите дату рождения ребёнка')
          return
        }
        const age = (Date.now() - new Date(travelChildren[i].birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        if (age >= 18) {
          setTravelError('Ребёнок должен быть младше 18 лет')
          return
        }
      }
    }

    const referenceDocument = referenceFile ? referenceFile.name : undefined
    
    onSubmit({
      vacationType,
      hasTravel,
      travelDestination: hasTravel ? travelDestination.trim() || undefined : undefined,
      travelChildren: hasTravel ? travelChildren : [],
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
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4 animate-scale-in">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Создать заявку на отпуск</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Даты отпуска */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Период отпуска
            </label>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="font-semibold">{format(start, 'dd.MM.yyyy', { locale: ru })}</span>
              <span>—</span>
              <span className="font-semibold">{format(end, 'dd.MM.yyyy', { locale: ru })}</span>
              <span className="text-muted-foreground">({duration} {duration === 1 ? 'день' : duration >= 2 && duration <= 4 ? 'дня' : 'дней'})</span>
            </div>
          </div>

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
                <p className="text-xs text-green-600 mt-1">
                  Проезд доступен{balance.travelAvailableUntil ? ` до ${new Date(balance.travelAvailableUntil).toLocaleDateString('ru-RU')}` : ''}
                </p>
              ) : (
                <p className="text-xs text-destructive mt-1">
                  Проезд недоступен до {balance?.travelNextAvailableDate ? new Date(balance.travelNextAvailableDate).toLocaleDateString('ru-RU') : 'неизвестной даты'}
                </p>
              )}
              {hasTravel && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label htmlFor="travelDestination" className="block text-sm font-medium text-muted-foreground mb-1">
                      Город (страна — при выезде за границу)
                    </label>
                    <input
                      type="text"
                      id="travelDestination"
                      value={travelDestination}
                      onChange={(e) => setTravelDestination(e.target.value)}
                      placeholder="Напр. Москва"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">
                        Несовершеннолетние дети
                      </label>
                      <button
                        type="button"
                        onClick={() => setTravelChildren([...travelChildren, { fullName: '', birthDate: '' }])}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Добавить ребёнка
                      </button>
                    </div>

                    {travelChildren.map((child, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <input
                          type="text"
                          placeholder="ФИО ребёнка"
                          value={child.fullName}
                          onChange={(e) => {
                            const updated = [...travelChildren]
                            updated[index] = { ...updated[index], fullName: e.target.value }
                            setTravelChildren(updated)
                          }}
                          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        />
                        <input
                          type="date"
                          value={child.birthDate}
                          onChange={(e) => {
                            const updated = [...travelChildren]
                            updated[index] = { ...updated[index], birthDate: e.target.value }
                            setTravelChildren(updated)
                          }}
                          className="w-[140px] rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setTravelChildren(travelChildren.filter((_, i) => i !== index))}
                          className="p-2 text-destructive hover:text-destructive/80 mt-0.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {travelChildren.length === 0 && (
                      <p className="text-xs text-muted-foreground">Нет детей для проезда</p>
                    )}
                  </div>
                </div>
              )}
              {travelError && (
                <p className="text-xs text-destructive mt-2">{travelError}</p>
              )}
            </div>
          </div>

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
                  <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary rounded-lg">
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
                          : 'border-input hover:bg-primary/10'
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
          {countsInCounter && (
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
