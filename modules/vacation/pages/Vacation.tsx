import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { useWsStore } from '@/shared/store/wsStore'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { YearCalendar } from '@/shared/components/calendar/YearCalendar'
import { CalendarLegendSwatches } from '@/shared/components/calendar/CalendarLegendSwatches'
import { VacationHistoryList } from '@/modules/vacation/components/modals/VacationHistoryModal'
import { CreateVacationModal } from '@/modules/vacation/components/modals/CreateVacationModal'
import { VacationDetailModal } from '@/modules/vacation/components/modals/VacationDetailModal'
import { ConfirmModal } from '@/shared/components/ConfirmModal'
import { VacationRestrictions } from '@/modules/vacation/components/VacationRestrictions'
import { DepartmentBalanceTable } from '@/modules/vacation/components/DepartmentBalanceTable'
import { VacationIntroModal } from '@/modules/vacation/components/VacationIntroModal'
import { VacationTransferModal } from '@/modules/vacation/components/modals/VacationTransferModal'
import { VacationRequestStatus, VacationType, VACATION_TYPES } from '@/shared/types'
import type { VacationRequest, VacationBalance, VacationValidationError, VacationEmployee } from '@/shared/types'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { apiGet } from '@/shared/lib/apiClient'
import { API_BASE_URL } from '@/shared/lib/api'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { getErrorMessage, cn, personName } from '@/shared/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/shared/components/ui/Avatar'
import { hasAnyRole } from '@/shared/lib/permissions'
import { getCookie, setCookie } from '@/shared/lib/cookies'
import {
  ChevronLeft, ChevronRight, ChevronDown, FileText, Clock, CheckCircle2, CheckCircle,
  UserCheck, Search, RotateCcw, XCircle, PieChart,
  Calendar as CalendarIcon, Lightbulb, HelpCircle, AlertTriangle, Plane,
} from 'lucide-react'
import { PageBanner } from '@/shared/components/PageBanner'

const VACATION_INTRO_COOKIE = 'vacation_intro_seen'

const REQUEST_STATUS_OPTIONS = [
  { value: VacationRequestStatus.APPROVED, label: 'Согласовано' },
  { value: VacationRequestStatus.ON_APPROVAL, label: 'На согласовании' },
]

const EMPTY_REQUEST_FILTERS: { departmentIds: string[]; statuses: string[]; vacationTypes: string[]; tagId: string } = { departmentIds: [], statuses: [], vacationTypes: [], tagId: '' }

type VacationTab = 'mine' | 'approvals' | 'restrictions' | 'requests' | 'history'
type CalendarScope = 'mine' | 'team'

