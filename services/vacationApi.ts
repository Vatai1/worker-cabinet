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

const API_BASE_URL = process.env.VITE_API_BASE_URL || '/api'

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

const mockDelay = (ms: number = 500) => new Promise((resolve) => setTimeout(resolve, ms))

export const vacationApi = {
  async getUserRequests(userId: string): Promise<VacationRequest[]> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-requests?userId=${userId}`)
    return handleResponse(response)
  },

  async getDepartmentRequests(departmentId: string): Promise<VacationRequest[]> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-requests?departmentId=${departmentId}`)
    return handleResponse(response)
  },

  async getBalance(userId: string): Promise<VacationBalance> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-balance/${userId}`)
    return handleResponse(response)
  },

  async getRestrictions(departmentId: string): Promise<VacationRestriction[]> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-restrictions?departmentId=${departmentId}`)
    return handleResponse(response)
  },

  async validateRequest(
    userId: string,
    data: VacationFormData
  ): Promise<VacationValidationError[]> {
    await mockDelay(200)
    const response = await fetch(`${API_BASE_URL}/vacation-requests/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...data }),
    })
    return handleResponse(response)
  },

  async createRequest(userId: string, data: VacationFormData): Promise<VacationRequest> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...data }),
    })
    return handleResponse(response)
  },

  async updateRequest(requestId: string, data: Partial<VacationFormData>): Promise<VacationRequest> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-requests/${requestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  async cancelRequest(requestId: string): Promise<VacationRequest> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-requests/${requestId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    return handleResponse(response)
  },

  async approveRequest(requestId: string, managerId: string): Promise<VacationRequest> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerId }),
    })
    return handleResponse(response)
  },

  async rejectRequest(
    requestId: string,
    managerId: string,
    reason: string
  ): Promise<VacationRequest> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerId, reason }),
    })
    return handleResponse(response)
  },

  async cancelByManager(
    requestId: string,
    managerId: string,
    reason: string
  ): Promise<VacationRequest> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-requests/${requestId}/cancel-by-manager`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerId, reason }),
    })
    return handleResponse(response)
  },

  async createRestriction(
    departmentId: string,
    data: Omit<VacationRestriction, 'id' | 'departmentId' | 'createdAt' | 'createdBy' | 'createdByName'>
  ): Promise<VacationRestriction> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-restrictions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentId, ...data }),
    })
    return handleResponse(response)
  },

  async deleteRestriction(restrictionId: string): Promise<void> {
    await mockDelay()
    const response = await fetch(`${API_BASE_URL}/vacation-restrictions/${restrictionId}`, {
      method: 'DELETE',
    })
    return handleResponse(response)
  },

  async getCalendarItems(departmentId: string, year: number): Promise<VacationCalendarItem[]> {
    await mockDelay()
    const response = await fetch(
      `${API_BASE_URL}/vacation-calendar?departmentId=${departmentId}&year=${year}`
    )
    return handleResponse(response)
  },

  async generateStatement(requestId: string): Promise<Blob> {
    await mockDelay(1000)
    const response = await fetch(`${API_BASE_URL}/vacation-requests/${requestId}/statement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
