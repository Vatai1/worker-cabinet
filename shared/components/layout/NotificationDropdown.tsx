import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { formatDateTime } from '@/shared/lib/utils'
import { openNotification } from '@/shared/lib/notificationClick'
import {
  type NotificationItem,
  fetchMyNotifications, markAllNotificationsRead,
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

interface NotificationDropdownProps {
  unreadCount: number
  onUnreadCountChange: (count: number) => void
}

export function NotificationDropdown({ unreadCount, onUnreadCountChange }: NotificationDropdownProps) {
  const navigate = useNavigate()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchMyNotifications(1, 8)
      setItems(data.notifications)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleItemClick = async (n: NotificationItem) => {
    setOpen(false)
    const wasMarked = await openNotification(n, navigate, currentUserId)
    if (wasMarked) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it)))
      onUnreadCountChange(Math.max(0, unreadCount - 1))
    }
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    setItems((prev) => prev.map((it) => ({ ...it, read_at: it.read_at || new Date().toISOString() })))
    onUnreadCountChange(0)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Уведомления"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold ring-2 ring-background">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-border bg-card shadow-xl animate-scale-in">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Уведомления</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Нет уведомлений</div>
            ) : (
              items.map((n) => {
                const isUnread = !n.read_at
                const data = n.data || {}
                const label = TYPE_LABELS[n.type] || n.type
                const title = (data.subject as string) || (data.title as string) || label
                const message = (data.message as string) || ''
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/40 ${isUnread ? 'bg-primary/5' : ''}`}
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                      {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                    {message && <span className="line-clamp-1 text-xs text-muted-foreground">{message}</span>}
                    <span className="text-[11px] text-muted-foreground/70">{formatDateTime(n.sent_at || n.created_at)}</span>
                  </button>
                )
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/notifications') }}
            className="block w-full border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-muted/40"
          >
            Все уведомления
          </button>
        </div>
      )}
    </div>
  )
}
