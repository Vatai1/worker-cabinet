export interface ChatMessage {
  id: string | number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date | string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date | string
}
