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

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

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

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  if (authStorage) {
    const { state } = JSON.parse(authStorage)
    if (state?.token) {
      return {
        'Authorization': `Bearer ${state.token}`,
      }
    }
  }
  return {}
}

export const vacationApi = {
  async getUserRequests(userId: string): Promise<VacationRequest[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests?userId=${userId}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(response)
  },

  async getDepartmentRequests(departmentId: string): Promise<VacationRequest[]> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests?departmentId=${departmentId}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(response)
  },

  async getBalance(userId: string): Promise<VacationBalance> {
    const response = await fetch(`${API_BASE_URL}/vacation/balance/${userId}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(response)
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
      }),
    })
    return handleResponse(response)
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
    return handleResponse(response)
  },

  async cancelRequest(requestId: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    })
    return handleResponse(response)
  },

  async approveRequest(requestId: string, managerId: string): Promise<VacationRequest> {
    const response = await fetch(`${API_BASE_URL}/vacation/requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ managerId }),
    })
    return handleResponse(response)
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
    return handleResponse(response)
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