export function Vacation() {
  const user = useAuthStore((state) => state.user)
  const {
    currentUserRequests,
    departmentRequests,
    loading,
    error,
    calendarVersion,
    bumpCalendarVersion,
    fetchAllRequests,
    fetchUserRequests,
    fetchConnectionRequests,
    fetchBalance,
    fetchRestrictions,
    approveRequest,
    approveTransferRequest,
    rejectTransferRequest,
    rejectRequest,
    mySubstitutions,
    fetchMySubstitutions,
  } = useVacationStore()

  const [balance, setBalance] = useState<VacationBalance | null>(null)
  const [selectedStartDate, setSelectedStartDate] = useState<string | null>(null)
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(null)
  const [showCreateFromCalendar, setShowCreateFromCalendar] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailRequest, setDetailRequest] = useState<VacationRequest | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null)
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null)
  const autoExpandedRef = useRef(false)
  const [myRequestsExpanded, setMyRequestsExpanded] = useState(true)
  const [addingComment, setAddingComment] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferRequest, setTransferRequest] = useState<VacationRequest | null>(null)
  const [restrictionWarningsCalendar, setRestrictionWarningsCalendar] = useState<VacationValidationError[]>([])
  const [intersectionWarnings, setIntersectionWarnings] = useState<{message: string; employeeName: string; dates: string}[]>([])
  const [vacationBlocked, setVacationBlocked] = useState(false)
  const [dateErrorMessage, setDateErrorMessage] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [showSubstitutePicker, setShowSubstitutePicker] = useState<string | null>(null)
  const [pickerEmployees, setPickerEmployees] = useState<Array<{ id: number; first_name: string; last_name: string; middle_name?: string | null; position: string }>>([])
  const [reqFilters, setReqFilters] = useState(EMPTY_REQUEST_FILTERS)
  const [approvalFilters, setApprovalFilters] = useState<{ departmentIds: string[]; vacationTypes: string[] }>({ departmentIds: [], vacationTypes: [] })
  const [approvalSearch, setApprovalSearch] = useState('')
  const [showIntroModal, setShowIntroModal] = useState(false)
  const [deptTableExpanded, setDeptTableExpanded] = useState(false)

  useEffect(() => {
    if (getCookie(VACATION_INTRO_COOKIE)) return
    setShowIntroModal(true)
    setCookie(VACATION_INTRO_COOKIE, '1')
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    const requestId = params.get('requestId')
    if (tab === 'mine' || tab === 'approvals' || tab === 'restrictions' || tab === 'requests' || tab === 'history') {
      setActiveTab(tab)
    }
    if (requestId) setDeepLinkRequestId(requestId)
  }, [])
  const [activeTab, setActiveTab] = useState<VacationTab>('mine')
  const [deepLinkRequestId, setDeepLinkRequestId] = useState<string | null>(null)
  const deepLinkHandledRef = useRef(false)
  const [calendarScope, setCalendarScope] = useState<CalendarScope>('mine')
  const [leavingApprovalIds, setLeavingApprovalIds] = useState<Set<string>>(new Set())
  const [rejectingApprovalId, setRejectingApprovalId] = useState<string | null>(null)
  const [approvalRejectReason, setApprovalRejectReason] = useState('')
  const deptTouched = useRef(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([])
  const [calendarDeptRequests, setCalendarDeptRequests] = useState<VacationRequest[] | null>(null)
  const [tags, setTags] = useState<Array<{ id: number; name: string }>>([])
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const skillsEnabled = isModuleEnabled('skills')

  const isManager = hasAnyRole('manager', 'hr', 'admin')
  const isAdminOrSuperAdmin = hasAnyRole('admin')
  const isDepartmentManager = hasAnyRole('manager', 'hr', 'admin') || departmentRequests.some((r) => String(r.departmentManagerId) === user?.id || String(r.approverId) === user?.id)

  useEffect(() => {
    if (user) {
      fetchUserRequests(user.id)
      fetchBalance(user.id, year).then(setBalance)

      if (isManager) {
        fetchRestrictions(user.departmentId || '1')
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.departmentId, user?.role, year])

  const reloadRequests = useCallback(() => {
    if (!user) return
    fetchAllRequests(reqFilters.tagId ? { tagId: reqFilters.tagId } : undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentOrgId, year, fetchAllRequests, reqFilters.tagId])

  useEffect(() => {
    reloadRequests()
  }, [reloadRequests])

  useEffect(() => {
    fetchConnectionRequests()
  }, [fetchConnectionRequests])

  useEffect(() => {
    apiGet<Array<{ id: number; name: string }>>('/departments').then(setDepartments).catch(() => {})
  }, [currentOrgId])

  useEffect(() => {
    if (!skillsEnabled) {
      setTags([])
      return
    }
    apiGet<Array<{ id: number; name: string }>>('/users/skills/all').then(setTags).catch(() => setTags([]))
  }, [skillsEnabled, currentOrgId])

  useEffect(() => {
    deptTouched.current = false
    setReqFilters({ ...EMPTY_REQUEST_FILTERS, departmentIds: user?.departmentId ? [user.departmentId] : [] })
    setSearch('')
    setCalendarScope('mine')
    setActiveTab('mine')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId])

  useEffect(() => {
    if (user?.departmentId && !deptTouched.current) {
      setReqFilters((f) =>
        f.departmentIds.length === 1 && f.departmentIds[0] === user.departmentId
          ? f
          : { ...f, departmentIds: [user.departmentId!] }
      )
    }
  }, [user?.id, user?.departmentId])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (reqFilters.departmentIds.length === 0) {
      setCalendarDeptRequests(null)
      return
    }
    let cancelled = false
    const tagFilter = reqFilters.tagId ? { tagId: reqFilters.tagId } : undefined
    Promise.all(reqFilters.departmentIds.map((id) => vacationApi.getDepartmentRequests(id, tagFilter)))
      .then((results) => {
        if (cancelled) return
        const merged = new Map<string, VacationRequest>()
        results.flat().forEach((r) => merged.set(r.id, r))
        setCalendarDeptRequests(Array.from(merged.values()))
      })
      .catch(() => { if (!cancelled) setCalendarDeptRequests([]) })
    return () => { cancelled = true }
  }, [reqFilters.departmentIds, reqFilters.tagId, currentOrgId])

  const calendarVersionInitRef = useRef(true)
  useEffect(() => {
    if (calendarVersionInitRef.current) {
      calendarVersionInitRef.current = false
      return
    }
    if (!user) return
    let cancelled = false

    fetchUserRequests(user.id)
    fetchAllRequests(reqFilters.tagId ? { tagId: reqFilters.tagId } : undefined)
    fetchConnectionRequests()

    if (reqFilters.departmentIds.length > 0) {
      const tagFilter = reqFilters.tagId ? { tagId: reqFilters.tagId } : undefined
      Promise.all(reqFilters.departmentIds.map((id) => vacationApi.getDepartmentRequests(id, tagFilter)))
        .then((results) => {
          if (cancelled) return
          const merged = new Map<string, VacationRequest>()
          results.flat().forEach((r) => merged.set(r.id, r))
          setCalendarDeptRequests(Array.from(merged.values()))
        })
        .catch(() => { if (!cancelled) setCalendarDeptRequests([]) })
    }

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarVersion])

  const resetFilters = () => {
    deptTouched.current = false
    setReqFilters({ ...EMPTY_REQUEST_FILTERS, departmentIds: user?.departmentId ? [user.departmentId] : [] })
    setSearch('')
    toast.success('Фильтры сброшены')
  }

  const { vacationEvents } = useWsStore()

  useEffect(() => {
    if (vacationEvents.n === 0) return
    if (currentOrgId !== null && vacationEvents.organizationId !== undefined && vacationEvents.organizationId !== currentOrgId) return
    if (user && vacationEvents.actorId !== undefined && String(vacationEvents.actorId) === String(user.id)) return
    bumpCalendarVersion()
  }, [vacationEvents, currentOrgId, user, bumpCalendarVersion])

  const handleTabClick = (tab: VacationTab) => {
    setActiveTab(tab)
    if (tab === 'mine') setCalendarScope('mine')
  }

  const isTransferRequest = (requestId: string) =>
    departmentRequests.some((r) => r.id === requestId && r.transferredFromId)

  const handleApprove = async (requestId: string) => {
    if (!user) return
    try {
      if (isTransferRequest(requestId)) {
        await approveTransferRequest(requestId)
      } else {
        await approveRequest(requestId, user.id)
      }
      fetchUserRequests(user.id)
      reloadRequests()
      fetchBalance(user.id, year).then(setBalance)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
      throw err
    }
  }

  const handleReject = async (requestId: string, reason: string) => {
    if (!user) return
    if (!reason || !reason.trim()) return
    try {
      if (isTransferRequest(requestId)) {
        await rejectTransferRequest(requestId, reason)
      } else {
        await rejectRequest(requestId, user.id, reason)
      }
      fetchUserRequests(user.id)
      reloadRequests()
      fetchBalance(user.id, year).then(setBalance)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
      throw err
    }
  }

  const handleApproveCard = (request: VacationRequest) => {
    setLeavingApprovalIds((prev) => new Set(prev).add(request.id))
    setTimeout(() => {
      handleApprove(request.id)
        .then(() => toast.success('Заявка одобрена'))
        .catch(() => {})
        .finally(() => {
          setLeavingApprovalIds((prev) => {
            const next = new Set(prev)
            next.delete(request.id)
            return next
          })
        })
    }, 250)
  }

  const handleRejectCardToggle = (requestId: string) => {
    setRejectingApprovalId((prev) => (prev === requestId ? null : requestId))
    setApprovalRejectReason('')
  }

  const handleRejectCardConfirm = (request: VacationRequest) => {
    const reason = approvalRejectReason.trim()
    if (!reason) return
    setRejectingApprovalId(null)
    setApprovalRejectReason('')
    setLeavingApprovalIds((prev) => new Set(prev).add(request.id))
    setTimeout(() => {
      handleReject(request.id, reason)
        .then(() => toast.success('Заявка отклонена'))
        .catch(() => {})
        .finally(() => {
          setLeavingApprovalIds((prev) => {
            const next = new Set(prev)
            next.delete(request.id)
            return next
          })
        })
    }, 250)
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

  const findIntersections = (request: VacationRequest) => {
    const warnings: {message: string; employeeName: string; dates: string}[] = []
    const requestStart = new Date(request.startDate)
    const requestEnd = new Date(request.endDate)

    departmentRequests.forEach((otherRequest) => {
      if (otherRequest.id === request.id) return
      if (!request.departmentId || !otherRequest.departmentId) return
      if (otherRequest.departmentId !== request.departmentId) return
      if (otherRequest.status !== VacationRequestStatus.APPROVED &&
          otherRequest.status !== VacationRequestStatus.ON_APPROVAL) return

      const otherStart = new Date(otherRequest.startDate)
      const otherEnd = new Date(otherRequest.endDate)

      const hasOverlap = requestStart <= otherEnd && requestEnd >= otherStart

      if (hasOverlap) {
        const employeeName = personName(otherRequest.userLastName, otherRequest.userFirstName, otherRequest.userMiddleName)
        const dates = `${new Date(otherRequest.startDate).toLocaleDateString('ru-RU')} - ${new Date(otherRequest.endDate).toLocaleDateString('ru-RU')}`
        warnings.push({
          message: `Пересечение с отпуском работника`,
          employeeName,
          dates
        })
      }
    })

    return warnings
  }

  const handleOpenDetailModal = (request: VacationRequest) => {
    setDetailRequest(request)
    const intersections = findIntersections(request)
    setIntersectionWarnings(intersections)
    setShowDetailModal(true)
  }

  const MIN_ADVANCE_NOTICE_DAYS = 14

  const validateVacationStartDate = (startDate: string): string | null => {
    if (vacationBlocked) return 'Подача заявок на отпуск для вашего отдела временно заблокирована HR'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [y, m, d] = startDate.split('-').map(Number)
    const start = new Date(y, m - 1, d)
    if (start < today) return 'Нельзя выбрать дату отпуска в прошлом'
    const minDate = new Date(today)
    minDate.setDate(minDate.getDate() + MIN_ADVANCE_NOTICE_DAYS)
    if (start < minDate) return `Заявление на отпуск нужно подавать не менее чем за ${MIN_ADVANCE_NOTICE_DAYS} дней до даты начала`
    return null
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

    if (startDate) {
      const validationError = validateVacationStartDate(startDate)
      if (validationError) {
        setDateErrorMessage(validationError)
        setSelectedStartDate(null)
        setSelectedEndDate(null)
        setShowCreateFromCalendar(false)
        return
      }
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
    travelDestination?: string
    travelChildren?: Array<{ fullName: string; birthDate: string }>
    comment: string
    substitute_ids?: number[]
  }) => {
    if (!user || !selectedStartDate || !selectedEndDate) return

    try {
      await useVacationStore.getState().createRequest(user.id, {
        startDate: selectedStartDate,
        endDate: selectedEndDate,
        vacationType: data.vacationType,
        comment: data.comment,
        hasTravel: data.hasTravel,
        travelDestination: data.travelDestination,
        travelChildren: data.travelChildren,
        substitute_ids: data.substitute_ids,
      })
      setSelectedStartDate(null)
      setSelectedEndDate(null)
      setShowCreateFromCalendar(false)
      fetchUserRequests(user.id)
      reloadRequests()
      fetchBalance(user.id, year).then(setBalance)
    } catch (err) {
      setDateErrorMessage(getErrorMessage(err))
    }
  }

  const handleCloseModal = () => {
    setShowCreateFromCalendar(false)
    setSelectedStartDate(null)
    setSelectedEndDate(null)
  }

  useEffect(() => {
    if (!dateErrorMessage) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDateErrorMessage(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dateErrorMessage])

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
      reloadRequests()
    } catch (err) {
    }
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

  const handleOpenSubstitutePicker = async (requestId: string) => {
    if (showSubstitutePicker === requestId) {
      setShowSubstitutePicker(null)
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() })
      const data = await (res.ok ? res.json() : [])
      const raw: VacationEmployee[] = Array.isArray(data) ? data : data.users || []
      const list = raw
        .filter((u) => u.id !== Number(user?.id))
        .map((u) => ({ id: u.id, first_name: u.first_name, last_name: u.last_name, middle_name: u.middle_name, position: u.position || '' }))
      setPickerEmployees(list)
      setShowSubstitutePicker(requestId)
    } catch {}
  }

  const handleAddSubstitute = async (requestId: string, userId: number) => {
    try {
      await useVacationStore.getState().addSubstitutes(requestId, [userId])
      toast.success('Замещающий назначен')
      if (user) {
        fetchUserRequests(user.id)
        reloadRequests()
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleRemoveSubstitute = async (requestId: string, userId: number) => {
    try {
      await useVacationStore.getState().removeSubstitute(requestId, userId)
      toast.success('Замещающий удалён')
      if (user) {
        fetchUserRequests(user.id)
        reloadRequests()
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  const calendarRequests = useMemo(() => {
    const base = calendarScope === 'mine'
      ? currentUserRequests
      : reqFilters.departmentIds.length > 0
        ? calendarDeptRequests ?? []
        : departmentRequests
    const merged = [...base]
    if (calendarScope === 'team' && reqFilters.departmentIds.length === 0) {
      currentUserRequests.forEach(r => {
        if (!merged.some(m => m.id === r.id)) merged.push(r)
      })
    }
    return merged.filter(r => {
      if (r.status !== VacationRequestStatus.APPROVED && r.status !== VacationRequestStatus.ON_APPROVAL) return false
      if (calendarScope === 'mine') return true
      if (reqFilters.departmentIds.length > 0 && (!r.departmentId || !reqFilters.departmentIds.includes(r.departmentId))) return false
      if (reqFilters.statuses.length > 0 && !reqFilters.statuses.includes(r.status)) return false
      if (reqFilters.vacationTypes.length > 0 && !reqFilters.vacationTypes.includes(r.vacationType)) return false
      return true
    })
  }, [departmentRequests, currentUserRequests, calendarDeptRequests, reqFilters, calendarScope])

  const currentActualYear = new Date().getFullYear()
  const minCalendarYear = currentActualYear - 1
  const maxCalendarYear = currentActualYear + 1
  const handlePrevYear = () => setYear((y) => Math.max(minCalendarYear, y - 1))
  const handleNextYear = () => setYear((y) => Math.min(maxCalendarYear, y + 1))

  const location = useLocation()
  const navigate = useNavigate()
  const isMySubstitutions = location.pathname.includes('my-substitutions')

  useEffect(() => {
    fetchMySubstitutions()
  }, [fetchMySubstitutions])

  const hasActiveSubstitution = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return mySubstitutions.some((s) => s.status === 'approved' && s.start_date <= today && s.end_date >= today)
  }, [mySubstitutions])

  const canApprove = isManager || hasActiveSubstitution

  const pendingApprovals = departmentRequests.filter((r) => r.status === VacationRequestStatus.ON_APPROVAL)

  const filteredPendingApprovals = useMemo(() => {
    if (!isAdminOrSuperAdmin) return pendingApprovals
    let list = pendingApprovals
    if (approvalFilters.departmentIds.length > 0) {
      list = list.filter((r) => r.departmentId && approvalFilters.departmentIds.includes(r.departmentId))
    }
    if (approvalFilters.vacationTypes.length > 0) {
      list = list.filter((r) => approvalFilters.vacationTypes.includes(r.vacationType))
    }
    const q = approvalSearch.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => `${r.userLastName} ${r.userFirstName} ${r.userMiddleName ?? ''}`.toLowerCase().includes(q))
    }
    return list
  }, [pendingApprovals, isAdminOrSuperAdmin, approvalFilters, approvalSearch])

  const resetApprovalFilters = () => {
    setApprovalFilters({ departmentIds: [], vacationTypes: [] })
    setApprovalSearch('')
  }

  useEffect(() => {
    if (!deepLinkRequestId || deepLinkHandledRef.current) return
    const historySource = isManager ? departmentRequests : currentUserRequests
    const request =
      pendingApprovals.find((r) => r.id === deepLinkRequestId) ||
      historySource.find((r) => r.id === deepLinkRequestId)
    if (!request) return
    deepLinkHandledRef.current = true
    setDeepLinkRequestId(null)
    handleOpenDetailModal(request)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkRequestId, pendingApprovals, departmentRequests, currentUserRequests, isManager])

  const myRequests = useMemo(() =>
    [...currentUserRequests]
      .filter((r) =>
        (r.status === VacationRequestStatus.ON_APPROVAL ||
          r.status === VacationRequestStatus.APPROVED ||
          r.status === VacationRequestStatus.REJECTED) &&
        Number(r.startDate.slice(0, 4)) === year
      )
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    [currentUserRequests, year]
  )

  useEffect(() => {
    if (!autoExpandedRef.current && expandedRequestId === null && myRequests.length > 0) {
      autoExpandedRef.current = true
      setExpandedRequestId(myRequests[0].id)
    }
  }, [myRequests, expandedRequestId])

  const getReviewerName = (request: VacationRequest) => {
    const entry = [...(request.statusHistory || [])].reverse().find((h) => h.status === request.status)
    return entry?.changedByName
  }

  if (isMySubstitutions) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <h1 className="text-xl font-semibold tracking-tight">Мои замещения</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Работники, которых вы замещаете на время отпуска
          </p>
        </div>

        {mySubstitutions.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            У вас нет активных замещений
          </Card>
        ) : (
          <div className="grid gap-4">
            {mySubstitutions.map((sub) => (
              <Card key={sub.id} className="p-4 hover-lift">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={sub.avatar || generateAvatarUrl(String(sub.user_id), sub.gender ?? undefined)} alt="" />
                    <AvatarFallback>{sub.last_name?.[0]}{sub.first_name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">
                      {sub.last_name} {sub.first_name} {sub.middle_name || ''}
                    </p>
                    <p className="text-sm text-muted-foreground">{sub.position}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {sub.start_date} — {sub.end_date} ({sub.duration} дн.)
                    </p>
                  </div>
                  <Badge variant={sub.status === 'approved' ? 'success' : 'secondary'}>
                    {sub.status === 'approved' ? 'В отпуске' : 'Предстоит'}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  const tabs: Array<{ id: VacationTab; label: string; badge?: number }> = [
    { id: 'mine', label: 'Отпуск' },
    ...(canApprove ? [{ id: 'approvals' as VacationTab, label: 'Согласование', badge: pendingApprovals.length }] : []),
    ...(isManager ? [{ id: 'restrictions' as VacationTab, label: 'Пересечения' }] : []),
    { id: 'requests', label: 'Заявления' },
    { id: 'history', label: 'История' },
  ]

  const calendarSection = (
    <div className="rounded-2xl border border-border bg-card p-[22px] shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
            <CalendarIcon className="h-[18px] w-[18px]" />
          </div>
          <h2 className="text-[16.5px] font-bold text-foreground">Календарь отпусков</h2>
        </div>
        <span className="text-[12.5px] font-semibold text-muted-foreground">{year} год</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-[10px] rounded-xl border border-border bg-muted/40 p-[13px]">
        <div className="inline-flex items-center gap-0 rounded-[10px] border border-border bg-card p-[3px]">
          <button
            type="button"
            onClick={() => setCalendarScope('mine')}
            className={cn(
              'rounded-[8px] px-[14px] py-[7px] text-[13px] font-semibold transition-colors',
              calendarScope === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Мои отпуска
          </button>
          <button
            type="button"
            onClick={() => setCalendarScope('team')}
            className={cn(
              'rounded-[8px] px-[14px] py-[7px] text-[13px] font-semibold transition-colors',
              calendarScope === 'team' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Вся команда
          </button>
        </div>
        {calendarScope === 'team' && (
          <>
            <MultiSelectDropdown
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
              selected={reqFilters.departmentIds}
              onChange={(ids) => {
                deptTouched.current = true
                setReqFilters((f) => ({ ...f, departmentIds: ids }))
              }}
              placeholder="Все отделы"
              countLabel="Отделов"
            />
            {skillsEnabled && tags.length > 0 && (
              <SelectDropdown
                options={[{ value: '', label: 'Все теги' }, ...tags.map((t) => ({ value: String(t.id), label: t.name }))]}
                value={reqFilters.tagId}
                onChange={(v) => setReqFilters((f) => ({ ...f, tagId: v }))}
              />
            )}
            {isManager && (
              <MultiSelectDropdown
                options={REQUEST_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                selected={reqFilters.statuses}
                onChange={(values) => setReqFilters((f) => ({ ...f, statuses: values }))}
                placeholder="Все статусы"
                countLabel="Статусов"
              />
            )}
            {isManager && (
              <MultiSelectDropdown
                options={Object.entries(VACATION_TYPES).map(([code, info]) => ({ value: code, label: info.name }))}
                selected={reqFilters.vacationTypes}
                onChange={(values) => setReqFilters((f) => ({ ...f, vacationTypes: values }))}
                placeholder="Все типы"
                countLabel="Типов"
              />
            )}
            <div className="flex h-9 items-center gap-2 rounded-[10px] border border-border bg-card px-3 transition-shadow focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
              <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по ФИО"
                className="w-[170px] border-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
              />
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-[15px] py-[9px] text-[13px] font-semibold text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
            >
              <RotateCcw className="h-[14px] w-[14px]" />
              Сбросить
            </button>
          </>
        )}
      </div>

      <div className="mx-[2px] mb-[14px] flex items-center gap-2">
        <Lightbulb className="h-[14px] w-[14px] shrink-0 text-amber-500 dark:text-amber-400" />
        <p className="text-[12.5px] text-muted-foreground">Наведите курсор на день, чтобы увидеть, кто отдыхает. Серая штриховка — на согласовании, сплошной цвет — согласовано</p>
      </div>

      <div className={cn('mb-3 flex items-center gap-3 text-xs', !(selectedStartDate || selectedEndDate) && 'invisible')}>
        {selectedStartDate && !selectedEndDate && (
          <span className="text-primary">Выбрана дата: {new Date(selectedStartDate).toLocaleDateString('ru-RU')}</span>
        )}
        {selectedStartDate && selectedEndDate && (
          <span className="text-emerald-600 dark:text-emerald-400">
            Период: {new Date(selectedStartDate).toLocaleDateString('ru-RU')} — {new Date(selectedEndDate).toLocaleDateString('ru-RU')}
          </span>
        )}
        <button
          type="button"
          onClick={() => handleDateRangeSelect(null, null)}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-[15px] py-[9px] text-[13px] font-semibold text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
        >
          <RotateCcw className="h-[14px] w-[14px]" />
          Очистить выбор
        </button>
      </div>

      <YearCalendar
        year={year}
        requests={calendarRequests}
        searchQuery={debouncedSearch}
        onDateRangeSelect={handleDateRangeSelect}
        selectedStartDate={selectedStartDate}
        selectedEndDate={selectedEndDate}
        currentUserId={user?.id}
        onTransfer={handleTransferClick}
        showHeader={false}
        showLegend={false}
      />

      {showCreateFromCalendar && selectedStartDate && selectedEndDate && (
        <CreateVacationModal
          isOpen={showCreateFromCalendar}
          startDate={selectedStartDate}
          endDate={selectedEndDate}
          onClose={handleCloseModal}
          onSubmit={handleCreateFromModal}
          loading={loading}
          balance={balance ?? undefined}
          userId={user?.id}
          restrictionWarnings={restrictionWarningsCalendar}
          onCheckRestrictions={handleCheckRestrictionsCalendar}
          showSubstitutes
        />
      )}

      {dateErrorMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setDateErrorMessage(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-xl animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h3 className="text-base font-semibold">Не удалось выбрать даты отпуска</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{dateErrorMessage}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setDateErrorMessage(null)}>Понятно</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <PageBanner
        icon={Plane}
        title="Отпуска"
        aside={
          <Button variant="outline" size="sm" onClick={() => setShowIntroModal(true)}>
            <HelpCircle className="h-3.5 w-3.5" />
            Как это работает
          </Button>
        }
      />

      <VacationIntroModal open={showIntroModal} onClose={() => setShowIntroModal(false)} isManager={isManager} isAdminOrSuperAdmin={isAdminOrSuperAdmin} />

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {vacationBlocked && (
        <div className="rounded-lg border-2 border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="font-medium">Подача заявок на отпуск для вашего отдела временно заблокирована HR</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {tab.label}
            {typeof tab.badge === 'number' && tab.badge > 0 && (
              <span className={cn(
                'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-semibold',
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'mine' && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-primary px-5 py-5 text-center shadow-lg shadow-primary/20 sm:flex-row sm:justify-center sm:gap-6">
            <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-primary-foreground/80">
              <CalendarIcon className="h-4 w-4" />
              Вы просматриваете отпуска за год
            </div>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={handlePrevYear}
                disabled={year <= minCalendarYear}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground/80 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <span className="min-w-[110px] text-center text-4xl font-extrabold tabular-nums text-primary-foreground">{year}</span>
              <button
                type="button"
                onClick={handleNextYear}
                disabled={year >= maxCalendarYear}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground/80 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          </div>

          {balance && (
            <div className="rounded-2xl border border-border bg-card p-[22px] shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
                    <PieChart className="h-[18px] w-[18px]" />
                  </div>
                  <h2 className="text-[16.5px] font-bold text-foreground">Баланс отпускных дней</h2>
                </div>
              </div>

              <div className="grid grid-cols-3">
                <div className="px-[26px] text-center">
                  <div className="flex items-baseline justify-center">
                    <span className="text-[36px] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">{balance.totalDays}</span>
                    <span className="ml-1 text-sm font-semibold text-muted-foreground">дн.</span>
                  </div>
                  <div className="mt-[3px] text-[13px] font-medium text-muted-foreground">Всего накоплено</div>
                </div>
                <div className="border-l border-border px-[26px] text-center">
                  <div className="flex items-baseline justify-center">
                    <span className="text-[36px] font-extrabold leading-[1.1] tracking-[-0.02em] text-amber-600 dark:text-amber-400">{balance.usedDays}</span>
                    <span className="ml-1 text-sm font-semibold text-muted-foreground">дн.</span>
                  </div>
                  <div className="mt-[3px] text-[13px] font-medium text-muted-foreground">Использовано</div>
                </div>
                <div className="border-l border-border px-[26px] text-center">
                  <div className="flex items-baseline justify-center">
                    <span className="text-[36px] font-extrabold leading-[1.1] tracking-[-0.02em] text-emerald-600 dark:text-emerald-400">{balance.availableDays}</span>
                    <span className="ml-1 text-sm font-semibold text-muted-foreground">дн.</span>
                  </div>
                  <div className="mt-[3px] text-[13px] font-medium text-muted-foreground">Доступно к запросу</div>
                </div>
              </div>

              <div className="mt-5">
                <div className="h-[10px] w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${balance.totalDays > 0 ? Math.min(100, (balance.usedDays / balance.totalDays) * 100) : 0}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12.5px] text-muted-foreground">
                  <span>Использовано: {balance.usedDays}</span>
                  <span>Осталось: {balance.availableDays} из {balance.totalDays}</span>
                </div>
              </div>


            </div>
          )}

          {calendarSection}

          <Card>
            <div className="p-5">
              <CalendarLegendSwatches />
            </div>
          </Card>

          {calendarScope === 'team' && (
            <Card>
              <div className="p-5">
                <button
                  type="button"
                  onClick={() => setDeptTableExpanded((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Работники отдела
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', deptTableExpanded && 'rotate-180')} />
                </button>
                <div
                  className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: deptTableExpanded ? '1fr' : '0fr' }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="pt-3">
                      <DepartmentBalanceTable departmentId={user?.departmentId || ''} year={year} currentUserId={user?.id} />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <div
              className="p-5 cursor-pointer flex items-center justify-between gap-4"
              onClick={() => setMyRequestsExpanded(!myRequestsExpanded)}
            >
              <h2 className="text-base font-semibold">Мои заявки</h2>
              <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200', myRequestsExpanded && 'rotate-180')} />
            </div>
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: myRequestsExpanded ? '1fr' : '0fr' }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="px-5 pb-5">
                  {loading ? (
                    <div className="flex items-center justify-center py-8"><div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
                  ) : myRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">Нет заявок за {year} год</div>
                  ) : (
                    <div className="space-y-3">
                      {myRequests.map((request) => {
                        const isExpanded = expandedRequestId === request.id
                        const isAddingComment = addingComment === request.id
                        const StatusIcon = request.status === VacationRequestStatus.APPROVED
                          ? CheckCircle2
                          : request.status === VacationRequestStatus.REJECTED
                            ? XCircle
                            : Clock
                        const statusColor = request.status === VacationRequestStatus.APPROVED
                          ? 'text-emerald-600 bg-emerald-500/15'
                          : request.status === VacationRequestStatus.REJECTED
                            ? 'text-red-600 bg-red-500/15'
                            : 'text-amber-600 bg-amber-500/15'
                        const reviewerName = getReviewerName(request)

                        return (
                          <div key={request.id} className="rounded-lg border border-border overflow-hidden transition-colors">
                            <div
                              className="p-4 cursor-pointer flex items-center justify-between gap-4 hover:bg-muted/40"
                              onClick={() => {
                                setExpandedRequestId(isExpanded ? null : request.id)
                                if (isAddingComment) {
                                  setAddingComment(null)
                                }
                              }}
                            >
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className={cn('p-2 rounded-lg shrink-0', statusColor)}>
                                  <StatusIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-foreground/90 truncate">
                                    {VACATION_TYPES[request.vacationType]?.name ?? 'Отпуск'}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {new Date(request.startDate).toLocaleDateString('ru-RU')} -{' '}
                                    {new Date(request.endDate).toLocaleDateString('ru-RU')} ({request.duration} дней)
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  {request.status === VacationRequestStatus.ON_APPROVAL && (
                                    <Badge variant="warning">На согласовании</Badge>
                                  )}
                                  {request.status === VacationRequestStatus.APPROVED && (
                                    <Badge variant="success">Согласовано</Badge>
                                  )}
                                  {request.status === VacationRequestStatus.REJECTED && (
                                    <Badge variant="destructive">Отклонено</Badge>
                                  )}
                                  <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200', isExpanded && 'rotate-180')} />
                                </div>
                              </div>
                            </div>
                            <div
                              className="grid transition-[grid-template-rows] duration-300 ease-out"
                              style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                            >
                              <div className="min-h-0 overflow-hidden">
                                <div className="p-4 pt-0 border-t border-border mt-2">
                                  <div className="space-y-3 mt-4">
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">Тип: </span>
                                      {VACATION_TYPES[request.vacationType]?.name ?? 'Отпуск'}
                                    </div>
                                    {reviewerName && (
                                      <div className="text-sm">
                                        <span className="text-muted-foreground">Согласовал: </span>
                                        {reviewerName}
                                      </div>
                                    )}
                                    {request.comment && (
                                      <div className="text-sm">
                                        <span className="text-muted-foreground">Комментарий: </span>
                                        {request.comment}
                                      </div>
                                    )}
                                    {request.status === VacationRequestStatus.REJECTED && request.rejectionReason && (
                                      <div className="text-sm text-red-600">
                                        <span className="text-muted-foreground">Причина отказа: </span>
                                        {request.rejectionReason}
                                      </div>
                                    )}
                                    {request.hasTravel && (
                                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                        <div className="text-sm font-medium text-blue-700 dark:text-blue-400">
                                          ✈️ Проезд{request.travelDestination && ` → ${request.travelDestination}`}
                                        </div>
                                      </div>
                                    )}
                                    {request.substitutes && request.substitutes.length > 0 && (
                                      <div className="flex items-start gap-2">
                                        <UserCheck className="w-4 h-4 text-muted-foreground mt-0.5" />
                                        <div>
                                          <div className="text-xs text-muted-foreground mb-1">Замещающие</div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {request.substitutes.map((s) => (
                                              <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs">
                                                {personName(s.last_name, s.first_name, s.middle_name)}
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); handleRemoveSubstitute(request.id, s.id) }}
                                                  className="hover:text-destructive"
                                                >
                                                  <XCircle className="w-3 h-3" />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {showSubstitutePicker === request.id && (
                                      <div className="max-h-40 overflow-y-auto border border-input rounded-lg">
                                        {pickerEmployees.map((e) => (
                                          <button
                                            key={e.id}
                                            type="button"
                                            onClick={(ev) => { ev.stopPropagation(); handleAddSubstitute(request.id, e.id); setShowSubstitutePicker(null) }}
                                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-sm text-left"
                                          >
                                            {personName(e.last_name, e.first_name, e.middle_name)}
                                            {e.position && <span className="text-muted-foreground text-xs">— {e.position}</span>}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {request.status !== VacationRequestStatus.REJECTED && (
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
                                          Добавить комментарий
                                        </Button>
                                        {request.status === VacationRequestStatus.APPROVED && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => { e.stopPropagation(); handleOpenSubstitutePicker(request.id) }}
                                            disabled={loading}
                                          >
                                            <UserCheck className="w-4 h-4 mr-1" />
                                            Добавить замещающего
                                          </Button>
                                        )}
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          onClick={() => handleCancelClick(request.id)}
                                          disabled={loading}
                                          className="w-full sm:w-auto"
                                        >
                                          Отменить заявку
                                        </Button>
                                      </div>
                                    )}
                                    {isAddingComment && (
                                      <div className="pt-3">
                                        <textarea
                                          className="w-full rounded-lg border-2 border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          placeholder="Введите комментарий..."
                                          value={newComment}
                                          onChange={(e) => setNewComment(e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <div className="flex gap-2 mt-2">
                                          <Button size="sm" onClick={() => handleAddCommentSubmit(request.id)}>
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
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'restrictions' && isManager && <VacationRestrictions />}

      {activeTab === 'approvals' && canApprove && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight">Согласование заявок</h2>
              <p className="text-xs text-muted-foreground">Заявки на отпуск, ожидающие вашего решения</p>
            </div>
            {pendingApprovals.length > 0 && (
              <span className="inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full bg-amber-500/15 px-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                {pendingApprovals.length}
              </span>
            )}
          </div>
          {isAdminOrSuperAdmin && (
            <div className="flex flex-wrap items-center gap-[10px] border-b border-border bg-muted/40 px-5 py-[13px]">
              <MultiSelectDropdown
                options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                selected={approvalFilters.departmentIds}
                onChange={(ids) => setApprovalFilters((f) => ({ ...f, departmentIds: ids }))}
                placeholder="Все отделы"
                countLabel="Отделов"
              />
              <MultiSelectDropdown
                options={Object.entries(VACATION_TYPES).map(([code, info]) => ({ value: code, label: info.name }))}
                selected={approvalFilters.vacationTypes}
                onChange={(values) => setApprovalFilters((f) => ({ ...f, vacationTypes: values }))}
                placeholder="Все типы"
                countLabel="Типов"
              />
              <div className="flex h-9 items-center gap-2 rounded-[10px] border border-border bg-card px-3 transition-shadow focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
                <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                <input
                  value={approvalSearch}
                  onChange={(e) => setApprovalSearch(e.target.value)}
                  placeholder="Поиск по ФИО"
                  className="w-[170px] border-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                />
              </div>
              <button
                type="button"
                onClick={resetApprovalFilters}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-[15px] py-[9px] text-[13px] font-semibold text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
              >
                <RotateCcw className="h-[14px] w-[14px]" />
                Сбросить
              </button>
            </div>
          )}
          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center py-10"><div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
            ) : pendingApprovals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium">Все заявки обработаны</p>
                <p className="mt-1 text-xs text-muted-foreground">Новые заявки появятся здесь</p>
              </div>
            ) : filteredPendingApprovals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
                  <Search className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium">Ничего не найдено</p>
                <p className="mt-1 text-xs text-muted-foreground">Измените фильтры или сбросьте их</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPendingApprovals.map((request) => {
                  const isLeaving = leavingApprovalIds.has(request.id)
                  const isRejecting = rejectingApprovalId === request.id
                  return (
                    <div
                      key={request.id}
                      data-testid="approval-card"
                      className={cn(
                        'rounded-xl border border-border p-4 transition-all duration-[250ms] ease-out hover:border-primary/30',
                        isLeaving ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-4">
                        <button
                          type="button"
                          onClick={() => handleOpenDetailModal(request)}
                          className="flex flex-1 min-w-0 items-center gap-4 text-left"
                        >
                          <Avatar className="w-10 h-10 rounded-lg shrink-0">
                            <AvatarImage src={request.userAvatar || generateAvatarUrl(request.userId, request.userGender)} alt={personName(request.userLastName, request.userFirstName, request.userMiddleName)} />
                            <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-semibold">
                              {request.userFirstName[0]}{request.userLastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-sm">{personName(request.userLastName, request.userFirstName, request.userMiddleName)}</span>
                              <Badge variant="warning">На согласовании</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">{request.userPosition}</div>
                            <div className="text-xs mt-1 text-foreground/70">
                              {VACATION_TYPES[request.vacationType]?.name ?? 'Отпуск'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                              {new Date(request.startDate).toLocaleDateString('ru-RU')} — {new Date(request.endDate).toLocaleDateString('ru-RU')}
                              <Badge variant="outline">{request.duration} дн.</Badge>
                            </div>
                          </div>
                        </button>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleApproveCard(request) }}>
                            Одобрить
                          </Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleRejectCardToggle(request.id) }}>
                            Отклонить
                          </Button>
                        </div>
                      </div>
                      {isRejecting && (
                        <div className="mt-3 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            autoFocus
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="Причина отклонения..."
                            value={approvalRejectReason}
                            onChange={(e) => setApprovalRejectReason(e.target.value)}
                          />
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="destructive" onClick={() => handleRejectCardConfirm(request)} disabled={!approvalRejectReason.trim()}>
                              Отклонить заявку
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleRejectCardToggle(request.id)}>
                              Отмена
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'requests' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate('/vacation/application')}
            className="flex items-start gap-4 rounded-lg border border-border bg-card p-5 text-left hover-lift transition-colors hover:border-primary/40"
          >
            <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Заявление на отпуск</p>
              <p className="text-sm text-muted-foreground mt-0.5">Ежегодный оплачиваемый отпуск</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate('/vacation/transfer-application')}
            className="flex items-start gap-4 rounded-lg border border-border bg-card p-5 text-left hover-lift transition-colors hover:border-primary/40"
          >
            <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Заявление на перенос</p>
              <p className="text-sm text-muted-foreground mt-0.5">Изменение дат существующего отпуска</p>
            </div>
          </button>
        </div>
      )}

      {activeTab === 'history' && (
        <Card className="overflow-hidden">
          <VacationHistoryList requests={isManager ? departmentRequests : currentUserRequests} />
        </Card>
      )}

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
