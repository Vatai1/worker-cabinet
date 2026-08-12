import { getCookie } from './cookies'

function getOrgHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin/global')) return {}
  const orgId = getCookie('active_org_id')
  return orgId ? { 'X-Organization-Id': orgId } : {}
}

export const getAuthHeaders = (): Record<string, string> => {
  const csrfToken = typeof document !== 'undefined' ? getCookie('csrf_token') : ''
  const headers: Record<string, string> = {}
  const token = typeof document !== 'undefined' ? getCookie('auth_token') : ''
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  Object.assign(headers, getOrgHeaders())
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
  Object.assign(headers, getOrgHeaders())
  return headers
}
