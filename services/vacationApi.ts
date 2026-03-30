import type {
  VacationRequest,
  VacationBalance,
  VacationRestriction,
  VacationCalendarItem,
  VacationFormData,
  VacationValidationError,
} from '@/types'
import { getCookie } from '@/lib/cookies'
import { API_BASE_URL } from '@/lib/api'

class VacationApiError extends Error {
  code: string
  details?: any

  constructor(code: string, message: string, details?: any) {
    super(message)
    this.name = 'VacationApiError'
    this.code = code
    this.details = details
  }
}

const getAuthHeaders = (): Record<string, string> => {
  const token = getCookie('auth_token')
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

const getAuthHeadersWithContentType = (): Record<string, string> => {
  const token = getCookie('auth_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new VacationApiError(
      error.code || 'API_ERROR',
      error.message || 'An error occurred',
      error.details
    )
  }
  return response.json()
}

const formatLocalDate = (date: any): string => {
  if (!date) return ''

  // Если это строка без времени
  if (typeof date === 'string' && !date.includes('T')) {
    return date
  }

  // Если это строка с временем или Date объект, конвертируем в локальную дату
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const mapDbRequestToApi = (dbRequest: any): VacationRequest => ({
  id: dbRequest.id?.toString(),
  userId: dbRequest.user_id?.toString(),
  userFirstName: dbRequest.first_name || '',
  userLastName: dbRequest.last_name || '',
  userMiddleName: dbRequest.middle_name,
  userPosition: dbRequest.position || '',
  userDepartment: dbRequest.department_name || '',
  startDate: formatLocalDate(dbRequest.start_date),
  endDate: formatLocalDate(dbRequest.end_date),
  duration: dbRequest.duration || 0,
  vacationType: dbRequest.vacation_type || 'annual_paid',
  status: dbRequest.status || 'pending',
  comment: dbRequest.comment,
  hasTravel: dbRequest.has_travel || false,
  rejectionReason: dbRequest.rejection_reason,
  cancellationReason: dbRequest.cancellation_reason,
  referenceDocument: dbRequest.reference_document,
  transferRequestedAt: dbRequest.transfer_requested_at,
  transferReason: dbRequest.transfer_reason,
  transferredFromId: dbRequest.transferred_from_id?.toString(),
  reviewedAt: dbRequest.reviewed_at,
  reviewedBy: dbRequest.reviewed_by?.toString(),
  createdAt: dbRequest.created_at,
  statusHistory: dbRequest.statusHistory || [],
})

export const vacationApi = {
  async getAllRequests(filters?: { departmentId?: string; year?: number }): Promise<VacationRequest[]> {
    const params = new URLSearchParams()
    if (filters?.departmentId) params.set('departmentId', filters.departmentId)
    if (filters?.year) params.set('year', filters.year.toString())
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await fetch(`${API_BASE_URL}/vacation/requests${query}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getUserRequests(userId: string): Promise<VacationRequest[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests?userId=${userId}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getDepartmentRequests(departmentId: string): Promise<VacationRequest[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests?departmentId=${departmentId}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getBalance(userId: string, year: number): Promise<VacationBalance> {
    const response = await fetch(`${API_BASE_URL}/vacation/balance/${userId}?year=${year}`, {
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
      hireDate: data.hire_date?.split('T')[0],
    }
  },

  async getRestrictions(departmentId: string): Promise<VacationRestriction[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/restrictions?departmentId=${departmentId}`, {
      headers: getAuthHeadersWithContentType(),
    })
    return handleResponse(response)
  },

  async checkRestrictions(
    userId: string,
    data: { startDate: string; endDate: string }
  ): Promise<VacationValidationError[]> {
    console.log('[vacationApi] checkRestrictions called', { userId, startDate: data.startDate, endDate: data.endDate })
    const response = await fetch(`${API_BASE_URL}/vacation/check-restrictions`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ userId, startDate: data.startDate, endDate: data.endDate }),
    })
    const result = await handleResponse(response)
    console.log('[vacationApi] checkRestrictions result:', result)
    return result
  },

  async validateRequest(
    userId: string,
    data: VacationFormData
  ): Promise<VacationValidationError[]> {
    // Валидация происходит на бэкенде при создании
    return []
  },

  async createRequest(userId: string, data: VacationFormData): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({
        startDate: data.startDate,
        endDate: data.endDate,
        vacationType: data.vacationType,
        comment: data.comment,
        hasTravel: data.hasTravel,
        referenceDocument: data.referenceDocument,
      }),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async updateRequest(requestId: string, data: Partial<VacationFormData>): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}`, {
      method: 'PUT',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify(data),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async cancelRequest(requestId: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/cancel`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async approveRequest(requestId: string, managerId: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/approve`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async rejectRequest(
    requestId: string,
    managerId: string,
    reason: string
  ): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/reject`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ reason }),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async cancelByManager(
    requestId: string,
    managerId: string,
    reason: string
  ): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/cancel-by-manager`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ managerId, reason }),
    })
    return handleResponse(response)
  },

  async createRestriction(
    departmentId: string,
    data: Omit<VacationRestriction, 'id' | 'departmentId' | 'createdAt' | 'createdBy' | 'createdByName'>
  ): Promise<VacationRestriction> {
    const response = await fetch(`${API_BASE_URL}/vacation/restrictions`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ departmentId, ...data }),
    })
    return handleResponse(response)
  },

  async deleteRestriction(restrictionId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/vacation/restrictions/${restrictionId}`, {
      method: 'DELETE',
      headers: getAuthHeadersWithContentType(),
    })
    return handleResponse(response)
  },

  async getCalendarItems(departmentId: string, year: number): Promise<VacationCalendarItem[]> {
    const response = await fetch(
      `${API_BASE_URL}/vacation/calendar?departmentId=${departmentId}&year=${year}`,
      { headers: getAuthHeaders() }
    )
    return handleResponse(response)
  },

  async addComment(requestId: string, comment: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/comment`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ comment }),
    })
    return handleResponse(response)
  },

  async requestTransfer(
    requestId: string,
    data: { newStartDate: string; newEndDate: string; reason: string }
  ): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/transfer`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify(data),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async approveTransfer(requestId: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/transfer/approve`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async rejectTransfer(requestId: string, reason: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/transfer/reject`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ reason }),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async cancelTransfer(requestId: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/transfer/cancel`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async getTransferRequests(filters?: { departmentId?: string }): Promise<VacationRequest[]> {
    const params = new URLSearchParams()
    params.set('transferPending', 'true')
    if (filters?.departmentId) params.set('departmentId', filters.departmentId)
    const response = await fetch(`${API_BASE_URL}/vacation/requests?${params.toString()}`, {
      headers: getAuthHeadersWithContentType(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },
}

export type VacationApi = typeof vacationApi
