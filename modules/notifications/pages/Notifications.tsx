import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, CheckCheck, Mail, Sparkles, ChevronLeft, ChevronRight,
  Plane, ClipboardList, FileText, BarChart3, GraduationCap, Bug,
} from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { formatDateTime, getErrorMessage, cn } from '@/shared/lib/utils'
import { PageBanner, BannerPill } from '@/shared/components/PageBanner'
import { useAuthStore } from '@/core/auth/store/authStore'
import { openNotification } from '@/shared/lib/notificationClick'
import {
  type NotificationItem as Notification,
  fetchMyNotifications, fetchUnreadCount as fetchUnreadCountApi, markAllNotificationsRead,
} from '@/shared/lib/notificationsApi'

const TYPE_LABELS: Record<string, string> = {
  vacation_created: 'Заявка на отпуск',
  vacation_status_changed: 'Статус отпуска',
  vacation_substitution: 'Замещение на отпуске',
  vacation_substitution_removed: 'Замещение отменено',
  bug_report_new: 'Баг-репорт',
  bug_report_update: 'Статус баг-репорта',
  document_assigned: 'Документ для ознакомления',
  survey_assigned: 'Новый опрос',
  onboarding_task: 'Задача онбординга',
  mailing: 'Рассылка',
  generic: 'Уведомление',
}

const TYPE_META: Record<string, { icon: typeof Bell; className: string }> = {
  vacation_created: { icon: Plane, className: 'text-blue-600 bg-blue-500/15' },
  vacation_status_changed: { icon: ClipboardList, className: 'text-violet-600 bg-violet-500/15' },
  vacation_substitution: { icon: Plane, className: 'text-blue-600 bg-blue-500/15' },
  vacation_substitution_removed: { icon: Plane, className: 'text-muted-foreground bg-muted' },
  bug_report_new: { icon: Bug, className: 'text-red-600 bg-red-500/15' },
  bug_report_update: { icon: Bug, className: 'text-orange-600 bg-orange-500/15' },
  document_assigned: { icon: FileText, className: 'text-pink-600 bg-pink-500/15' },
  survey_assigned: { icon: BarChart3, className: 'text-purple-600 bg-purple-500/15' },
  onboarding_task: { icon: GraduationCap, className: 'text-amber-600 bg-amber-500/15' },
  mailing: { icon: Mail, className: 'text-teal-600 bg-teal-500/15' },
  generic: { icon: Bell, className: 'text-muted-foreground bg-muted' },
}

export function Notifications() {
  const navigate = useNavigate()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchMyNotifications(page, 20)
      setNotifications(data.notifications)
      setTotal(data.total)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page])

  const fetchUnreadCount = useCallback(async () => {
    setUnreadCount(await fetchUnreadCountApi())
  }, [])

  useEffect(() => {
    fetchNotifications()
    fetchUnreadCount()
  }, [fetchNotifications, fetchUnreadCount])

  const markLocalAsRead = (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const handleNotificationClick = async (n: Notification) => {
    const wasMarked = await openNotification(n, navigate, currentUserId)
    if (wasMarked) markLocalAsRead(n.id)
  }

  const markAllAsRead = async () => {
    await markAllNotificationsRead()
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    )
    setUnreadCount(0)
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6 animate-fade-in">
      <PageBanner
        compact
        icon={Sparkles}
        eyebrow="Центр сообщений"
        title="Уведомления"
        subtitle="Все уведомления и почтовые рассылки в одном месте"
        aside={
          <>
            {unreadCount > 0 && <BannerPill icon={Mail} tone="warning">{unreadCount} непрочитанных</BannerPill>}
            {total > 0 && <BannerPill icon={Bell}>{total} всего</BannerPill>}
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead}>
                <CheckCheck className="h-3.5 w-3.5" />
                Прочитать все
              </Button>
            )}
          </>
        }
      />

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
                const title = (data.subject as string) || (data.title as string) || label
                const message = (data.message as string) || ''
                const imageUrls = (data.imageUrls as string[]) || []

                return (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-4 transition-colors cursor-pointer',
                      isUnread ? 'border-primary/30 bg-primary/5 hover:bg-primary/10' : 'border-border hover:bg-muted/30',
                    )}
                    onClick={() => handleNotificationClick(n)}
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
                      <div className="mt-2 text-xs text-muted-foreground">
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
