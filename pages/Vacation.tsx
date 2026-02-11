import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useVacationStore } from '@/store/vacationStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { YearCalendar } from '@/components/calendar/YearCalendar'
import { CreateVacationModal } from '@/components/modals/CreateVacationModal'
import { CreateVacationFormModal } from '@/components/modals/CreateVacationFormModal'
import { VacationDetailModal } from '@/components/modals/VacationDetailModal'
import { VacationHistoryModal } from '@/components/modals/VacationHistoryModal'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { VacationRequestStatus, VacationType } from '@/types'

export function Vacation() {
  const user = useAuthStore((state) => state.user)
  const {
    currentUserRequests,
    departmentRequests,
    loading,
    error,
    fetchAllRequests,
    fetchUserRequests,
    fetchDepartmentRequests,
    fetchBalance,
    approveRequest,
    rejectRequest,
  } = useVacationStore()

  const [balance, setBalance] = useState<any>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null)
  const [selectedStartDate, setSelectedStartDate] = useState<string | null>(null)
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(null)
  const [showCreateFromCalendar, setShowCreateFromCalendar] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailRequest, setDetailRequest] = useState<any>(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchUserRequests(user.id)
      fetchBalance(user.id).then(setBalance)

      if (user.role === 'manager') {
        fetchAllRequests()
      } else {
        fetchDepartmentRequests(user.departmentId || '1')
      }
    }
  }, [user?.id, user?.departmentId, user?.role])

  const handleApprove = async (requestId: string) => {
    if (!user) return
    try {
      await approveRequest(requestId, user.id)
      window.location.reload()
    } catch (err) {
      console.error('Error approving request:', err)
    }
  }

  const handleReject = async (requestId: string) => {
    if (!user || !rejectionReason.trim()) return
    try {
      await rejectRequest(requestId, user.id, rejectionReason)
      setRejectingRequestId(null)
      setRejectionReason('')
      window.location.reload()
    } catch (err) {
      console.error('Error rejecting request:', err)
    }
  }

  const handleCancelClick = (requestId: string) => {
    setCancellingRequestId(requestId)
    setShowCancelModal(true)
  }

  const handleCancelConfirm = async () => {
    if (!user || !cancellingRequestId) return
    try {
      await useVacationStore.getState().cancelRequest(cancellingRequestId)
      setShowCancelModal(false)
      setCancellingRequestId(null)
      window.location.reload()
    } catch (err) {
      console.error('Error canceling request:', err)
    }
  }

  const handleCancelClose = () => {
    setShowCancelModal(false)
    setCancellingRequestId(null)
  }

  const handleDateRangeSelect = (startDate: string | null, endDate: string | null) => {
    console.log('handleDateRangeSelect called', { startDate, endDate })

    if (startDate && !endDate && startDate.startsWith('vr-')) {
      const requestId = startDate.replace('vr-', '')
      const request = departmentRequests.find(r => r.id === requestId)
      console.log('Found request:', request)
      if (request) {
        setDetailRequest(request)
        setShowDetailModal(true)
      }
      return
    }

    setSelectedStartDate(startDate)
    setSelectedEndDate(endDate)
    if (startDate && endDate) {
      setShowCreateFromCalendar(true)
    } else {
      setShowCreateFromCalendar(false)
    }
  }

  const handleCreateFromModal = async (data: {
    vacationType: VacationType
    hasTravel: boolean
    comment: string
  }) => {
    if (!user || !selectedStartDate || !selectedEndDate) return

    try {
      await useVacationStore.getState().createRequest(user.id, {
        startDate: selectedStartDate,
        endDate: selectedEndDate,
        vacationType: data.vacationType,
        comment: data.comment,
        hasTravel: data.hasTravel,
      })
      setSelectedStartDate(null)
      setSelectedEndDate(null)
      setShowCreateFromCalendar(false)
      window.location.reload()
    } catch (err) {
      console.error('Error creating request:', err)
    }
  }

  const handleCloseModal = () => {
    setShowCreateFromCalendar(false)
  }

  const handleCreateFromForm = async (data: {
    startDate: string
    endDate: string
    vacationType: VacationType
    hasTravel: boolean
    travelDestination?: string
    comment: string
    referenceDocument?: string
  }) => {
    if (!user) return

    try {
      await useVacationStore.getState().createRequest(user.id, {
        startDate: data.startDate,
        endDate: data.endDate,
        vacationType: data.vacationType,
        comment: data.comment,
        hasTravel: data.hasTravel,
        travelDestination: data.travelDestination,
        referenceDocument: data.referenceDocument,
      })
      setShowCreateForm(false)
      window.location.reload()
    } catch (err) {
      console.error('Error creating request:', err)
    }
  }

  const handleCloseDetailModal = () => {
    setShowDetailModal(false)
    setDetailRequest(null)
  }

  const currentYear = 2026
  const isManager = user?.role === 'manager' || user?.role === 'hr' || user?.role === 'admin'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <span className="text-4xl">✈️</span>
            Отпуск
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isManager ? 'Управление отпусками сотрудников' : 'Управление вашими отпусками'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowHistoryModal(true)}
          size="default"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          История заявок
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {balance && (
        <Card className="overflow-hidden">
          <div className="p-6 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="p-2 bg-primary/10 rounded-lg">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              Баланс отпускных дней
            </h2>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">{balance.totalDays}</div>
                <div className="text-sm text-muted-foreground mt-2 font-medium">Всего дней</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl font-bold bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">{balance.usedDays}</div>
                <div className="text-sm text-muted-foreground mt-2 font-medium">Использовано</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">{balance.availableDays}</div>
                <div className="text-sm text-muted-foreground mt-2 font-medium">Доступно</div>
              </div>
            </div>
            {balance.travelAvailable && (
              <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">Проезд доступен</span>
                  {balance.travelNextAvailableDate && (
                    <span className="text-muted-foreground"> (следующая дата: {new Date(balance.travelNextAvailableDate).toLocaleDateString('ru-RU')})</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="p-6">
          <YearCalendar
            year={currentYear}
            requests={departmentRequests}
            onDateRangeSelect={handleDateRangeSelect}
            selectedStartDate={selectedStartDate}
            selectedEndDate={selectedEndDate}
          />
          {showCreateFromCalendar && selectedStartDate && selectedEndDate && (
            <CreateVacationModal
              isOpen={showCreateFromCalendar}
              startDate={selectedStartDate}
              endDate={selectedEndDate}
              onClose={handleCloseModal}
              onSubmit={handleCreateFromModal}
              loading={loading}
              balance={balance}
            />
          )}
        </div>
      </Card>

      {isManager && departmentRequests.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="p-2 bg-amber-500/10 rounded-lg">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              Заявки на согласовании
            </h2>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
            ) : (
              <div className="space-y-4">
                {departmentRequests
                  .filter((r) => r.status === VacationRequestStatus.ON_APPROVAL)
                  .map((request) => (
                    <div key={request.id} className="border-2 border-amber-500/20 rounded-2xl p-5 bg-gradient-to-br from-amber-500/5 to-transparent hover:border-amber-500/40 hover:shadow-lg transition-all duration-300">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white font-bold shadow-lg">
                              {request.userFirstName[0]}{request.userLastName[0]}
                            </div>
                            <div>
                              <div className="font-bold text-lg">
                                {request.userLastName} {request.userFirstName}
                              </div>
                              <div className="text-sm text-muted-foreground">{request.userPosition}</div>
                            </div>
                          </div>
                          <div className="text-sm mt-1 text-foreground/80">
                            {request.vacationType === 'annual_paid'
                              ? 'Ежегодный оплачиваемый отпуск'
                              : request.vacationType === 'unpaid'
                              ? 'Отпуск без сохранения заработной платы'
                              : request.vacationType === 'educational'
                              ? 'Учебный отпуск'
                              : request.vacationType === 'maternity'
                              ? 'Отпуск по беременности и родам'
                              : request.vacationType === 'child_care'
                              ? 'Отпуск по уходу за ребёнком'
                              : request.vacationType === 'additional'
                              ? 'Дополнительный отпуск'
                              : request.vacationType === 'veteran'
                              ? 'Ветеранский отпуск'
                              : 'Отпуск'}
                          </div>
                          <div className="text-sm mt-2">
                            {new Date(request.startDate).toLocaleDateString('ru-RU')} -{' '}
                            {new Date(request.endDate).toLocaleDateString('ru-RU')} ({request.duration} дней)
                          </div>
                          {request.comment && (
                            <div className="text-sm text-muted-foreground mt-1">Комментарий: {request.comment}</div>
                          )}
                          {request.hasTravel && (
                            <div className="text-sm text-primary/70 mt-1">С проездом{request.travelDestination && ` до ${request.travelDestination}`}</div>
                          )}
                        </div>
                        <div className="flex gap-3">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(request.id)}
                            disabled={loading}
                            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-500/30"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Согласовать
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectingRequestId(request.id)}
                            disabled={loading}
                            className="border-destructive/30 text-destructive hover:bg-destructive/10"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Отклонить
                          </Button>
                        </div>
                      </div>
                      {rejectingRequestId === request.id && (
                        <div className="mt-4 pt-4 border-t">
                          <textarea
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="Причина отклонения..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                          />
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" onClick={() => handleReject(request.id)}>
                              Подтвердить
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRejectingRequestId(null)
                                setRejectionReason('')
                              }}
                            >
                              Отмена
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                {departmentRequests.filter((r) => r.status === VacationRequestStatus.ON_APPROVAL)
                  .length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">Нет заявок на согласовании</div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {currentUserRequests.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="p-2 bg-primary/10 rounded-lg">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </span>
              Мои заявки
            </h2>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
            ) : (
              <div className="space-y-4">
                {currentUserRequests
                  .filter((r) =>
                    r.status === VacationRequestStatus.ON_APPROVAL ||
                    r.status === VacationRequestStatus.APPROVED
                  )
                  .map((request) => (
                  <div key={request.id} className={`border-2 rounded-2xl p-5 transition-all duration-300 hover:shadow-lg ${
                    request.status === VacationRequestStatus.APPROVED
                      ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent hover:border-emerald-500/50'
                      : 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent hover:border-amber-500/50'
                  }`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 space-y-3">
                        <div className="text-sm mt-1 text-foreground/80">
                          {request.vacationType === 'annual_paid'
                            ? 'Ежегодный оплачиваемый отпуск'
                            : request.vacationType === 'unpaid'
                            ? 'Отпуск без сохранения заработной платы'
                            : request.vacationType === 'educational'
                            ? 'Учебный отпуск'
                            : request.vacationType === 'maternity'
                            ? 'Отпуск по беременности и родам'
                            : request.vacationType === 'child_care'
                            ? 'Отпуск по уходу за ребёнком'
                            : request.vacationType === 'additional'
                            ? 'Дополнительный отпуск'
                            : request.vacationType === 'veteran'
                            ? 'Ветеранский отпуск'
                            : 'Отпуск'}
                        </div>
                        <div className="text-sm mt-2">
                          {new Date(request.startDate).toLocaleDateString('ru-RU')} -{' '}
                          {new Date(request.endDate).toLocaleDateString('ru-RU')} ({request.duration} дней)
                        </div>
                        {request.comment && (
                          <div className="text-sm text-muted-foreground mt-1">Комментарий: {request.comment}</div>
                        )}
                        {request.hasTravel && (
                          <div className="text-sm text-primary/70 mt-1">С проездом{request.travelDestination && ` до ${request.travelDestination}`}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {request.status === VacationRequestStatus.ON_APPROVAL && (
                          <Badge variant="warning">
                            На согласовании
                          </Badge>
                        )}
                        {request.status === VacationRequestStatus.APPROVED && (
                          <Badge variant="success">
                            Согласовано
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleCancelClick(request.id)}
                          disabled={loading}
                        >
                          Отменить
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {currentUserRequests.filter((r) =>
                  r.status === VacationRequestStatus.ON_APPROVAL ||
                  r.status === VacationRequestStatus.APPROVED
                ).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">Нет активных заявок</div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {showDetailModal && (
        <VacationDetailModal
          isOpen={showDetailModal}
          request={detailRequest}
          onClose={handleCloseDetailModal}
        />
      )}

      {showCreateForm && (
        <CreateVacationFormModal
          isOpen={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          onSubmit={handleCreateFromForm}
          loading={loading}
          balance={balance}
        />
      )}

      {showHistoryModal && (
        <VacationHistoryModal
          isOpen={showHistoryModal}
          requests={isManager ? departmentRequests : currentUserRequests}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {showCancelModal && (
        <ConfirmModal
          isOpen={showCancelModal}
          title="Отменить заявку?"
          message="Вы уверены, что хотите отменить эту заявку на отпуск? Дни отпуска будут возвращены на ваш баланс."
          onConfirm={handleCancelConfirm}
          onCancel={handleCancelClose}
          confirmText="Отменить"
          cancelText="Вернуться"
          loading={loading}
        />
      )}
    </div>
  )
}
