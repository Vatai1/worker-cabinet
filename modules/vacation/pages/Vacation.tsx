import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { YearCalendar } from '@/shared/components/calendar/YearCalendar'
import { CreateVacationModal } from '@/modules/vacation/components/modals/CreateVacationModal'
import { CreateVacationFormModal } from '@/modules/vacation/components/modals/CreateVacationFormModal'
import { VacationDetailModal } from '@/modules/vacation/components/modals/VacationDetailModal'
import { VacationHistoryModal } from '@/modules/vacation/components/modals/VacationHistoryModal'
import { ConfirmModal } from '@/shared/components/ConfirmModal'
import { RestrictionModal } from '@/modules/vacation/components/modals/RestrictionModal'
import { VacationTransferModal } from '@/modules/vacation/components/modals/VacationTransferModal'
import { VacationRequestStatus, VacationType } from '@/shared/types'
import type { VacationRequest } from '@/shared/types'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { ChevronLeft, ChevronRight, FileText, Sparkles, Clock, CheckCircle2, HourglassIcon } from 'lucide-react'
import { VacationApplicationModal } from '@/modules/vacation/components/modals/VacationApplicationModal'
import { VacationTransferApplicationModal } from '@/modules/vacation/components/modals/VacationTransferApplicationModal'

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
    fetchRestrictions,
    approveRequest,
    rejectRequest,
  } = useVacationStore()

  const [balance, setBalance] = useState<any>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
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
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferRequest, setTransferRequest] = useState<VacationRequest | null>(null)
  const [showRestrictionModal, setShowRestrictionModal] = useState(false)
  const [showApplicationModal, setShowApplicationModal] = useState(false)
  const [showTransferApplicationModal, setShowTransferApplicationModal] = useState(false)
  const [calendarView, setCalendarView] = useState<'department' | 'personal'>('department')
  const [restrictionWarnings, setRestrictionWarnings] = useState<any[]>([])
  const [restrictionWarningsCalendar, setRestrictionWarningsCalendar] = useState<any[]>([])
  const [intersectionWarnings, setIntersectionWarnings] = useState<{message: string; employeeName: string; dates: string}[]>([])
  const [vacationBlocked, setVacationBlocked] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    if (user) {
      fetchUserRequests(user.id)
      fetchBalance(user.id, year).then(setBalance)

      if (isManager) {
        fetchAllRequests()
        fetchRestrictions(user.departmentId || '1')
        fetchDepartmentRequests(user.departmentId || '1')
      } else {
        fetchDepartmentRequests(user.departmentId || '1')
      }

      if (user.departmentId) {
        fetch(`${API_BASE_URL}/departments/${user.departmentId}`, { headers: getAuthHeaders() })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.vacation_requests_blocked) setVacationBlocked(true)
          })
          .catch(() => {})
      }
    }
  }, [user?.id, user?.departmentId, user?.role, year])

  const handleApprove = async (requestId: string) => {
    if (!user) return
    try {
      await approveRequest(requestId, user.id)
      fetchUserRequests(user.id)
      fetchDepartmentRequests(user.departmentId || '1')
      fetchBalance(user.id, year).then(setBalance)
    } catch (err) {
    }
  }

  const handleReject = async (requestId: string, reason: string) => {
    if (!user) return
    if (!reason || !reason.trim()) return
    try {
      await rejectRequest(requestId, user.id, reason)
      fetchUserRequests(user.id)
      fetchDepartmentRequests(user.departmentId || '1')
      fetchBalance(user.id, year).then(setBalance)
    } catch (err) {
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
      setExpandedRequestId(null)
      fetchBalance(user.id, year).then(setBalance)
    } catch (err) {
      toast.error('Ошибка при отмене заявки')
    } finally {
      setShowCancelModal(false)
      setCancellingRequestId(null)
    }
  }

  const handleCancelClose = () => {
    setShowCancelModal(false)
    setCancellingRequestId(null)
  }

  const handleTransferClick = (request: VacationRequest) => {
    setTransferRequest(request)
    setShowTransferModal(true)
  }

  const findIntersections = (request: any) => {
    const warnings: {message: string; employeeName: string; dates: string}[] = []
    const requestStart = new Date(request.startDate)
    const requestEnd = new Date(request.endDate)

    departmentRequests.forEach((otherRequest) => {
      if (otherRequest.id === request.id) return
      if (otherRequest.status !== VacationRequestStatus.APPROVED && 
          otherRequest.status !== VacationRequestStatus.ON_APPROVAL) return

      const otherStart = new Date(otherRequest.startDate)
      const otherEnd = new Date(otherRequest.endDate)

      const hasOverlap = requestStart <= otherEnd && requestEnd >= otherStart

      if (hasOverlap) {
        const employeeName = `${otherRequest.userLastName} ${otherRequest.userFirstName}`
        const dates = `${new Date(otherRequest.startDate).toLocaleDateString('ru-RU')} - ${new Date(otherRequest.endDate).toLocaleDateString('ru-RU')}`
        warnings.push({
          message: `Пересечение с отпуском сотрудника`,
          employeeName,
          dates
        })
      }
    })

    return warnings
  }

  const handleOpenDetailModal = (request: any) => {
    setDetailRequest(request)
    const intersections = findIntersections(request)
    setIntersectionWarnings(intersections)
    setShowDetailModal(true)
  }

  const handleDateRangeSelect = (startDate: string | null, endDate: string | null) => {

    if (startDate && !endDate && startDate.startsWith('vr-')) {
      const requestId = startDate.replace('vr-', '')
      const request = departmentRequests.find(r => r.id === requestId)
      if (request) {
        handleOpenDetailModal(request)
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
      fetchBalance(user.id, year).then(setBalance)
    } catch (err) {
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
      fetchBalance(user.id, year).then(setBalance)
    } catch (err) {
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
    }
  }

  const handleCreateRestriction = async (restriction: Record<string, unknown>) => {
    if (!user) return
    try {
      await useVacationStore.getState().createRestriction(user.departmentId || '1', restriction as any)
      await fetchRestrictions(user.departmentId || '1')
    } catch (err) {
    }
  }

  const handleDeleteRestriction = async (restrictionId: string) => {
    try {
      await useVacationStore.getState().deleteRestriction(restrictionId)
      if (user) {
        await fetchRestrictions(user.departmentId || '1')
      }
    } catch (err) {
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

  const handleCheckRestrictions = async (userId: string, data: { startDate: string; endDate: string }) => {
    const warnings = await useVacationStore.getState().checkRestrictions(userId, {
      startDate: data.startDate,
      endDate: data.endDate,
      vacationType: VacationType.ANNUAL_PAID,
      comment: '',
      hasTravel: false,
    })
    setRestrictionWarnings(warnings)
  }

  const handleCheckRestrictionsCalendar = async (userId: string, data: { startDate: string; endDate: string }) => {
    const warnings = await useVacationStore.getState().checkRestrictions(userId, {
      startDate: data.startDate,
      endDate: data.endDate,
      vacationType: VacationType.ANNUAL_PAID,
      comment: '',
      hasTravel: false,
    })
    setRestrictionWarningsCalendar(warnings)
  }



  const calendarRequests = useMemo(() => {
    if (calendarView === 'personal') return currentUserRequests
    const merged = [...departmentRequests]
    currentUserRequests.forEach(r => {
      if (!merged.some(m => m.id === r.id)) merged.push(r)
    })
    return merged
  }, [departmentRequests, currentUserRequests, calendarView])

  const handlePrevYear = () => setYear((y) => y - 1)
  const handleNextYear = () => setYear((y) => y + 1)

  const isManager = user?.role === 'manager' || user?.role === 'hr' || user?.role === 'admin'
  const isDepartmentManager = user?.role === 'manager' || user?.role === 'hr' || user?.role === 'admin' || departmentRequests.some((r) => String(r.departmentManagerId) === user?.id)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden gradient-primary text-white rounded-xl animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-card/3 rounded-full blur-2xl" />
        <div className="relative z-10 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-white/60" />
                <span className="text-white/40 text-[10px] font-medium uppercase tracking-wider">
                  {isManager ? 'Управление' : 'Личный кабинет'}
                </span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">Отпуск</h1>
              <p className="mt-1 text-white/50 text-sm">
                {isManager ? 'Управление отпусками сотрудников' : 'Управление вашими отпусками'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex flex-wrap gap-2">
                {balance && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                    <Clock className="h-3 w-3 text-white/50" />
                    {balance.availableDays} дн. доступно
                  </div>
                )}
                {currentUserRequests.filter(r => r.status === VacationRequestStatus.ON_APPROVAL).length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-400/20 backdrop-blur-sm border border-amber-400/20 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                    <HourglassIcon className="h-3 w-3 text-amber-300/70" />
                    {currentUserRequests.filter(r => r.status === VacationRequestStatus.ON_APPROVAL).length} на согласовании
                  </div>
                )}
                {currentUserRequests.filter(r => r.status === VacationRequestStatus.APPROVED).length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-400/20 backdrop-blur-sm border border-emerald-400/20 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                    <CheckCircle2 className="h-3 w-3 text-emerald-300/70" />
                    {currentUserRequests.filter(r => r.status === VacationRequestStatus.APPROVED).length} согласовано
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {isManager && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/20 bg-card/10 text-white hover:bg-card/20 hover:text-white"
                    onClick={() => setShowRestrictionModal(true)}
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Пересечения
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-card/10 text-white hover:bg-card/20 hover:text-white"
                  onClick={() => setShowApplicationModal(true)}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Заявление
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-card/10 text-white hover:bg-card/20 hover:text-white"
                  onClick={() => setShowTransferApplicationModal(true)}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Перенос
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-card/10 text-white hover:bg-card/20 hover:text-white"
                  onClick={() => setShowHistoryModal(true)}
                >
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  История
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {balance && (
        <Card className="section-card overflow-hidden">
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
              <div className="text-center p-4 rounded-xl bg-card border border-border/50 hover-lift stagger-1">
                <div className="text-4xl font-bold text-gradient">{balance.totalDays}</div>
                <div className="text-sm text-muted-foreground mt-2 font-medium">Всего дней</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-card border border-border/50 hover-lift stagger-2">
                <div className="text-4xl font-bold text-gradient">{balance.usedDays}</div>
                <div className="text-sm text-muted-foreground mt-2 font-medium">Использовано</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-card border border-border/50 hover-lift stagger-3">
                <div className="text-4xl font-bold text-gradient">{balance.availableDays}</div>
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

      {vacationBlocked && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="font-medium">Подача заявок на отпуск для вашего отдела временно заблокирована HR</span>
        </div>
      )}

      <Card className="section-card">
        <div className="p-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Button variant="outline" size="icon" onClick={handlePrevYear}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-lg font-semibold min-w-[60px] text-center">{year}</span>
            <Button variant="outline" size="icon" onClick={handleNextYear}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center justify-center mb-4">
            <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setCalendarView('department')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  calendarView === 'department'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Отдел
              </button>
              <button
                type="button"
                onClick={() => setCalendarView('personal')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  calendarView === 'personal'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Мои отпуска
              </button>
            </div>
          </div>
          <YearCalendar
            year={year}
            requests={calendarRequests}
            onDateRangeSelect={vacationBlocked ? () => {} : handleDateRangeSelect}
            selectedStartDate={selectedStartDate}
            selectedEndDate={selectedEndDate}
            currentUserId={user?.id}
            onTransfer={handleTransferClick}
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
              userId={user?.id}
              restrictionWarnings={restrictionWarningsCalendar}
              onCheckRestrictions={handleCheckRestrictionsCalendar}
            />
          )}
        </div>
      </Card>

      {isDepartmentManager && departmentRequests.filter((r) => r.status === VacationRequestStatus.ON_APPROVAL).length > 0 && (
        <Card className="section-card">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="p-2 bg-primary/10 rounded-lg">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              Заявки на согласовании
            </h2>
            {loading ? (
              <div className="flex items-center justify-center py-8"><div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {departmentRequests
                  .filter((r) => r.status === VacationRequestStatus.ON_APPROVAL)
                  .map((request) => (
                    <div
                      key={request.id}
                      className="border-2 border-amber-500/20 rounded-2xl p-4 bg-gradient-to-br from-amber-500/5 to-transparent hover:border-amber-500/40 transition-all duration-300 cursor-pointer"
                      onClick={() => handleOpenDetailModal(request)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold shrink-0">
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
                          className="w-5 h-5 text-muted-foreground shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
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
              <div className="flex items-center justify-center py-8"><div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
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
          onApprove={detailRequest?.status === VacationRequestStatus.ON_APPROVAL && isDepartmentManager ? handleApprove : undefined}
          onReject={detailRequest?.status === VacationRequestStatus.ON_APPROVAL && isDepartmentManager ? handleReject : undefined}
          loading={loading}
          intersectionWarnings={intersectionWarnings}
          onTransfer={detailRequest && user?.id === detailRequest?.userId && detailRequest?.status === VacationRequestStatus.APPROVED ? handleTransferClick : undefined}
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

      {showApplicationModal && (
        <VacationApplicationModal
          open={showApplicationModal}
          onClose={() => setShowApplicationModal(false)}
          defaultYear={year}
        />
      )}
      {showTransferApplicationModal && (
        <VacationTransferApplicationModal
          open={showTransferApplicationModal}
          onClose={() => setShowTransferApplicationModal(false)}
        />
      )}

      {showTransferModal && transferRequest && (
        <VacationTransferModal
          isOpen={showTransferModal}
          request={transferRequest}
          onClose={() => {
            setShowTransferModal(false)
            setTransferRequest(null)
          }}
          onSubmit={async (data) => {
            await vacationApi.requestTransfer(transferRequest.id, data)
            if (user) {
              fetchUserRequests(user.id)
              fetchBalance(user.id, year).then(setBalance)
            }
          }}
          loading={loading}
        />
      )}
    </div>
  )
}