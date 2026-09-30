import { useVacationDuration, useReturnToWork, pluralDays } from '@/shared/lib/productionCalendar'
import { useAllowOverBalance } from '@/modules/vacation/store/vacationSettingsStore'
import { DAY_OFF_HINT } from '@/modules/vacation/lib/dayOffs'
import { useState, useEffect } from 'react'
import { RestrictionWarnings } from '@/modules/vacation/components/RestrictionWarnings'
import { createPortal } from 'react-dom'
import { VacationType, VACATION_TYPES } from '@/shared/types'
import type { VacationEmployee, VacationValidationErrorDetails, RestrictionConflict } from '@/shared/types'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { Button } from '@/shared/components/ui/Button'
import { Upload, FileText, X, Plus, Trash2, UserCheck, Search } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { useAuthStore } from '@/core/auth/store/authStore'
import { personName } from '@/shared/lib/utils'

interface Employee {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position: string
  department_id?: number | null
  department_name?: string | null
}

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
    substitute_ids?: number[]
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
    details?: VacationValidationErrorDetails
    conflicts?: RestrictionConflict[]
  }>
  onCheckRestrictions?: (userId: string, data: { startDate: string; endDate: string }) => void
  showSubstitutes?: boolean
  dayOffsAvailable?: number
  dayOffOnly?: boolean
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
  showSubstitutes = false,
  dayOffsAvailable = 0,
  dayOffOnly = false,
}: CreateVacationModalProps) {
  useModalOpen(isOpen)
  const vacationDuration = useVacationDuration(startDate, endDate)
  const returnDate = useReturnToWork(endDate)
  const allowOverBalance = useAllowOverBalance()
  const user = useAuthStore(s => s.user)
  const [vacationType, setVacationType] = useState<VacationType>(dayOffOnly ? VacationType.DAY_OFF : VacationType.ANNUAL_PAID)
  const [hasTravel, setHasTravel] = useState(false)
  const [travelDestination, setTravelDestination] = useState('')
  const [travelChildren, setTravelChildren] = useState<Array<{ fullName: string; birthDate: string }>>([])
  const [comment, setComment] = useState('')
  const [travelError, setTravelError] = useState<string | null>(null)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [lastCheckedDates, setLastCheckedDates] = useState<{startDate: string; endDate: string} | null>(null)
  const [substituteIds, setSubstituteIds] = useState<number[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [showSubstituteModal, setShowSubstituteModal] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSelected, setPickerSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showSubstituteModal) {
        setShowSubstituteModal(false)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose, showSubstituteModal])

  useEffect(() => {
    if (!isOpen) return
    if (userId && startDate && endDate && onCheckRestrictions) {
      if (lastCheckedDates?.startDate === startDate && lastCheckedDates?.endDate === endDate) {
        return
      }
      setLastCheckedDates({ startDate, endDate })
      onCheckRestrictions(userId, { startDate, endDate })
    }
  }, [isOpen, userId, startDate, endDate, onCheckRestrictions, lastCheckedDates])

  useEffect(() => {
    if (isOpen && showSubstitutes) {
      fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : [])
        .then((data) => {
          const raw: VacationEmployee[] = Array.isArray(data) ? data : data.users || []
          const list = raw
            .filter((u) => u.id !== Number(userId))
            .map((u) => ({
              id: u.id,
              first_name: u.first_name,
              last_name: u.last_name,
              middle_name: u.middle_name,
              position: u.position || '',
              department_id: u.department_id,
              department_name: u.department_name,
            }))
          setEmployees(list)
        })
        .catch(() => {})
    }
  }, [isOpen, showSubstitutes, userId])

  if (!isOpen || !startDate || !endDate) {
    return null
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  const isDayOff = vacationType === VacationType.DAY_OFF
  const duration = isDayOff ? vacationDuration.workingDays : vacationDuration.countedDays
  const hasEnoughDayOffs = duration > 0 && dayOffsAvailable >= duration
  const typeOptions = dayOffOnly
    ? [VacationType.DAY_OFF]
    : Object.values(VacationType).filter((t) => t !== VacationType.DAY_OFF || dayOffsAvailable > 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTravelError(null)

    if (hasTravel && !isDayOff) {
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
      hasTravel: hasTravel && !isDayOff,
      travelDestination: hasTravel ? travelDestination.trim() || undefined : undefined,
      travelChildren: hasTravel ? travelChildren : [],
      comment,
      referenceDocument,
      substitute_ids: showSubstitutes && substituteIds.length > 0 ? substituteIds : undefined,
    })
  }

  const canUseTravel = balance?.travelAvailable && hasTravel
  const vacationTypeInfo = VACATION_TYPES[vacationType]
  const countsInCounter = vacationTypeInfo?.countedInCounter
  const requiredDays = countsInCounter ? duration : 0
  const hasEnoughDays = !countsInCounter || (balance?.availableDays || 0) >= requiredDays

  const openSubstitutePicker = () => {
    setPickerSelected(new Set(substituteIds))
    setPickerSearch('')
    setShowSubstituteModal(true)
  }

  const confirmSubstitutePicker = () => {
    setSubstituteIds([...pickerSelected])
    setShowSubstituteModal(false)
  }

  const togglePickerItem = (id: number) => {
    setPickerSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const userDeptId = user?.departmentId ? Number(user.departmentId) : null
  const filteredEmployees = employees.filter((e) => {
    const q = pickerSearch.toLowerCase()
    return !q || `${personName(e.last_name, e.first_name, e.middle_name)} ${e.position}`.toLowerCase().includes(q)
  })
  const myDeptEmployees = filteredEmployees.filter(e => e.department_id != null && e.department_id === userDeptId)
  const otherEmployees = filteredEmployees.filter(e => e.department_id !== userDeptId)

  const renderEmployee = (e: Employee) => (
    <label
      key={e.id}
      className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer text-sm rounded-lg"
    >
      <input
        type="checkbox"
        checked={pickerSelected.has(e.id)}
        onChange={() => togglePickerItem(e.id)}
        className="rounded h-4 w-4"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{personName(e.last_name, e.first_name, e.middle_name)}</div>
        {e.position && <div className="text-xs text-muted-foreground truncate">{e.position}</div>}
      </div>
    </label>
  )

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4 animate-scale-in max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b shrink-0">
          <h2 className="text-xl font-semibold">{isDayOff ? 'Оформить отгул' : 'Создать заявку на отпуск'}</h2>
          {dayOffOnly && (
            <p className="mt-1 text-xs text-muted-foreground">Подача заявок на отпуск на эти даты сейчас недоступна, но отгул оформить можно.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin overscroll-contain">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {isDayOff ? 'Период отгула' : 'Период отпуска'}
            </label>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="font-semibold">{format(start, 'dd.MM.yyyy', { locale: ru })}</span>
              <span>—</span>
              <span className="font-semibold">{format(end, 'dd.MM.yyyy', { locale: ru })}</span>
              <span className="text-muted-foreground">({duration} {isDayOff ? 'раб. ' : ''}{pluralDays(duration)})</span>
            </div>
            {isDayOff && duration !== vacationDuration.calendarDays && (
              <p className="mt-1 text-xs text-muted-foreground">
                Отгул считается в рабочих днях: {duration} из {vacationDuration.calendarDays} календарных
              </p>
            )}
            {!isDayOff && vacationDuration.holidays > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Праздничные дни не входят в отпуск: {vacationDuration.holidays} из {vacationDuration.calendarDays} календарных
              </p>
            )}
            {returnDate && (
              <p className="mt-1 text-xs text-muted-foreground">
                Выход на работу: <span className="font-medium text-foreground">{format(new Date(`${returnDate}T12:00:00`), 'dd.MM.yyyy', { locale: ru })}</span>
              </p>
            )}
          </div>

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
              {typeOptions.map((type) => {
                const info = VACATION_TYPES[type]
                return (
                  <option key={type} value={type}>
                    {info.name}
                  </option>
                )
              })}
            </select>
            {vacationTypeInfo?.description && (
              <p className="text-xs text-muted-foreground mt-1">{vacationTypeInfo.description}</p>
            )}
          </div>

          {!isDayOff && (
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
          )}

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

          {showSubstitutes && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openSubstitutePicker}
                disabled={loading}
                className="gap-2"
              >
                <UserCheck className="h-4 w-4" />
                {substituteIds.length > 0 ? `Замещающих: ${substituteIds.length}` : 'Добавить замещение'}
              </Button>
              {substituteIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {substituteIds.map(id => {
                    const emp = employees.find(e => e.id === id)
                    if (!emp) return null
                    return (
                      <div key={id} className="group relative">
                        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-xs font-medium text-primary">
                          {emp.last_name[0]}{emp.first_name[0]}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSubstituteIds(prev => prev.filter(x => x !== id))}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {emp.last_name}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

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

          {countsInCounter && (
            <div className={`p-3 rounded-lg ${
              hasEnoughDays
                ? 'bg-success/10 dark:bg-success/25 border border-success/30 dark:border-success/60 text-success dark:text-success-foreground'
                : 'bg-destructive/10 dark:bg-destructive/25 border border-destructive/30 dark:border-destructive/60 text-destructive dark:text-destructive-foreground'
            }`}>
              <div className="text-sm">
                <div className="font-medium mb-1">
                  {hasEnoughDays ? '✅ Достаточно дней' : allowOverBalance ? '⚠️ Недостаточно дней — отпуск будет оформлен сверх баланса' : '⚠️ Недостаточно дней'}
                </div>
                <div className="opacity-70">
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

          {isDayOff && (
            <div className={`p-3 rounded-lg text-sm ${
              hasEnoughDayOffs
                ? 'bg-success/10 dark:bg-success/25 border border-success/30 dark:border-success/60 text-success dark:text-success-foreground'
                : 'bg-destructive/10 dark:bg-destructive/25 border border-destructive/30 dark:border-destructive/60 text-destructive dark:text-destructive-foreground'
            }`}>
              <div className="font-medium mb-1">
                {duration === 0 ? '⚠️ В выбранном периоде нет рабочих дней' : hasEnoughDayOffs ? '✅ Достаточно отгулов' : '⚠️ Недостаточно отгулов'}
              </div>
              <div className="opacity-70">Требуется: {duration} · Доступно отгулов: {dayOffsAvailable}</div>
              <div className="mt-1 text-xs text-muted-foreground">{DAY_OFF_HINT}</div>
            </div>
          )}

          {!isDayOff && <RestrictionWarnings warnings={restrictionWarnings} />}

          </div>
          <div className="px-6 py-4 border-t shrink-0">
            <div className="flex gap-3">
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
                (isDayOff && !hasEnoughDayOffs) ||
                (countsInCounter && !hasEnoughDays && !allowOverBalance) ||
                (!isDayOff && hasTravel && !canUseTravel) ||
                (vacationType === VacationType.EDUCATIONAL && !referenceFile)
              }
              className="flex-1"
            >
              {loading ? 'Создание...' : 'Создать заявку'}
            </Button>
            </div>
          </div>
        </form>
      </div>

      {showSubstituteModal && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 animate-scale-in max-h-[80vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between shrink-0">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" />
                Выберите замещающих
              </h3>
              <button
                type="button"
                onClick={() => setShowSubstituteModal(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Поиск работника..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-2">
              {myDeptEmployees.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Мой отдел
                  </div>
                  {myDeptEmployees.map(renderEmployee)}
                </div>
              )}
              {otherEmployees.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Другие работники
                  </div>
                  {otherEmployees.map(renderEmployee)}
                </div>
              )}
              {filteredEmployees.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Ничего не найдено
                </div>
              )}
            </div>

            <div className="p-4 border-t flex items-center justify-between shrink-0">
              <span className="text-sm text-muted-foreground">
                Выбрано: {pickerSelected.size}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSubstituteModal(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmSubstitutePicker}
                  disabled={pickerSelected.size === 0}
                >
                  Добавить
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  )
}
