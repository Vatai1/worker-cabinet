const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const getAuthHeaders = () => {
  const storage = JSON.parse(localStorage.getItem('auth-storage') || '{}')
  const token = storage.state?.token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const notificationApi = {
  getAll: async () => {
    const response = await fetch(`${API_BASE_URL}/notifications`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch notifications')
    return response.json()
  },

  getUnreadCount: async () => {
    const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch unread count')
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

  create: async (notification: {
    userId: string
    title: string
    message: string
    type: 'info' | 'success' | 'warning' | 'error'
  }) => {
    const response = await fetch(`${API_BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notification),
    })
    if (!response.ok) throw new Error('Failed to create notification')
    return response.json()
  },
}
