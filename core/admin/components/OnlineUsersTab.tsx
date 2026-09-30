import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow, format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Radio, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarImage, AvatarFallback } from '@/shared/components/ui/Avatar'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { cn } from '@/shared/lib/utils'

type Status = 'online' | 'away' | 'offline'

interface OnlineUser {
  id: number
  name: string
  position: string | null
  department: string | null
  avatar: string | null
  status: Status
  since: string | null
  lastSeenAt: string | null
}

const REFRESH_MS = 30_000

const STATUS: Record<Status, { label: string; dot: string }> = {
  online: { label: 'Онлайн', dot: 'bg-emerald-500' },
  away: { label: 'Отошёл', dot: 'bg-amber-400' },
  offline: { label: 'Оффлайн', dot: 'bg-muted-foreground/40' },
}

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { locale: ru, addSuffix: true })

function statusNote(u: OnlineUser) {
  if (u.status === 'online') return u.since ? `на сайте с ${format(new Date(u.since), 'HH:mm')}` : ''
  if (u.status === 'away') return u.lastSeenAt ? `последняя активность ${ago(u.lastSeenAt)}` : 'вкладка открыта, активности не было'
  return u.lastSeenAt ? `был(а) ${ago(u.lastSeenAt)}` : 'не заходил(а)'
}

export function OnlineUsersTab() {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Status | 'all'>('all')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/online`, { headers: getAuthHeaders() })
      if (res.ok) setUsers((await res.json()).users)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  const counts = useMemo(() => {
    const c: Record<Status, number> = { online: 0, away: 0, offline: 0 }
    for (const u of users) c[u.status]++
    return c
  }, [users])

  const visible = filter === 'all' ? users : users.filter((u) => u.status === filter)
  const chips: [Status | 'all', string, number][] = [
    ['all', 'Все', users.length],
    ['online', STATUS.online.label, counts.online],
    ['away', STATUS.away.label, counts.away],
    ['offline', STATUS.offline.label, counts.offline],
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> Сейчас на сайте</CardTitle>
            <CardDescription>Онлайн — была активность за последние 5 минут. Обновляется каждые 30 секунд.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Обновить</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                filter === key ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {key !== 'all' && <span className={cn('h-2 w-2 rounded-full', STATUS[key].dot)} />}
              {label}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', filter === key ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Никого нет</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((u) => (
              <li key={u.id} data-testid="online-user" data-status={u.status} className="flex items-center gap-3 py-2.5">
                <div className="relative shrink-0">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={u.avatar || generateAvatarUrl(String(u.id))} alt="" />
                    <AvatarFallback className="text-xs">{u.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card', STATUS[u.status].dot)} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/employees/${u.id}`} className="block truncate text-sm font-medium hover:underline">{u.name}</Link>
                  <p className="truncate text-xs text-muted-foreground">{[u.position, u.department].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium">{STATUS[u.status].label}</p>
                  <p className="text-xs text-muted-foreground">{statusNote(u)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
