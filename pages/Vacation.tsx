import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useVacationStore } from '@/store/vacationStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { YearCalendar } from '@/components/calendar/YearCalendar'
import { CreateVacationModal } from '@/components/modals/CreateVacationModal'
import { VacationRequestStatus, VacationType } from '@/types'
import { getVacationRequestStatusBadge } from '@/data/mockVacationData'

export function Vacation() {
  const user = useAuthStore((state) => state.user)
  const {
    currentUserRequests,
    departmentRequests,
    loading,
    error,
    fetchUserRequests,
    fetchDepartmentRequests,
    fetchBalance,
    approveRequest,
    rejectRequest,
  } = useVacationStore()

  const [balance, setBalance] = useState<any>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showCalendar, setShowCalendar] = useState(true)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null)
  const [selectedStartDate, setSelectedStartDate] = useState<string | null>(null)
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(null)
  const [showCreateFromCalendar, setShowCreateFromCalendar] = useState(false)

  useEffect(() => {
    if (user) {
      fetchUserRequests(user.id)
      if (user.role === 'manager' || user.role === 'hr' || user.role === 'admin') {
        fetchDepartmentRequests(user.departmentId || 'dept1')
      }
      fetchBalance(user.id).then(setBalance)
    }
  }, [user, fetchUserRequests, fetchDepartmentRequests, fetchBalance])

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

  const handleDateRangeSelect = (startDate: string | null, endDate: string | null) => {
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
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Скрыть форму' : 'Создать заявку'}
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
            <div className="grid grid-cols-4 gap-4">
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
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{balance.reservedDays}</div>
                <div className="text-sm text-gray-600">Зарезервировано</div>
              </div>
            </div>
            {balance.travelAvailable && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-600">
                  ✈️ Проезд доступен (следующая дата: {new Date(balance.travelNextAvailableDate || '').toLocaleDateString('ru-RU')})
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {showCalendar && (
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
      )}

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
                          <div className="text-sm mt-2">
                            {new Date(request.startDate).toLocaleDateString('ru-RU')} -{' '}
                            {new Date(request.endDate).toLocaleDateString('ru-RU')} ({request.duration} дней)
                          </div>
                          {request.comment && (
                            <div className="text-sm text-gray-600 mt-1">Комментарий: {request.comment}</div>
                          )}
                          {request.hasTravel && (
                            <div className="text-sm text-blue-600 mt-1">✈️ С проездом</div>
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

      <Card>
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {isManager ? 'Все заявки отдела' : 'Мои заявки'}
          </h2>
          {loading ? (
            <div className="text-center py-8 text-gray-600">Загрузка...</div>
          ) : (
            <div className="space-y-4">
              {(isManager ? departmentRequests : currentUserRequests).map((request) => {
                const statusBadge = getVacationRequestStatusBadge(request.status)
                return (
                  <div key={request.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {isManager && (
                              <>
                                {request.userLastName} {request.userFirstName} •{' '}
                              </>
                            )}
                            {request.vacationType === 'annual_paid'
                              ? 'Ежегодный отпуск'
                              : request.vacationType === 'unpaid'
                              ? 'Без сохранения ЗП'
                              : 'Другой'}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}
                          >
                            {statusBadge.label}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mt-2">
                          {new Date(request.startDate).toLocaleDateString('ru-RU')} -{' '}
                          {new Date(request.endDate).toLocaleDateString('ru-RU')} ({request.duration} дней)
                        </div>
                        {request.comment && (
                          <div className="text-sm text-gray-600 mt-1">Комментарий: {request.comment}</div>
                        )}
                        {request.hasTravel && (
                          <div className="text-sm text-blue-600 mt-1">
                            ✈️ С проездом
                          </div>
                        )}
                        {(request.rejectionReason || request.cancellationReason) && (
                          <div className="text-sm text-red-600 mt-1">
                            Причина: {request.rejectionReason || request.cancellationReason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {(isManager ? departmentRequests : currentUserRequests).length === 0 && (
                <div className="text-center py-8 text-gray-600">
                  {isManager ? 'Нет заявок в отделе' : 'У вас пока нет заявок на отпуск'}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
