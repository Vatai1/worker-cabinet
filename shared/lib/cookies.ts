// NOTE: auth_token is now set as an HttpOnly cookie by the backend.
// The setCookie function should NOT be used for auth_token anymore.
// This file is kept for other non-sensitive cookies (e.g., preferences).
const COOKIE_OPTIONS = 'path=/; SameSite=Lax; Max-Age=604800'

export function setCookie(name: string, value: string): void {
  if (name === 'auth_token') {
    // auth_token is now HttpOnly, set by the backend via Set-Cookie header.
    // Do not set it via document.cookie.
    console.warn('[security] auth_token should not be set via JavaScript — backend sets it as HttpOnly cookie.')
    return
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; ${COOKIE_OPTIONS}`
}

export function getCookie(name: string): string | null {
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split('=')
    if (cookieName === name) {
      return decodeURIComponent(cookieValue)
    }
  }
  return null
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; SameSite=Lax; Max-Age=0`
}
