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
import { RestrictionModal } from '@/components/modals/RestrictionModal'
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
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null)
  const [myRequestsExpanded, setMyRequestsExpanded] = useState(true)
  const [addingComment, setAddingComment] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [showRestrictionModal, setShowRestrictionModal] = useState(false)
  const [restrictionWarnings, setRestrictionWarnings] = useState<any[]>([])

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
      fetchUserRequests(user.id)
      fetchDepartmentRequests(user.departmentId || '1')
      fetchBalance(user.id).then(setBalance)
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
      fetchUserRequests(user.id)
      fetchDepartmentRequests(user.departmentId || '1')
      fetchBalance(user.id).then(setBalance)
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
      fetchUserRequests(user.id)
      fetchDepartmentRequests(user.departmentId || '1')
      fetchBalance(user.id).then(setBalance)
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
      fetchUserRequests(user.id)
      fetchDepartmentRequests(user.departmentId || '1')
      fetchBalance(user.id).then(setBalance)
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
      fetchUserRequests(user.id)
      fetchDepartmentRequests(user.departmentId || '1')
      fetchBalance(user.id).then(setBalance)
    } catch (err) {
      console.error('Error creating request:', err)
    }
  }

  const handleCloseDetailModal = () => {
    setShowDetailModal(false)
    setDetailRequest(null)
  }

  const handleAddCommentClick = (requestId: string) => {
    setAddingComment(addingComment === requestId ? null : requestId)
    setNewComment('')
  }

  const handleAddCommentSubmit = async (requestId: string) => {
    if (!user || !newComment.trim()) return
    try {
      await useVacationStore.getState().addComment(requestId, newComment)
      setAddingComment(null)
      setNewComment('')
      fetchUserRequests(user.id)
      fetchDepartmentRequests(user.departmentId || '1')
    } catch (err) {
      console.error('Error adding comment:', err)
    }
  }

  const handleCreateRestriction = async (restriction: Omit<any, 'id'>) => {
    if (!user) return
    try {
      await useVacationStore.getState().createRestriction(user.departmentId || '1', restriction)
    } catch (err) {
      console.error('Error creating restriction:', err)
    }
  }

  const handleDeleteRestriction = async (restrictionId: string) => {
    try {
      await useVacationStore.getState().deleteRestriction(restrictionId)
    } catch (err) {
      console.error('Error deleting restriction:', err)
    }
  }

  const getDepartmentUsers = () => {
    const uniqueUsers = new Map()
    departmentRequests.forEach((request) => {
      const key = `${request.userId}-${request.userLastName}-${request.userFirstName}`
      if (!uniqueUsers.has(key)) {
        uniqueUsers.set(key, {
          id: request.userId,
          firstName: request.userFirstName,
          lastName: request.userLastName,
          position: request.userPosition,
        })
      }
    })
    return Array.from(uniqueUsers.values())
  }

  const handleCheckRestrictions = (userId: string, data: { startDate: string; endDate: string }) => {
    const warnings = useVacationStore.getState().checkRestrictions(userId, {
      startDate: data.startDate,
      endDate: data.endDate,
      vacationType: VacationType.ANNUAL_PAID,
      comment: '',
      hasTravel: false,
    })
    setRestrictionWarnings(warnings)
  }

  const handleDownload = (request: any) => {
    if (!user) return

    const vacationTypeName = request.vacationType === 'annual_paid'
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
      : 'Отпуск'

    const statusName = request.status === 'on_approval'
      ? 'На согласовании'
      : request.status === 'approved'
      ? 'Согласовано'
      : request.status === 'rejected'
      ? 'Отклонено'
      : request.status === 'cancelled_by_employee'
      ? 'Отменено сотрудником'
      : request.status === 'cancelled_by_manager'
      ? 'Отменено руководителем'
      : request.status

    const content = `
ЗЯВЛЕНИЕ НА ОТПУСК

Сотрудник: ${user.lastName} ${user.firstName} ${user.middleName || ''}
Должность: ${user.position}
Отдел: ${user.department}

Тип отпуска: ${vacationTypeName}
Дата начала: ${new Date(request.startDate).toLocaleDateString('ru-RU')}
Дата окончания: ${new Date(request.endDate).toLocaleDateString('ru-RU')}
Количество дней: ${request.duration}

Комментарий: ${request.comment || 'Не указан'}

${request.hasTravel ? 'Включая проезд' + (request.travelDestination ? ` до ${request.travelDestination}` : '') : ''}

Статус: ${statusName}
Дата создания: ${new Date(request.createdAt).toLocaleDateString('ru-RU')}
${request.reviewedAt ? `Дата рассмотрения: ${new Date(request.reviewedAt).toLocaleDateString('ru-RU')}` : ''}
${request.rejectionReason ? `Причина отклонения: ${request.rejectionReason}` : ''}
${request.cancellationReason ? `Причина отмены: ${request.cancellationReason}` : ''}
    `.trim()

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `заявление-отпуск-${request.id}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
        <div className="flex gap-2">
          {isManager && (
            <Button
              variant="outline"
              onClick={() => setShowRestrictionModal(true)}
              size="default"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Настроить пересечения
            </Button>
          )}
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
              <div className="space-y-3">
                {departmentRequests
                  .filter((r) => r.status === VacationRequestStatus.ON_APPROVAL)
                  .map((request) => {
                    const isExpanded = expandedRequestId === `manager-${request.id}`
                    return (
                      <div key={request.id} className="border-2 border-amber-500/20 rounded-2xl overflow-hidden bg-gradient-to-br from-amber-500/5 to-transparent hover:border-amber-500/40 transition-all duration-300">
                        <div
                          className="p-4 cursor-pointer flex items-center justify-between gap-4"
                          onClick={() => setExpandedRequestId(isExpanded ? null : `manager-${request.id}`)}
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white font-bold shadow-lg shrink-0">
                              {request.userFirstName[0]}{request.userLastName[0]}
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-sm">
                                {request.userLastName} {request.userFirstName}
                              </div>
                              <div className="text-xs text-muted-foreground">{request.userPosition}</div>
                              <div className="text-xs mt-1 text-foreground/70">
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
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(request.startDate).toLocaleDateString('ru-RU')} -{' '}
                                {new Date(request.endDate).toLocaleDateString('ru-RU')} ({request.duration} дней)
                              </div>
                            </div>
                            <svg
                              className={`w-5 h-5 text-muted-foreground transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                        <div
                          className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
                        >
                          <div className="p-4 pt-0 border-t border-border/50 mt-2">
                            <div className="space-y-3 mt-4">
                              {request.comment && (
                                <div className="flex items-start gap-2">
                                  <svg className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                  </svg>
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Комментарий</div>
                                    <div className="text-sm">{request.comment}</div>
                                  </div>
                                </div>
                              )}
                              {request.hasTravel && (
                                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-500/15 to-sky-500/15 border border-blue-500/20">
                                  <svg className="w-5 h-5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12l4-4m-4 4l4 4m10-4l-4-4m4 4l-4 4" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v4m0 10v4" />
                                  </svg>
                                  <div className="text-sm font-medium text-blue-700 dark:text-blue-400">
                                    ✈️ Проезд{request.travelDestination && ` → ${request.travelDestination}`}
                                  </div>
                                </div>
                              )}
                              <div className="pt-2 flex gap-3">
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
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleAddCommentClick(`manager-${request.id}`)
                                  }}
                                  disabled={loading}
                                >
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  Комментарий
                                </Button>
                              </div>
                              {rejectingRequestId === request.id && (
                                <div className="pt-3">
                                  <textarea
                                    className="w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                          </div>
                        </div>
                      </div>
                    )
                  })}
                {departmentRequests.filter((r) => r.status === VacationRequestStatus.ON_APPROVAL)
                  .length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">Нет заявок на согласовании</div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div
          className="p-6 cursor-pointer flex items-center justify-between gap-4"
          onClick={() => setMyRequestsExpanded(!myRequestsExpanded)}
        >
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="p-2 bg-primary/10 rounded-lg">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </span>
            Мои заявки
          </h2>
          <svg
            className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${myRequestsExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ${myRequestsExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
        >
          <div className="px-6 pb-6">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
            ) : currentUserRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Нет активных заявок</div>
            ) : (
              <div className="space-y-3">
                {currentUserRequests
                  .filter((r) =>
                    r.status === VacationRequestStatus.ON_APPROVAL ||
                    r.status === VacationRequestStatus.APPROVED
                  )
                  .map((request) => {
                    const isExpanded = expandedRequestId === request.id
                    const isAddingComment = addingComment === request.id
                    return (
                      <div key={request.id} className={`border-2 rounded-2xl overflow-hidden transition-all duration-300 ${
                        request.status === VacationRequestStatus.APPROVED
                          ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent'
                          : 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent'
                      } ${isExpanded ? 'shadow-lg hover:shadow-xl' : 'hover:shadow-md'}`}>
                        <div
                          className="p-4 cursor-pointer flex items-center justify-between gap-4"
                          onClick={() => {
                            setExpandedRequestId(isExpanded ? null : request.id)
                            if (isAddingComment) {
                              setAddingComment(null)
                            }
                          }}
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <div className={`p-2 rounded-xl ${request.status === VacationRequestStatus.APPROVED ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
                              <svg className={`w-5 h-5 ${request.status === VacationRequestStatus.APPROVED ? 'text-emerald-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {request.status === VacationRequestStatus.APPROVED ? (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                ) : (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                )}
                              </svg>
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-foreground/80">
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
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(request.startDate).toLocaleDateString('ru-RU')} -{' '}
                                {new Date(request.endDate).toLocaleDateString('ru-RU')} ({request.duration} дней)
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {request.status === VacationRequestStatus.ON_APPROVAL && (
                                <Badge variant="warning">На согласовании</Badge>
                              )}
                              {request.status === VacationRequestStatus.APPROVED && (
                                <Badge variant="success">Согласовано</Badge>
                              )}
                              <svg
                                className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
                        >
                          <div className="p-4 pt-0 border-t border-border/50 mt-2">
                            <div className="space-y-3 mt-4">
                              {request.comment && (
                                <div className="flex items-start gap-2">
                                  <svg className="w-4 h-4 text-muted-foreground mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                  </svg>
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Комментарий</div>
                                    <div className="text-sm">{request.comment}</div>
                                  </div>
                                </div>
                              )}
                              {request.hasTravel && (
                                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-500/15 to-sky-500/15 border border-blue-500/20">
                                  <svg className="w-5 h-5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12l4-4m-4 4l4 4m10-4l-4-4m4 4l-4 4" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v4m0 10v4" />
                                  </svg>
                                  <div className="text-sm font-medium text-blue-700 dark:text-blue-400">
                                    ✈️ Проезд{request.travelDestination && ` → ${request.travelDestination}`}
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-3 pt-2">
                                {request.status !== VacationRequestStatus.ON_APPROVAL && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDownload(request)
                                    }}
                                    disabled={loading}
                                  >
                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Скачать заявление
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleAddCommentClick(request.id)
                                  }}
                                  disabled={loading}
                                >
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  Добавить комментарий
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleCancelClick(request.id)}
                                  disabled={loading}
                                  className="w-full sm:w-auto"
                                >
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Отменить заявку
                                </Button>
                              </div>
                              {isAddingComment && (
                                <div className="pt-3">
                                  <textarea
                                    className="w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="Введите комментарий..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="flex gap-2 mt-2">
                                    <Button size="sm" onClick={() => handleAddCommentSubmit(request.id)}>
                                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Сохранить
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setAddingComment(null)
                                        setNewComment('')
                                      }}
                                    >
                                      Отмена
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>
      </Card>

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
          restrictionWarnings={restrictionWarnings}
          userId={user?.id}
          onCheckRestrictions={handleCheckRestrictions}
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

      {showRestrictionModal && (
        <RestrictionModal
          isOpen={showRestrictionModal}
          restrictions={useVacationStore.getState().restrictions}
          departmentUsers={getDepartmentUsers()}
          onCreateRestriction={handleCreateRestriction}
          onDeleteRestriction={handleDeleteRestriction}
          onClose={() => setShowRestrictionModal(false)}
        />
      )}
    </div>
  )
}
