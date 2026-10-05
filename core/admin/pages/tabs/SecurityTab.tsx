import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { personName } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { Loader2, Activity, Lock, ShieldCheck, Unlock } from 'lucide-react'

interface SessionStats {
  onlineNow: number
  daily: { date: string; logins: number; unique_users: number }[]
  byOrganization: { organization_id: number; organization_name: string; logins: number; unique_users: number }[]
  byMethod: { login_method: string; logins: number }[]
}

export function SecurityTab() {
  const [failedLogins, setFailedLogins] = useState<{ attempts: { id: number; email: string; ip_address: string; created_at: string }[]; byIp: { ip_address: string; count: string; last_attempt: string }[]; byEmail: { email: string; count: string; last_attempt: string }[] } | null>(null)
  const [lockedAccounts, setLockedAccounts] = useState<{ id: number; email: string; first_name: string; last_name: string; middle_name: string | null; locked_until: string; failed_login_count: number; department: string | null }[]>([])
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [flRes, lockedRes, statsRes] = await Promise.all([
        fetchWithRetry(`${API_BASE_URL}/admin/security/failed-logins?days=${days}`, { headers: getAuthHeaders() }),
        fetchWithRetry(`${API_BASE_URL}/admin/security/locked-accounts`, { headers: getAuthHeaders() }),
        fetchWithRetry(`${API_BASE_URL}/admin/security/session-stats?days=${days}`, { headers: getAuthHeaders() }),
      ])
      if (flRes.ok) setFailedLogins(await flRes.json())
      if (lockedRes.ok) setLockedAccounts(await lockedRes.json())
      if (statsRes.ok) setSessionStats(await statsRes.json())
    } catch {} finally { setLoading(false) }
  }, [days])

  useEffect(() => { fetchData() }, [fetchData])

  const unlockAccount = async (id: number) => {
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/users/${id}/unlock`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
      })
      if (res.ok) setLockedAccounts((prev) => prev.filter((a) => a.id !== id))
    } catch {}
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {sessionStats && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Активность входов</CardTitle>
                <CardDescription>За последние {days} дней</CardDescription>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Онлайн сейчас: {sessionStats.onlineNow}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">По дням</h4>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {sessionStats.daily.map((d) => (
                    <div key={d.date} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 text-sm">
                      <span>{new Date(d.date).toLocaleDateString('ru-RU')}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{d.unique_users} польз.</span>
                        <Badge className="text-[10px]">{d.logins} вх.</Badge>
                      </div>
                    </div>
                  ))}
                  {sessionStats.daily.length === 0 && <p className="text-sm text-muted-foreground py-2">Нет данных</p>}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">По организациям</h4>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {sessionStats.byOrganization.map((d) => (
                    <div key={d.organization_id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 text-sm">
                      <span className="truncate">{d.organization_name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                        <span>{d.unique_users} польз.</span>
                        <Badge className="text-[10px]">{d.logins} вх.</Badge>
                      </div>
                    </div>
                  ))}
                  {sessionStats.byOrganization.length === 0 && <p className="text-sm text-muted-foreground py-2">Нет данных</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {lockedAccounts.length > 0 && (
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Lock className="h-5 w-5" /> Заблокированные аккаунты ({lockedAccounts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lockedAccounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
                  <div>
                    <p className="font-medium">{personName(a.last_name, a.first_name, a.middle_name)}</p>
                    <p className="text-xs text-muted-foreground">{a.email} · Попыток: {a.failed_login_count} · До: {new Date(a.locked_until).toLocaleString('ru-RU')}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => unlockAccount(a.id)}>
                    <Unlock className="h-3.5 w-3.5 mr-1" /> Разблокировать
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Неудачные попытки входа</CardTitle>
              <CardDescription>За последние {days} дней</CardDescription>
            </div>
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm">
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {failedLogins && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">По IP-адресам</h4>
                <div className="space-y-1">
                  {failedLogins.byIp.map((ip) => (
                    <div key={ip.ip_address} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 text-sm">
                      <span className="font-mono text-xs">{ip.ip_address}</span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px]" variant="destructive">{ip.count}</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(ip.last_attempt).toLocaleString('ru-RU')}</span>
                      </div>
                    </div>
                  ))}
                  {failedLogins.byIp.length === 0 && <p className="text-sm text-muted-foreground py-2">Нет данных</p>}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">По email</h4>
                <div className="space-y-1">
                  {failedLogins.byEmail.map((e) => (
                    <div key={e.email} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 text-sm">
                      <span className="font-mono text-xs">{e.email}</span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px]" variant="destructive">{e.count}</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(e.last_attempt).toLocaleString('ru-RU')}</span>
                      </div>
                    </div>
                  ))}
                  {failedLogins.byEmail.length === 0 && <p className="text-sm text-muted-foreground py-2">Нет данных</p>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
