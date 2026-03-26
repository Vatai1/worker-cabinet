import { API_BASE_URL } from '@/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import type { DocumentTemplate } from '@/types'

export const templateApi = {
  async list(): Promise<DocumentTemplate[]> {
    const res = await fetch(`${API_BASE_URL}/templates`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка загрузки шаблонов')
    return res.json()
  },

  async upload(formData: FormData): Promise<DocumentTemplate> {
    const res = await fetch(`${API_BASE_URL}/templates`, {
      method: 'POST',
      headers: getAuthHeaders(), // no Content-Type — browser sets multipart boundary
      body: formData,
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Ошибка загрузки')
    }
    return res.json()
  },

  async update(id: number, data: { name: string; description?: string; category: string }): Promise<DocumentTemplate> {
    const res = await fetch(`${API_BASE_URL}/templates/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || 'Ошибка обновления')
    }
    return res.json()
  },

  async remove(id: number): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/templates/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Ошибка удаления')
    }
  },

  async getOnlyOfficeInfo(id: number): Promise<{ url: string; key: string; name: string; mimeType: string }> {
    const res = await fetch(`${API_BASE_URL}/templates/${id}/onlyoffice`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка получения URL')
    return res.json()
  },

  async incrementDownload(id: number): Promise<{ url: string }> {
    const res = await fetch(`${API_BASE_URL}/templates/${id}/download`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка')
    return res.json()
  },

  setPurpose(id: number, purpose: string | null): Promise<Response> {
    return fetch(`${API_BASE_URL}/templates/${id}/purpose`, {
      method: 'PUT',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ purpose }),
    })
  },
}
