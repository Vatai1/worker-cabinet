import { getCookie } from './cookies'

export const getAuthHeaders = (): Record<string, string> => {
  const csrfToken = typeof document !== 'undefined' ? getCookie('csrf_token') : ''
  const headers: Record<string, string> = {}
  // Authorization Bearer header still supported for API/non-browser clients.
  // The backend also reads the HttpOnly auth_token cookie as fallback.
  const token = typeof document !== 'undefined' ? getCookie('auth_token') : ''
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  return headers
}

export const getAuthHeadersWithContentType = (): Record<string, string> => {
  const csrfToken = typeof document !== 'undefined' ? getCookie('csrf_token') : ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = typeof document !== 'undefined' ? getCookie('auth_token') : ''
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  return headers
}
