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

export function httpErrorFallback(status: number): string {
  if (status === 400) return 'Некорректные данные запроса'
  if (status === 403) return 'Недостаточно прав для этого действия'
  if (status === 404) return 'Данные не найдены'
  if (status === 409) return 'Конфликт данных: запись уже существует или была изменена'
  if (status === 413) return 'Файл слишком большой'
  if (status === 429) return 'Слишком много запросов, попробуйте позже'
  if (status >= 500) return 'Ошибка сервера. Она записана в журнал, попробуйте позже'
  return 'Не удалось выполнить запрос'
}

let refreshing: Promise<boolean> | null = null
let sessionExpiredHandler: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler
}

export async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeadersWithContentType(),
      })
      if (res.status === 401) sessionExpiredHandler?.()
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

async function throwApiError(response: Response): Promise<never> {
  const data = await response.json().catch(() => null)
  throw new ApiError(
    response.status,
    data?.code || 'API_ERROR',
    data?.error || data?.message || httpErrorFallback(response.status),
  )
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) await throwApiError(response)
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
  if (!response.ok) await throwApiError(response)
}
