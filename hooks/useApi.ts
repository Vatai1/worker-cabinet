import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const getAuthHeaders = (): Record<string, string> => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = {}
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch { /* ignore */ }
  }
  return headers
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Ошибка запроса' }))
    throw new Error(error.error || 'Ошибка запроса')
  }

  return response.json()
}

export function useApiQuery<T>(key: unknown[], url: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: key,
    queryFn: () => apiRequest<T>(url),
    ...options,
  })
}

export function useApiMutation<T, V>(url: string, method: 'POST' | 'PUT' | 'DELETE' = 'POST') {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: V) =>
      apiRequest<T>(url, {
        method,
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}

export { apiRequest, getAuthHeaders }
