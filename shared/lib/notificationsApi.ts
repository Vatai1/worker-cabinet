import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

export interface NotificationItem {
  id: number
  type: string
  channel: string
  data: Record<string, unknown>
  status: string
  sent_at: string | null
  created_at: string
  read_at?: string | null
}

export async function fetchMyNotifications(page = 1, limit = 20): Promise<{ notifications: NotificationItem[]; total: number }> {
  const res = await fetch(`${API_BASE_URL}/notifications/my?page=${page}&limit=${limit}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Ошибка загрузки')
  return res.json()
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/notifications/my/unread-count`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) return 0
  const data = await res.json()
  return data.count
}

export async function markNotificationRead(id: number): Promise<void> {
  await fetch(`${API_BASE_URL}/notifications/my/${id}/read`, {
    method: 'PATCH',
    headers: getAuthHeadersWithContentType(),
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch(`${API_BASE_URL}/notifications/my/read-all`, {
    method: 'PATCH',
    headers: getAuthHeadersWithContentType(),
  })
}
