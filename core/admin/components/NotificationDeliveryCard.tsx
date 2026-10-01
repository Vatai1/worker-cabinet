import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Mail, RefreshCw, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { apiGet, apiPost } from '@/shared/lib/apiClient'
import { cn, getErrorMessage } from '@/shared/lib/utils'

interface DeliveryStats {
  email_pending: number
  email_failed: number
  email_sent_24h: number
  push_pending: number
  oldest_pending_seconds: number | null
  mail_configured: boolean
  mail_rate_per_minute: number
}

const STUCK_AFTER_SECONDS = 15 * 60

function formatAge(seconds: number | null) {
  if (!seconds) return '—'
  if (seconds < 60) return `${seconds} с`
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин`
  return `${Math.round(seconds / 3600)} ч`
}

export function NotificationDeliveryCard() {
  const [stats, setStats] = useState<DeliveryStats | null>(null)
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(async () => {
    try {
      setStats(await apiGet<DeliveryStats>('/admin/notifications/stats'))
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const retry = async () => {
    setRetrying(true)
    try {
      const { retried } = await apiPost<{ retried: number }>('/admin/notifications/retry-failed')
      toast.success(`Поставлено на повторную отправку: ${retried}`)
      load()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setRetrying(false)
    }
  }

  if (!stats) return null
  const stuck = (stats.oldest_pending_seconds ?? 0) > STUCK_AFTER_SECONDS

  const tiles: [string, string | number, boolean][] = [
    ['В очереди писем', stats.email_pending, stuck],
    ['Ждёт дольше всех', formatAge(stats.oldest_pending_seconds), stuck],
    ['Не доставлено', stats.email_failed, stats.email_failed > 0],
    ['Отправлено за сутки', stats.email_sent_24h, false],
    ['Push в очереди', stats.push_pending, false],
  ]

  return (
    <Card data-testid="notification-delivery">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Доставка уведомлений</CardTitle>
            <CardDescription>
              {stats.mail_configured
                ? `Почта настроена, не более ${stats.mail_rate_per_minute} писем в минуту`
                : 'Почта не настроена (MAIL_HOST, MAIL_USER) — уведомления приходят только на сайт и push'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Обновить</Button>
            <Button size="sm" onClick={retry} disabled={retrying || stats.email_failed === 0}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Повторить недоставленные
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stuck && (
          <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Письма не уходят дольше 15 минут — проверьте, что запущен воркер уведомлений и доступен почтовый сервер.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {tiles.map(([label, value, alert]) => (
            <div key={label} className={cn('rounded-xl border p-3 text-center', alert ? 'border-destructive/40 bg-destructive/5' : 'border-border/60')}>
              <div className={cn('text-2xl font-bold', alert && 'text-destructive')}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
