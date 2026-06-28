import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

let refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      return res.ok
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  let response = await fetch(url, { ...options, credentials: 'include' })

  if (response.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      response = await fetch(url, { ...options, credentials: 'include' })
    }
  }

  return response
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Ошибка', code: 'API_ERROR' }))
    throw new ApiError(response.status, data.code || 'API_ERROR', data.error || 'Ошибка')
  }
  return response.json() as Promise<T>
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    headers: getAuthHeaders(),
  })
  return handleResponse<T>(response)
}

export async function apiPost<T = void>(path: string, body?: unknown): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: getAuthHeadersWithContentType(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export async function apiPut<T = void>(path: string, body?: unknown): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: getAuthHeadersWithContentType(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export async function apiPatch<T = void>(path: string, body?: unknown): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: getAuthHeadersWithContentType(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Ошибка', code: 'API_ERROR' }))
    throw new ApiError(response.status, data.code || 'API_ERROR', data.error || 'Ошибка')
  }
}
