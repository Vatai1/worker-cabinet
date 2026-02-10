import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useVacationStore } from '@/store/vacationStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Отпуск</h1>
          <p className="text-gray-600 mt-1">
            {isManager ? 'Управление отпусками сотрудников' : 'Управление вашими отпусками'}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowHistoryModal(true)}
        >
          История заявок
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {balance && (
        <Card>
            <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Баланс отпускных дней</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{balance.totalDays}</div>
                <div className="text-sm text-gray-600">Всего дней</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{balance.usedDays}</div>
                <div className="text-sm text-gray-600">Использовано</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{balance.availableDays}</div>
                <div className="text-sm text-gray-600">Доступно</div>
              </div>
            </div>
            {balance.travelAvailable && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-600">
                  ✈️ Проезд доступен
                  {balance.travelNextAvailableDate && (
                    <span> (следующая дата: {new Date(balance.travelNextAvailableDate).toLocaleDateString('ru-RU')})</span>
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
            <h2 className="text-xl font-semibold mb-4">Заявки на согласовании</h2>
            {loading ? (
              <div className="text-center py-8 text-gray-600">Загрузка...</div>
            ) : (
              <div className="space-y-4">
                {departmentRequests
                  .filter((r) => r.status === VacationRequestStatus.ON_APPROVAL)
                  .map((request) => (
                    <div key={request.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold">
                            {request.userLastName} {request.userFirstName}
                          </div>
                          <div className="text-sm text-gray-600">{request.userPosition}</div>
                          <div className="text-sm mt-1 text-gray-700">
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
                            <div className="text-sm text-gray-600 mt-1">Комментарий: {request.comment}</div>
                          )}
                          {request.hasTravel && (
                            <div className="text-sm text-blue-600 mt-1">✈️ С проездом{request.travelDestination && ` до ${request.travelDestination}`}</div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(request.id)}
                            disabled={loading}
                          >
                            Согласовать
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRejectingRequestId(request.id)}
                            disabled={loading}
                          >
                            Отклонить
                          </Button>
                        </div>
                      </div>
                      {rejectingRequestId === request.id && (
                        <div className="mt-4 pt-4 border-t">
                          <textarea
                            className="w-full border rounded-lg p-2 text-sm"
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
                              variant="secondary"
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
                  <div className="text-center py-8 text-gray-600">Нет заявок на согласовании</div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {currentUserRequests.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Мои заявки</h2>
            {loading ? (
              <div className="text-center py-8 text-gray-600">Загрузка...</div>
            ) : (
              <div className="space-y-4">
                {currentUserRequests
                  .filter((r) =>
                    r.status === VacationRequestStatus.ON_APPROVAL ||
                    r.status === VacationRequestStatus.APPROVED
                  )
                  .map((request) => (
                  <div key={request.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-sm mt-1 text-gray-700">
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
                          <div className="text-sm text-gray-600 mt-1">Комментарий: {request.comment}</div>
                        )}
                        {request.hasTravel && (
                          <div className="text-sm text-blue-600 mt-1">✈️ С проездом{request.travelDestination && ` до ${request.travelDestination}`}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {request.status === VacationRequestStatus.ON_APPROVAL && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            На согласовании
                          </span>
                        )}
                        {request.status === VacationRequestStatus.APPROVED && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Согласовано
                          </span>
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
                  <div className="text-center py-8 text-gray-600">Нет активных заявок</div>
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
