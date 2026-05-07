import { API_BASE_URL } from '@/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import type { Survey, SurveyWithQuestions, SurveyAnalytics } from '@/types'

interface SurveyFormPayload {
  title: string
  description?: string
  targetType: string
  targetDepartmentId?: number
  questions: Array<{
    text: string
    type: string
    required: boolean
    options?: string[]
  }>
}

export const surveyApi = {
  async list(): Promise<Survey[]> {
    const res = await fetch(`${API_BASE_URL}/surveys`, { headers: getAuthHeaders() })
    if (!res.ok) throw new Error('Ошибка загрузки опросов')
    return res.json()
  },

  async listMy(): Promise<(Survey & { responded: boolean })[]> {
    const res = await fetch(`${API_BASE_URL}/surveys/my`, { headers: getAuthHeaders() })
    if (!res.ok) throw new Error('Ошибка загрузки опросов')
    return res.json()
  },

  async get(id: string): Promise<SurveyWithQuestions> {
    const res = await fetch(`${API_BASE_URL}/surveys/${id}`, { headers: getAuthHeaders() })
    if (!res.ok) throw new Error('Опрос не найден')
    return res.json()
  },

  async create(data: SurveyFormPayload): Promise<Survey> {
    const res = await fetch(`${API_BASE_URL}/surveys`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify(data),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
    return res.json()
  },

  async update(id: string, data: SurveyFormPayload): Promise<Survey> {
    const res = await fetch(`${API_BASE_URL}/surveys/${id}`, {
      method: 'PUT',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify(data),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
    return res.json()
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/surveys/${id}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка удаления')
  },

  async publish(id: string): Promise<Survey> {
    const res = await fetch(`${API_BASE_URL}/surveys/${id}/publish`, {
      method: 'POST', headers: getAuthHeaders(),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка публикации') }
    return res.json()
  },

  async close(id: string): Promise<Survey> {
    const res = await fetch(`${API_BASE_URL}/surveys/${id}/close`, {
      method: 'POST', headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка закрытия опроса')
    return res.json()
  },

  async view(id: string): Promise<SurveyWithQuestions> {
    const res = await fetch(`${API_BASE_URL}/surveys/${id}/view`, { headers: getAuthHeaders() })
    const data = await res.json()
    if (!res.ok) throw Object.assign(new Error(data.error || 'Ошибка'), { status: res.status })
    return data
  },

  async respond(id: string, answers: { questionId: number; value?: string; values?: string[] }[]): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/surveys/${id}/respond`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ answers }),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка отправки') }
  },

  async analytics(id: string): Promise<SurveyAnalytics> {
    const res = await fetch(`${API_BASE_URL}/surveys/${id}/analytics`, { headers: getAuthHeaders() })
    if (!res.ok) throw new Error('Ошибка аналитики')
    return res.json()
  },
}
