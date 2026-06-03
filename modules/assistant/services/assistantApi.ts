import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

export interface StreamCallbacks {
  onText: (text: string) => void
  onToolCall: (name: string) => void
}

export const assistantApi = {
  async sendMessageStream(
    message: string,
    sessionId: string,
    history: Array<{ role: string; content: string }>,
    callbacks: StreamCallbacks
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

    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream')) {
      return readStream(response, callbacks)
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

async function readStream(response: Response, callbacks: StreamCallbacks): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') continue

      try {
        const data = JSON.parse(payload)
        const delta = data.choices?.[0]?.delta

        if (delta?.content) {
          fullText += delta.content
          callbacks.onText(delta.content)
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const name = tc.function?.name
            if (name) {
              callbacks.onToolCall(name)
            }
          }
        }
      } catch {
      }
    }
  }

  return fullText
}
