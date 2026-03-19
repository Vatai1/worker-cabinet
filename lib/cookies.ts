const COOKIE_OPTIONS = 'path=/; SameSite=Lax; Max-Age=604800'

export function setCookie(name: string, value: string): void {
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
