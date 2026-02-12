const TELEGRAM_API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = localStorage.getItem('token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${TELEGRAM_API_URL}${url}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return response.json()
}

interface BotInfo {
  available: boolean
  botUsername?: string
  message: string
}

interface UserStatus {
  connected: boolean
  username?: string
  notificationsEnabled: boolean
}

export async function getBotInfo(): Promise<BotInfo> {
  return request('/telegram/bot-info')
}

export async function getUserTelegramStatus(): Promise<UserStatus> {
  return request('/telegram/user-status')
}

export async function connectTelegram(telegramUsername: string): Promise<{ success: boolean; message: string }> {
  return request('/telegram/connect', {
    method: 'POST',
    body: JSON.stringify({ telegramUsername })
  })
}

export async function disconnectTelegram(): Promise<{ success: boolean; message: string }> {
  return request('/telegram/disconnect', {
    method: 'POST'
  })
}

export async function toggleTelegramNotifications(enabled: boolean): Promise<{ success: boolean; enabled: boolean }> {
  return request('/telegram/toggle-notifications', {
    method: 'POST',
    body: JSON.stringify({ enabled })
  })
}
