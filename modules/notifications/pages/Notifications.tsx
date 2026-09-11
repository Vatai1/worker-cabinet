import { useState, useEffect, useCallback } from 'react'
import {
  Bell, CheckCheck, Mail, MailOpen, Clock, AlertCircle, Sparkles, ChevronLeft, ChevronRight,
  Plane, ClipboardList, FileText, BarChart3, GraduationCap,
} from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { formatDateTime, getErrorMessage, cn } from '@/shared/lib/utils'
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
  mailing: 'Рассылка',
  generic: 'Уведомление',
}

const TYPE_META: Record<string, { icon: typeof Bell; className: string }> = {
  vacation_created: { icon: Plane, className: 'text-blue-600 bg-blue-500/15' },
  vacation_status_changed: { icon: ClipboardList, className: 'text-violet-600 bg-violet-500/15' },
  document_assigned: { icon: FileText, className: 'text-pink-600 bg-pink-500/15' },
  survey_assigned: { icon: BarChart3, className: 'text-purple-600 bg-purple-500/15' },
  onboarding_task: { icon: GraduationCap, className: 'text-amber-600 bg-amber-500/15' },
  mailing: { icon: Mail, className: 'text-teal-600 bg-teal-500/15' },
  generic: { icon: Bell, className: 'text-muted-foreground bg-muted' },
}

const STATUS_META: Record<string, { label: string; icon: typeof Mail; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  sent: { label: 'Отправлено', icon: Mail, variant: 'success' },
  pending: { label: 'Ожидает', icon: Clock, variant: 'warning' },
  failed: { label: 'Ошибка', icon: AlertCircle, variant: 'destructive' },
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
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden gradient-primary text-white rounded-xl animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-card/3 rounded-full blur-2xl" />
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
                  <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
                    <Bell className="h-3 w-3 text-white/50" />
                    {total} всего
                  </div>
                )}
              </div>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-card/10 text-white hover:bg-card/20 hover:text-white"
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

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight">Лента уведомлений</h2>
            <p className="text-xs text-muted-foreground">
              {total > 0 ? `Страница ${page} из ${totalPages || 1} · всего ${total}` : 'Пока нет уведомлений'}
            </p>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-16 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">Нет уведомлений</p>
              <p className="mt-1 text-xs text-muted-foreground">Здесь будут отображаться все ваши уведомления</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((n) => {
                const isUnread = !n.read_at
                const meta = TYPE_META[n.type] || TYPE_META.generic
                const Icon = meta.icon
                const label = TYPE_LABELS[n.type] || n.type
                const data = n.data || {}
                const subject = (data.subject as string) || label
                const message = (data.message as string) || ''
                const imageUrls = (data.imageUrls as string[]) || []
                const title = n.type === 'mailing' ? (data.title as string) : subject
                const statusMeta = STATUS_META[n.status]
                const StatusIcon = statusMeta?.icon || MailOpen

                return (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-4 transition-colors cursor-pointer',
                      isUnread ? 'border-primary/30 bg-primary/5 hover:bg-primary/10' : 'border-border hover:bg-muted/30',
                    )}
                    onClick={() => isUnread && markAsRead(n.id)}
                  >
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.className)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{title}</span>
                        {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      {message && (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{message}</p>
                      )}
                      {imageUrls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {imageUrls.slice(0, 3).map((url, idx) => (
                            <img key={idx} src={url} alt="" className="h-16 w-16 rounded-lg object-cover border border-border/40" />
                          ))}
                          {imageUrls.length > 3 && (
                            <span className="self-center text-xs text-muted-foreground">+{imageUrls.length - 3}</span>
                          )}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={statusMeta?.variant || 'outline'}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusMeta?.label || n.status}
                        </Badge>
                        <span>{formatDateTime(n.sent_at || n.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
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
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
