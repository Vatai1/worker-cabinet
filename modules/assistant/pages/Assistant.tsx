import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Trash2, Plus, MessageSquare, Bot, User, Loader2, AlertCircle, Wrench } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { useAuthStore } from '@/core/auth/store/authStore'
import { assistantApi } from '@/modules/assistant/services/assistantApi'
import { cn } from '@/shared/lib/utils'
import type { ChatMessage, ChatSession } from '@/modules/assistant/types'

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Поиск в интернете',
  browser_navigate: 'Открытие страницы',
  browser_snapshot: 'Чтение страницы',
  browser_click: 'Клик по элементу',
  browser_type: 'Ввод текста',
  terminal: 'Выполнение команды',
  read_file: 'Чтение файла',
  write_file: 'Запись файла',
  execute_code: 'Выполнение кода',
  delegate_task: 'Делегирование задачи',
}

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name.replace(/_/g, ' ')
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function Assistant() {
  const user = useAuthStore((s) => s.user)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingIdRef = useRef<string | null>(null)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [activeSession?.messages, scrollToBottom])

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    try {
      setLoadingSessions(true)
      const data = await assistantApi.getSessions()
      setSessions(
        data.map((s: { id: string; title: string; createdAt: string }) => ({
          id: s.id,
          title: s.title,
          messages: [],
          createdAt: s.createdAt,
        }))
      )
    } catch {
    } finally {
      setLoadingSessions(false)
    }
  }

  async function loadSessionMessages(sessionId: string) {
    try {
      setLoadingMessages(true)
      const data = await assistantApi.getSession(sessionId)
      const messages: ChatMessage[] = data.messages.map((m: { id: number; role: string; content: string; timestamp: string }) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
      }))
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, messages } : s))
      )
    } catch {
    } finally {
      setLoadingMessages(false)
    }
  }

  const createNewSession = () => {
    const id = generateId()
    const session: ChatSession = {
      id,
      title: 'Новый чат',
      messages: [],
      createdAt: new Date(),
    }
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(id)
    setInput('')
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const deleteSession = async (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id)
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : null)
    }
    assistantApi.deleteSession(id).catch(() => {})
  }

  const selectSession = async (id: string) => {
    setActiveSessionId(id)
    setError(null)
    if (streamingIdRef.current !== id) {
      await loadSessionMessages(id)
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    let sessionId = activeSessionId
    let isNewSession = false

    if (!sessionId) {
      sessionId = generateId()
      isNewSession = true
      const session: ChatSession = {
        id: sessionId,
        title: text.slice(0, 40) + (text.length > 40 ? '...' : ''),
        messages: [],
        createdAt: new Date(),
      }
      setSessions((prev) => [session, ...prev])
      setActiveSessionId(sessionId)
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    const streamingMsgId = generateId()
    const streamingMsg: ChatMessage = {
      id: streamingMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
      toolCalls: [],
    }

    streamingIdRef.current = sessionId

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s
        const title = s.messages.length === 0 ? text.slice(0, 40) + (text.length > 40 ? '...' : '') : s.title
        return { ...s, title, messages: [...s.messages, userMessage, streamingMsg] }
      })
    )
    setInput('')
    setError(null)
    setLoading(true)

    try {
      const session = sessions.find((s) => s.id === sessionId)
      const history = (session?.messages || []).map((m: ChatMessage) => ({ role: m.role, content: m.content }))

      const response = await assistantApi.sendMessageStream(text, sessionId, history, {
        onText: (chunk: string) => {
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== sessionId) return s
              const msgs = [...s.messages]
              const idx = msgs.findIndex((m: ChatMessage) => m.id === streamingMsgId)
              if (idx !== -1) {
                msgs[idx] = { ...msgs[idx], content: msgs[idx].content + chunk }
              }
              return { ...s, messages: msgs }
            })
          )
        },
        onToolCall: (name: string) => {
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== sessionId) return s
              const msgs = [...s.messages]
              const idx = msgs.findIndex((m: ChatMessage) => m.id === streamingMsgId)
              if (idx !== -1) {
                const existing = msgs[idx].toolCalls || []
                msgs[idx] = { ...msgs[idx], toolCalls: [...existing, name] }
              }
              return { ...s, messages: msgs }
            })
          )
        },
      })

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s
          const msgs = [...s.messages]
          const idx = msgs.findIndex((m: ChatMessage) => m.id === streamingMsgId)
          if (idx !== -1) {
            const finalContent = response || msgs[idx].content || 'Не удалось получить ответ'
            msgs[idx] = { ...msgs[idx], content: finalContent, streaming: false }
          }
          return { ...s, messages: msgs }
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s
          return { ...s, messages: s.messages.filter((m: ChatMessage) => m.id !== streamingMsgId) }
        })
      )
      if (isNewSession) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        setActiveSessionId(null)
      }
    } finally {
      setLoading(false)
      streamingIdRef.current = null
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      <div className="w-64 border-r border-border flex flex-col bg-card">
        <div className="p-3 border-b border-border">
          <Button onClick={createNewSession} className="w-full flex items-center gap-2" size="sm">
            <Plus className="w-4 h-4" />
            Новый чат
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingSessions && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingSessions && sessions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Нет чатов
            </p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
                session.id === activeSessionId
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
              onClick={() => selectSession(session.id)}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">{session.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteSession(session.id)
                }}
                className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {!activeSession ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
            <Bot className="w-16 h-16 text-primary/40" />
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground mb-2">Ассистент</h2>
              <p className="text-sm max-w-md">
                Задайте вопрос о кадровых процедурах, отпусках, документах или любой рабочий вопрос.
              </p>
            </div>
            <Button onClick={createNewSession} className="mt-2">
              <Plus className="w-4 h-4 mr-2" />
              Начать чат
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingMessages && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loadingMessages && activeSession.messages.length === 0 && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 text-sm text-muted-foreground">
                  <Bot className="w-5 h-5 text-primary shrink-0" />
                  Привет{user?.firstName ? `, ${user.firstName}` : ''}! Чем могу помочь?
                </div>
              )}
              {!loadingMessages && activeSession.messages.map((msg: ChatMessage) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className={cn('max-w-[70%] flex flex-col gap-1.5')}>
                    {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {msg.toolCalls.map((tool: string, i: number) => (
                          <div
                            key={i}
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5 w-fit"
                          >
                            <Wrench className="w-3 h-3" />
                            {getToolLabel(tool)}
                            {(msg.streaming && i === msg.toolCalls!.length - 1) && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border border-border',
                        msg.streaming && !msg.content && 'px-3 py-2'
                      )}
                    >
                      {msg.content || (msg.streaming && <Loader2 className="w-4 h-4 animate-spin text-primary" />)}
                      {msg.streaming && msg.content && (
                        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-text-bottom animate-pulse" />
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-1">
                      <User className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border p-4">
              <div className="flex gap-2 items-end max-w-3xl mx-auto">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Напишите сообщение..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary max-h-32"
                  style={{ minHeight: '44px' }}
                  disabled={loading}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  size="sm"
                  className="h-11 w-11 p-0 rounded-xl"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
