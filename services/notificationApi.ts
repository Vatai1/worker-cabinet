import { getCookie } from '@/lib/cookies'
import { API_BASE_URL } from '@/lib/api'

const getAuthHeaders = (): Record<string, string> => {
  const token = getCookie('auth_token')
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export const notificationApi = {
  getAll: async () => {
    const response = await fetch(`${API_BASE_URL}/notifications`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch notifications')
    return response.json()
  },

  markAsRead: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Failed to mark notification as read')
    return response.json()
  },

  markAllAsRead: async () => {
    const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Failed to mark all notifications as read')
    return response.json()
  },

  delete: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/notifications/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Failed to delete notification')
    return response.json()
  },

}
