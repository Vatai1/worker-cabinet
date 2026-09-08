import type {
  VacationRequest,
  VacationBalance,
  VacationRestriction,
  VacationFormData,
  VacationValidationError,
  VacationSubstitution,
  DepartmentBalanceEntry,
} from '@/shared/types'
import { VacationType, VacationRequestStatus } from '@/shared/types'
import { API_BASE_URL } from '@/shared/lib/api'
import { fetchWithRetry, ApiError } from '@/shared/lib/apiClient'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

export { ApiError as VacationApiError }

interface DbTravelChild {
  fullName?: string
  full_name?: string
  birthDate?: string
  birth_date?: string
}

interface DbVacationRequest {
  id?: number | string
  user_id?: number | string
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
  position?: string | null
  department_id?: number | string | null
  department_name?: string | null
  avatar?: string | null
  gender?: 'male' | 'female' | 'other' | null
  start_date?: string | null
  end_date?: string | null
  duration?: number | null
  vacation_type?: string | null
  status?: string | null
  comment?: string | null
  has_travel?: boolean | null
  travel_destination?: string | null
  travel_children_count?: number | null
  travel_children?: DbTravelChild[] | null
  rejection_reason?: string | null
  cancellation_reason?: string | null
  reference_document?: string | null
  transfer_requested_at?: string | null
  transfer_reason?: string | null
  transferred_from_id?: number | string | null
  reviewed_at?: string | null
  reviewed_by?: number | string | null
  created_at?: string | null
  statusHistory?: VacationRequest['statusHistory']
  department_manager_id?: number | string | null
  departmentManagerId?: number | string | null
  approver_id?: number | string | null
  substitutes?: VacationRequest['substitutes']
  delegated_to?: VacationRequest['delegated_to']
}

interface DbDepartmentBalance {
  user_id?: number | string
  first_name?: string | null
  last_name?: string | null
  avatar?: string | null
  gender?: 'male' | 'female' | 'other' | null
  total_days?: number | null
  used_days?: number | null
  available_days?: number | null
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new ApiError(
      response.status,
      error.code || 'API_ERROR',
      error.message || 'An error occurred'
    )
  }
  return response.json()
}

