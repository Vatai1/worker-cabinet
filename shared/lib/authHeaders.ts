import { getCookie } from './cookies'

export const getAuthHeaders = (): Record<string, string> => {
  const token = getCookie('auth_token')
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export const getAuthHeadersWithContentType = (): Record<string, string> => {
  const token = getCookie('auth_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}
