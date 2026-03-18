import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest, getAuthHeaders } from './useApi'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

interface VacationRequest {
  id: string
  userId: string
  startDate: string
  endDate: string
  vacationType: string
  status: string
  duration: number
  hasTravel: boolean
  comment?: string
}

export function useVacationRequests(userId: string | undefined) {
  return useQuery({
    queryKey: ['vacation-requests', 'user', userId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/vacation/requests?userId=${userId}`, {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      })
      if (!response.ok) throw new Error('Failed to fetch requests')
      return response.json() as Promise<VacationRequest[]>
    },
    enabled: !!userId,
  })
}

export function useVacationBalance(userId: string | undefined) {
  return useQuery({
    queryKey: ['vacation-balance', userId],
    queryFn: () => apiRequest(`/vacation/balance/${userId}`),
    enabled: !!userId,
  })
}

export function useCreateVacationRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      userId: string
      startDate: string
      endDate: string
      vacationType: string
      hasTravel: boolean
      comment?: string
    }) => {
      return apiRequest('/vacation/requests', {
        method: 'POST',
        body: JSON.stringify(data),
      } as RequestInit)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vacation-requests', 'user', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['vacation-balance', variables.userId] })
    },
  })
}

export function useApproveVacationRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ requestId, managerId }: { requestId: string; managerId: string }) => {
      return apiRequest(`/vacation/requests/${requestId}/approve`, {
        method: 'PUT',
        body: JSON.stringify({ managerId }),
      } as RequestInit)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-requests'] })
    },
  })
}

export function useRejectVacationRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      requestId,
      managerId,
      reason,
    }: {
      requestId: string
      managerId: string
      reason: string
    }) => {
      return apiRequest(`/vacation/requests/${requestId}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ managerId, reason }),
      } as RequestInit)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-requests'] })
    },
  })
}

export function useCancelVacationRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason?: string }) => {
      return apiRequest(`/vacation/requests/${requestId}/cancel`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      } as RequestInit)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-requests'] })
    },
  })
}