const formatLocalDate = (date: unknown): string => {
  if (!date) return ''

  if (typeof date === 'string' && !date.includes('T')) {
    return date
  }

  const d = new Date(date as string | Date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const mapDbRequestToApi = (dbRequest: DbVacationRequest): VacationRequest => ({
  id: dbRequest.id?.toString() ?? '',
  userId: dbRequest.user_id?.toString() ?? '',
  userFirstName: dbRequest.first_name || '',
  userLastName: dbRequest.last_name || '',
  userMiddleName: dbRequest.middle_name ?? undefined,
  userPosition: dbRequest.position || '',
  userDepartment: dbRequest.department_name || '',
  departmentId: dbRequest.department_id?.toString(),
  userAvatar: dbRequest.avatar || undefined,
  userGender: dbRequest.gender || undefined,
  startDate: formatLocalDate(dbRequest.start_date),
  endDate: formatLocalDate(dbRequest.end_date),
  duration: dbRequest.duration || 0,
  vacationType: (dbRequest.vacation_type || 'annual_paid') as VacationType,
  status: (dbRequest.status || 'pending') as VacationRequestStatus,
  comment: dbRequest.comment ?? undefined,
  hasTravel: dbRequest.has_travel || false,
  travelDestination: dbRequest.travel_destination || undefined,
  travelChildrenCount: dbRequest.travel_children_count || 0,
  travelChildren: Array.isArray(dbRequest.travel_children) ? dbRequest.travel_children.map((c) => ({ fullName: c.fullName || c.full_name || '', birthDate: c.birthDate || c.birth_date || '' })) : [],
  rejectionReason: dbRequest.rejection_reason ?? undefined,
  cancellationReason: dbRequest.cancellation_reason ?? undefined,
  referenceDocument: dbRequest.reference_document ?? undefined,
  transferRequestedAt: dbRequest.transfer_requested_at ?? undefined,
  transferReason: dbRequest.transfer_reason ?? undefined,
  transferredFromId: dbRequest.transferred_from_id?.toString(),
  reviewedAt: dbRequest.reviewed_at ?? undefined,
  reviewedBy: dbRequest.reviewed_by?.toString(),
  createdAt: dbRequest.created_at ?? '',
  statusHistory: dbRequest.statusHistory || [],
  departmentManagerId: (dbRequest.department_manager_id ?? dbRequest.departmentManagerId)?.toString(),
  approverId: dbRequest.approver_id?.toString(),
  substitutes: dbRequest.substitutes || [],
  delegated_to: dbRequest.delegated_to || null,
})

export const vacationApi = {
  async getAllRequests(filters?: { departmentId?: string; year?: number; status?: string; vacationType?: string; scope?: 'connections' }): Promise<VacationRequest[]> {
    const params = new URLSearchParams()
    if (filters?.departmentId) params.set('departmentId', filters.departmentId)
    if (filters?.year) params.set('year', filters.year.toString())
    if (filters?.status) params.set('status', filters.status)
    if (filters?.vacationType) params.set('vacationType', filters.vacationType)
    if (filters?.scope) params.set('scope', filters.scope)
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests${query}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getUserRequests(userId: string): Promise<VacationRequest[]> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests?userId=${userId}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getDepartmentHeadRequests(): Promise<VacationRequest[]> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/department-head-requests`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getDepartmentRequests(departmentId: string, filters?: { status?: string; year?: number; vacationType?: string }): Promise<VacationRequest[]> {
    const params = new URLSearchParams({ departmentId })
    if (filters?.status) params.set('status', filters.status)
    if (filters?.year) params.set('year', filters.year.toString())
    if (filters?.vacationType) params.set('vacationType', filters.vacationType)
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests?${params.toString()}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getBalance(userId: string, year: number): Promise<VacationBalance> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/balance/${userId}?year=${year}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return {
      userId: data.user_id?.toString() || userId,
      year: data.year ?? year,
      totalDays: data.total_days ?? 47,
      usedDays: data.used_days ?? 0,
      availableDays: data.available_days ?? 47,
      reservedDays: data.reserved_days ?? 0,
      lastAccrualDate: data.last_accrual_date,
      travelAvailable: data.travel_available ?? false,
      travelNextAvailableDate: data.travel_next_available_date,
      travelAvailableUntil: data.travel_available_until,
      hireDate: data.hire_date?.split('T')[0],
    }
  },

  async getRestrictions(departmentId: string): Promise<VacationRestriction[]> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/restrictions?departmentId=${departmentId}`, {
      headers: getAuthHeadersWithContentType(),
    })
    return handleResponse(response)
  },

  async checkRestrictions(
    userId: string,
    data: { startDate: string; endDate: string }
  ): Promise<VacationValidationError[]> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/check-restrictions`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ userId, startDate: data.startDate, endDate: data.endDate }),
    })
    const result = await handleResponse(response)
    return result
  },

  async createRequest(_userId: string, data: VacationFormData): Promise<VacationRequest> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({
        startDate: data.startDate,
        endDate: data.endDate,
        vacationType: data.vacationType,
        comment: data.comment,
        hasTravel: data.hasTravel,
        travelDestination: data.travelDestination,
        travelChildren: data.travelChildren,
        referenceDocument: data.referenceDocument,
        substitute_ids: data.substitute_ids || [],
      }),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async updateRequest(requestId: string, data: Partial<VacationFormData>): Promise<VacationRequest> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests/${requestId}`, {
      method: 'PUT',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify(data),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async cancelRequest(requestId: string): Promise<VacationRequest> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests/${requestId}/cancel`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async approveRequest(requestId: string, _managerId: string): Promise<VacationRequest> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests/${requestId}/approve`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async rejectRequest(
    requestId: string,
    _managerId: string,
    reason: string
  ): Promise<VacationRequest> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests/${requestId}/reject`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ reason }),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async createRestriction(
    departmentId: string,
    data: Omit<VacationRestriction, 'id' | 'departmentId' | 'createdAt' | 'createdBy' | 'createdByName'>
  ): Promise<VacationRestriction> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/restrictions`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ departmentId, ...data }),
    })
    return handleResponse(response)
  },

  async deleteRestriction(restrictionId: string): Promise<void> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/restrictions/${restrictionId}`, {
      method: 'DELETE',
      headers: getAuthHeadersWithContentType(),
    })
    return handleResponse(response)
  },

  async addComment(requestId: string, comment: string): Promise<VacationRequest> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests/${requestId}/comment`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ comment }),
    })
    return handleResponse(response)
  },

  async requestTransfer(
    requestId: string,
    data: { newStartDate: string; newEndDate: string; reason: string; substitute_ids?: number[] }
  ): Promise<VacationRequest> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests/${requestId}/transfer`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify(data),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async addSubstitutes(requestId: string, substituteIds: number[]): Promise<{ added: number }> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/requests/${requestId}/substitutes`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ substitute_ids: substituteIds }),
    })
    return handleResponse(response)
  },

  async removeSubstitute(requestId: string, userId: number): Promise<void> {
    await fetchWithRetry(`${API_BASE_URL}/vacation/requests/${requestId}/substitutes/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeadersWithContentType(),
    })
  },

  async getMySubstitutions(): Promise<VacationSubstitution[]> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/my-substitutions`, {
      headers: getAuthHeadersWithContentType(),
    })
    return handleResponse(response)
  },

  async getDepartmentBalances(departmentId: string, year: number): Promise<DepartmentBalanceEntry[]> {
    const response = await fetchWithRetry(`${API_BASE_URL}/vacation/balances?departmentId=${departmentId}&year=${year}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data: DbDepartmentBalance[] = await handleResponse(response)
    return data.map((row) => ({
      userId: row.user_id?.toString() ?? '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      avatar: row.avatar || undefined,
      gender: row.gender || undefined,
      totalDays: row.total_days ?? 0,
      usedDays: row.used_days ?? 0,
      availableDays: row.available_days ?? 0,
    }))
  },

}
