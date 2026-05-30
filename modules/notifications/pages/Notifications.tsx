import { useState, useEffect, useCallback } from 'react'
import { Bell, CheckCheck, Mail, MailOpen, Clock, AlertCircle, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { formatDateTime, getErrorMessage } from '@/shared/lib/utils'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'

interface Notification {
  id: number
  type: string
  channel: string
  data: Record<string, unknown>
  status: string
  sent_at: string | null
  created_at: string
  read_at?: string | null
}

const TYPE_LABELS: Record<string, string> = {
  vacation_created: 'Заявка на отпуск',
  vacation_status_changed: 'Статус отпуска',
  document_assigned: 'Документ для ознакомления',
  survey_assigned: 'Новый опрос',
  onboarding_task: 'Задача онбординга',
  generic: 'Уведомление',
}

const TYPE_ICONS: Record<string, string> = {
  vacation_created: '✈️',
  vacation_status_changed: '📋',
  document_assigned: '📄',
  survey_assigned: '📊',
  onboarding_task: '🎓',
  generic: '🔔',
}

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `${API_BASE_URL}/notifications/my?page=${page}&limit=20`,
        { headers: getAuthHeaders() }
      )
      if (!res.ok) throw new Error('Ошибка загрузки')
      const data = await res.json()
      setNotifications(data.notifications)
      setTotal(data.total)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/my/unread-count`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.count)
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchNotifications()
    fetchUnreadCount()
  }, [fetchNotifications, fetchUnreadCount])

  const markAsRead = async (id: number) => {
    await fetch(`${API_BASE_URL}/notifications/my/${id}/read`, {
      method: 'PATCH',
      headers: getAuthHeadersWithContentType(),
    })
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const markAllAsRead = async () => {
    await fetch(`${API_BASE_URL}/notifications/my/read-all`, {
      method: 'PATCH',
      headers: getAuthHeadersWithContentType(),
    })
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    )
    setUnreadCount(0)
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden gradient-primary text-white rounded-xl animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-white/3 rounded-full blur-2xl" />
        <div className="relative z-10 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-white/60" />
                <span className="text-white/40 text-[10px] font-medium uppercase tracking-wider">Центр сообщений</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">Уведомления</h1>
              <p className="mt-1 text-white/50 text-sm">Все уведомления и почтовые рассылки в одном месте</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-wrap gap-2">
                {unreadCount > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-400/20 backdrop-blur-sm border border-amber-400/20 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                    <Mail className="h-3 w-3 text-amber-300/70" />
                    {unreadCount} непрочитанных
                  </div>
                )}
                {total > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                    <Bell className="h-3 w-3 text-white/50" />
                    {total} всего
                  </div>
                )}
              </div>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={markAllAsRead}
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                  Прочитать все
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : notifications.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground animate-fade-in">
          <Bell className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Нет уведомлений</p>
          <p className="text-sm mt-1">Здесь будут отображаться все ваши уведомления</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {notifications.map((n, index) => {
              const isUnread = !n.read_at
              const icon = TYPE_ICONS[n.type] || '🔔'
              const label = TYPE_LABELS[n.type] || n.type
              const data = n.data || {}
              const subject = (data.subject as string) || label
              const message = (data.message as string) || ''
              const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'

              return (
                <Card
                  key={n.id}
                  className={`section-card ${staggerClass} transition-colors cursor-pointer ${
                    isUnread ? 'border-primary/30 bg-primary/5' : ''
                  }`}
                  onClick={() => isUnread && markAsRead(n.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm">{subject}</span>
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                        {message && (
                          <p className="text-sm text-muted-foreground truncate">{message}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            {n.status === 'sent' ? (
                              <><Mail className="h-3 w-3" /> Отправлено</>
                            ) : n.status === 'pending' ? (
                              <><Clock className="h-3 w-3" /> Ожидает</>
                            ) : n.status === 'failed' ? (
                              <><AlertCircle className="h-3 w-3 text-destructive" /> Ошибка</>
                            ) : (
                              <><MailOpen className="h-3 w-3" /> {n.status}</>
                            )}
                          </span>
                          <span>{formatDateTime(n.sent_at || n.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Назад
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Далее
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
