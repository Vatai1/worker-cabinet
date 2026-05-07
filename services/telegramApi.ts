import { getCookie } from '@/lib/cookies'
import { API_BASE_URL } from '@/lib/api'

function getAuthHeaders(): HeadersInit {
  const token = getCookie('auth_token')
  if (token) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }
  return {
    'Content-Type': 'application/json'
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return response.json()
}

interface UserStatus {
  connected: boolean
  username?: string
  notificationsEnabled: boolean
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
