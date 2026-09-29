import { format } from 'date-fns'
import { useVacationDuration, useReturnToWork, pluralDays } from '@/shared/lib/productionCalendar'
import { useAllowOverBalance } from '@/modules/vacation/store/vacationSettingsStore'
import { useState, useEffect, useRef } from 'react'
import { RestrictionWarnings } from '@/modules/vacation/components/RestrictionWarnings'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { VacationType, VACATION_TYPES } from '@/shared/types'
import type { VacationEmployee, VacationValidationErrorDetails, RestrictionConflict } from '@/shared/types'
import { Button } from '@/shared/components/ui/Button'
import { X, FileText, Upload, Plus, Trash2 } from 'lucide-react'
import { personName } from '@/shared/lib/utils'

interface CreateVacationFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    startDate: string
    endDate: string
    vacationType: VacationType
    hasTravel: boolean
    travelDestination?: string
    travelChildren?: Array<{ fullName: string; birthDate: string }>
    comment: string
    referenceDocument?: string
    substitute_ids?: number[]
  }) => void
  loading?: boolean
  balance?: {
    availableDays: number
    travelAvailable: boolean
    travelNextAvailableDate?: string
    travelAvailableUntil?: string
  }
  restrictionWarnings?: Array<{
    message: string
    details?: VacationValidationErrorDetails
    conflicts?: RestrictionConflict[]
  }>
  userId?: string
  onCheckRestrictions?: (userId: string, data: { startDate: string; endDate: string }) => void
  showSubstitutes?: boolean
  mode?: 'create' | 'edit'
  initial?: {
    startDate: string
    endDate: string
    vacationType: VacationType
    hasTravel: boolean
    travelDestination?: string
    travelChildren?: Array<{ fullName: string; birthDate: string }>
    comment?: string
    referenceDocument?: string
    substituteIds?: number[]
  }
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
  showSubstitutes = false,
  mode = 'create',
  initial,
}: CreateVacationFormModalProps) {
  const isEdit = mode === 'edit'
  useModalOpen(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [vacationType, setVacationType] = useState<VacationType>(initial?.vacationType ?? VacationType.ANNUAL_PAID)
  const [hasTravel, setHasTravel] = useState(initial?.hasTravel ?? false)
  const [travelDestination, setTravelDestination] = useState(initial?.travelDestination ?? '')
  const [travelChildren, setTravelChildren] = useState<Array<{ fullName: string; birthDate: string }>>(initial?.travelChildren ?? [])
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [lastCheckedDates, setLastCheckedDates] = useState<{startDate: string; endDate: string} | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [selectedSubstitutes, setSelectedSubstitutes] = useState<number[]>(initial?.substituteIds ?? [])
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [employees, setEmployees] = useState<Array<{ id: number; first_name: string; last_name: string; middle_name?: string | null; position: string }>>([])

  useEffect(() => {
    if (isOpen && showSubstitutes) {
      import('@/shared/lib/api').then(({ API_BASE_URL }) => {
        import('@/shared/lib/authHeaders').then(({ getAuthHeaders }) => {
          fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() })
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
              const raw: VacationEmployee[] = Array.isArray(data) ? data : data.users || []
              const list = raw.map((u) => ({
                id: u.id, first_name: u.first_name, last_name: u.last_name, middle_name: u.middle_name, position: u.position || ''
              })).filter((u) => u.id !== parseInt(userId || '0'))
              setEmployees(list)
            })
            .catch(() => {})
        })
      })
    }
  }, [isOpen, showSubstitutes, userId])

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (userId && startDate && endDate && onCheckRestrictions) {
      if (lastCheckedDates?.startDate === startDate && lastCheckedDates?.endDate === endDate) {
        return
      }

      const timer = setTimeout(() => {
        setLastCheckedDates({ startDate, endDate })
        onCheckRestrictions(userId, { startDate, endDate })
      }, 500)

      debounceTimerRef.current = timer
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [startDate, endDate, userId, onCheckRestrictions, lastCheckedDates])

  const vacationDuration = useVacationDuration(startDate, endDate)
  const returnDate = useReturnToWork(endDate)
  const allowOverBalance = useAllowOverBalance()

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const validationErrors: Record<string, string> = {}
    if (!startDate) validationErrors.startDate = 'Укажите дату начала'
    if (!endDate) validationErrors.endDate = 'Укажите дату окончания'
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) validationErrors.endDate = 'Дата окончания раньше даты начала'

    if (hasTravel) {
      if (!travelDestination.trim()) {
        validationErrors.travelDestination = 'Укажите город проезда'
      }
      for (let i = 0; i < travelChildren.length; i++) {
        if (!travelChildren[i].fullName.trim()) {
          validationErrors[`child_${i}_name`] = 'Укажите ФИО ребёнка'
          break
        }
        if (!travelChildren[i].birthDate) {
          validationErrors[`child_${i}_dob`] = 'Укажите дату рождения ребёнка'
          break
        }
        const age = (Date.now() - new Date(travelChildren[i].birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        if (age >= 18) {
          validationErrors[`child_${i}_age`] = 'Ребёнок должен быть младше 18 лет'
          break
        }
      }
    }

    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    const referenceDocument = referenceFile ? referenceFile.name : initial?.referenceDocument

    onSubmit({
      startDate,
      endDate,
      vacationType,
      hasTravel,
      travelDestination: hasTravel ? travelDestination.trim() || undefined : undefined,
      travelChildren: hasTravel ? travelChildren : [],
      comment,
      referenceDocument,
      substitute_ids: showSubstitutes ? selectedSubstitutes : undefined,
    })
  }

  const vacationTypeInfo = VACATION_TYPES[vacationType]
  const countsInCounter = vacationTypeInfo?.countedInCounter
  const duration = vacationDuration.countedDays
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
      <div className="bg-card rounded-xl border border-border/60 shadow-sm w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col animate-scale-in">
        <div className="p-6 border-b border-border/60 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">{isEdit ? 'Изменить заявку на отпуск' : 'Создать заявку на отпуск'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground interactive transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin overscroll-contain">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-muted-foreground mb-1.5">
                Дата начала
              </label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="w-full border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading}
              />
              {errors.startDate && (
                <p className="text-xs text-destructive mt-1">{errors.startDate}</p>
              )}
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-muted-foreground mb-1.5">
                Дата окончания
              </label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || format(new Date(), 'yyyy-MM-dd')}
                className="w-full border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading || !startDate}
              />
              {errors.endDate && (
                <p className="text-xs text-destructive mt-1">{errors.endDate}</p>
              )}
            </div>
          </div>

          {vacationDuration.calendarDays > 0 && (
            <div className="space-y-0.5 text-sm text-muted-foreground">
              <div>Продолжительность: {duration} {pluralDays(duration)}</div>
              {vacationDuration.holidays > 0 && (
                <div className="text-xs">Праздничные дни не входят в отпуск: {vacationDuration.holidays} из {vacationDuration.calendarDays} календарных</div>
              )}
              {returnDate && (
                <div className="text-xs">Выход на работу: <span className="font-medium text-foreground">{returnDate.split('-').reverse().join('.')}</span></div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="vacationType" className="block text-sm font-medium text-muted-foreground mb-1.5">
              Тип отпуска
            </label>
            <select
              id="vacationType"
              value={vacationType}
              onChange={(e) => setVacationType(e.target.value as VacationType)}
              className="w-full border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
              </div>
            </div>

            {hasTravel && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="travelDestination" className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Город назначения
                  </label>
                  <input
                    type="text"
                    id="travelDestination"
                    value={travelDestination}
                    onChange={(e) => setTravelDestination(e.target.value)}
                    className="w-full border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Введите город проезда"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                <label className="block text-sm font-medium text-muted-foreground">Несовершеннолетние дети</label>
                {travelChildren.map((child, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="ФИО ребёнка"
                        value={child.fullName}
                        onChange={(e) => {
                          const updated = [...travelChildren]
                          updated[index] = { ...updated[index], fullName: e.target.value }
                          setTravelChildren(updated)
                        }}
                        className="w-full border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                        disabled={loading}
                      />
                      <input
                        type="date"
                        value={child.birthDate}
                        onChange={(e) => {
                          const updated = [...travelChildren]
                          updated[index] = { ...updated[index], birthDate: e.target.value }
                          setTravelChildren(updated)
                        }}
                        className="w-full border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setTravelChildren(travelChildren.filter((_, i) => i !== index))}
                      className="p-2 text-destructive hover:text-destructive/80 mt-0.5"
                      disabled={loading}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTravelChildren([...travelChildren, { fullName: '', birthDate: '' }])}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
                  disabled={loading}
                >
                  <Plus className="w-4 h-4" />
                  Добавить ребёнка
                </button>
              </div>
              </div>
            )}

          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-muted-foreground mb-1.5">
              Комментарий <span className="text-muted-foreground">(необязательно)</span>
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Укажите причину или дополнительные сведения..."
              disabled={loading}
            />
          </div>

          {showSubstitutes && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Замещающие <span className="text-muted-foreground">(необязательно)</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Выберите работников, которые будут замещать вас на время отпуска. Им будут перенаправлены заявки на согласование.
              </p>
              <input
                type="text"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Поиск работника..."
                className="w-full border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm mb-2"
                disabled={loading}
              />
              <div className="max-h-40 overflow-y-auto border border-input rounded-lg">
                {employees
                  .filter((e) => {
                    const q = employeeSearch.toLowerCase()
                    return !q || `${personName(e.last_name, e.first_name, e.middle_name)} ${e.position}`.toLowerCase().includes(q)
                  })
                  .map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubstitutes.includes(e.id)}
                        onChange={() => {
                          setSelectedSubstitutes((prev) =>
                            prev.includes(e.id) ? prev.filter((id) => id !== e.id) : [...prev, e.id]
                          )
                        }}
                        className="rounded"
                      />
                      <span>{personName(e.last_name, e.first_name, e.middle_name)}</span>
                      {e.position && <span className="text-muted-foreground text-xs">— {e.position}</span>}
                    </label>
                  ))}
              </div>
              {selectedSubstitutes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedSubstitutes.map((id) => {
                    const emp = employees.find((e) => e.id === id)
                    if (!emp) return null
                    return (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs">
                        {personName(emp.last_name, emp.first_name, emp.middle_name)}
                        <button
                          type="button"
                          onClick={() => setSelectedSubstitutes((prev) => prev.filter((x) => x !== id))}
                          className="hover:text-primary/70"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {vacationType === VacationType.EDUCATIONAL && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
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
                      className="text-primary hover:text-primary/80 p-1 interactive"
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

          {countsInCounter && duration > 0 && (
            <div className={`p-3 rounded-lg ${
              hasEnoughDays
                ? 'bg-success/10 dark:bg-success/25 border border-success/30 dark:border-success/60 text-success dark:text-success-foreground'
                : 'bg-destructive/10 dark:bg-destructive/25 border border-destructive/30 dark:border-destructive/60 text-destructive dark:text-destructive-foreground'
            }`}>
              <div className="text-sm">
                <div className="font-medium mb-1">
                  {hasEnoughDays ? '✅ Достаточно дней' : allowOverBalance ? '⚠️ Недостаточно дней — отпуск будет оформлен сверх баланса' : '⚠️ Недостаточно дней'}
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

          <RestrictionWarnings warnings={restrictionWarnings} />

          </div>
          <div className="px-6 py-4 border-t border-border/60 shrink-0">
            <div className="flex gap-3">
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
                (countsInCounter && !hasEnoughDays && !allowOverBalance) ||
                (hasTravel && !canUseTravel) ||
                (vacationType === VacationType.EDUCATIONAL && !referenceFile && !initial?.referenceDocument)
              }
              className="flex-1"
            >
              {isEdit ? (loading ? 'Сохранение...' : 'Сохранить изменения') : (loading ? 'Создание...' : 'Создать заявку')}
            </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
