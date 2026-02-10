import type {
  VacationRequest,
  VacationBalance,
  VacationRestriction,
  VacationCalendarItem,
  VacationFormData,
  VacationValidationError,
  VacationApiError,
} from '@/types'
import { VacationRequestStatus, VacationType } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

class VacationApiError extends Error implements VacationApiError {
  code: string
  details?: any

  constructor(code: string, message: string, details?: any) {
    super(message)
    this.name = 'VacationApiError'
    this.code = code
    this.details = details
  }
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

const mapDbRequestToApi = (dbRequest: any): VacationRequest => ({
  id: dbRequest.id?.toString(),
  userId: dbRequest.user_id?.toString(),
  userFirstName: dbRequest.first_name || '',
  userLastName: dbRequest.last_name || '',
  userMiddleName: dbRequest.middle_name,
  userPosition: dbRequest.position || '',
  userDepartment: dbRequest.department_name || '',
  startDate: dbRequest.start_date?.split('T')[0] || '',
  endDate: dbRequest.end_date?.split('T')[0] || '',
  duration: dbRequest.duration || 0,
  vacationType: dbRequest.vacation_type || 'annual_paid',
  status: dbRequest.status || 'pending',
  comment: dbRequest.comment,
  hasTravel: dbRequest.has_travel || false,
  rejectionReason: dbRequest.rejection_reason,
  cancellationReason: dbRequest.cancellation_reason,
  referenceDocument: dbRequest.reference_document,
  reviewedAt: dbRequest.reviewed_at,
  reviewedBy: dbRequest.reviewed_by?.toString(),
  createdAt: dbRequest.created_at,
  statusHistory: dbRequest.statusHistory || [],
})

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  console.log('[vacationApi] Auth storage:', authStorage ? 'exists' : 'not found')
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      console.log('[vacationApi] State:', state)
      console.log('[vacationApi] Token:', state?.token ? `${state.token.substring(0, 30)}...` : 'not found')
      if (state?.token) {
        return {
          'Authorization': `Bearer ${state.token}`,
        }
      }
    } catch (e) {
      console.log('[vacationApi] Error parsing auth storage:', e)
    }
  }
  console.log('[vacationApi] No auth headers')
  return {}
}

export const vacationApi = {
  async getAllRequests(): Promise<VacationRequest[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests`, {
      headers: getAuthHeaders(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getUserRequests(userId: string): Promise<VacationRequest[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests?userId=${userId}`, {
      headers: getAuthHeaders(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getDepartmentRequests(departmentId: string): Promise<VacationRequest[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests?departmentId=${departmentId}`, {
      headers: getAuthHeaders(),
    })
    const data = await handleResponse(response)
    return data.map(mapDbRequestToApi)
  },

  async getBalance(userId: string): Promise<VacationBalance> {
    const response = await fetch(`${API_BASE_URL}/vacation/balance/${userId}`, {
      headers: getAuthHeaders(),
    })
    const data = await handleResponse(response)
    return {
      userId: data.user_id?.toString() || userId,
      totalDays: data.total_days || 28,
      usedDays: data.used_days || 0,
      availableDays: data.available_days || 28,
      reservedDays: data.reserved_days || 0,
      lastAccrualDate: data.last_accrual_date,
      travelAvailable: data.travel_available || false,
      travelNextAvailableDate: data.travel_next_available_date,
      hireDate: data.hire_date?.split('T')[0],
    }
  },

  async getRestrictions(departmentId: string): Promise<VacationRestriction[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/restrictions?departmentId=${departmentId}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(response)
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
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
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
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async cancelRequest(requestId: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    })
    const dbRequest = await handleResponse(response)
    return mapDbRequestToApi(dbRequest)
  },

  async approveRequest(requestId: string, managerId: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
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
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
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
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
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
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ departmentId, ...data }),
    })
    return handleResponse(response)
  },

  async deleteRestriction(restrictionId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/vacation/restrictions/${restrictionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
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

  async generateStatement(requestId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/statement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new VacationApiError(
        error.code || 'GENERATION_ERROR',
        error.message || 'Failed to generate statement'
      )
    }
    
    return response.blob()
  },
}

export type VacationApi = typeof vacationApi
