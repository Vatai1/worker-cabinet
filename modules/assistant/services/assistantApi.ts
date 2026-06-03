import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

export const assistantApi = {
  async sendMessage(
    message: string,
    sessionId: string,
    history: Array<{ role: string; content: string }>
  ): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/assistant/chat`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ message, sessionId, history }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Ошибка связи с ассистентом' }))
      throw new Error(err.error || 'Ошибка связи с ассистентом')
    }

    const data = await response.json()
    return data.response
  },

  async getSessions(): Promise<Array<{ id: string; title: string; createdAt: string; message_count: string }>> {
    const response = await fetch(`${API_BASE_URL}/assistant/sessions`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Ошибка загрузки сессий')
    return response.json()
  },

  async getSession(
    id: string
  ): Promise<{ id: string; title: string; createdAt: string; messages: Array<{ id: number; role: string; content: string; timestamp: string }> }> {
    const response = await fetch(`${API_BASE_URL}/assistant/sessions/${id}`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Ошибка загрузки чата')
    return response.json()
  },

  async deleteSession(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/assistant/sessions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    if (!response.ok) throw new Error('Ошибка удаления')
  },
}
