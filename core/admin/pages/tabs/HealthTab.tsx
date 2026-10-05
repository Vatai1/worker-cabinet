import { useState, useEffect } from 'react'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Users, Loader2, Activity, RefreshCw, Database, HardDrive, Server, AlertCircle, Boxes, Tag } from 'lucide-react'
import { NotificationDeliveryCard } from '@/core/admin/components/NotificationDeliveryCard'

export function HealthTab() {
  const [health, setHealth] = useState<{
    version: string
    counters: { users: number; enabledModules: number; activeWs: number; errorsLast24h: number }
    database: { version: string; sizeFormatted: string }
    server: { uptimeFormatted: string; memory: { rss: string; heapUsed: string; heapTotal: string }; nodeVersion: string; platform: string }
    environment: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchHealth() }, [])

  const fetchHealth = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/health`, { headers: getAuthHeaders() })
      if (res.ok) setHealth(await res.json())
    } catch {} finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!health) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Состояние системы</h3>
        <Button variant="outline" size="sm" onClick={fetchHealth}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Обновить</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30 mb-2">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-2xl font-bold">{health.counters.users}</p>
            <p className="text-xs text-muted-foreground">Пользователи</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-2.5 rounded-xl bg-orange-100 dark:bg-orange-900/30 mb-2">
              <Boxes className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <p className="text-2xl font-bold">{health.counters.enabledModules}</p>
            <p className="text-xs text-muted-foreground">Активные модули</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-900/30 mb-2">
              <Activity className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-2xl font-bold">{health.counters.activeWs}</p>
            <p className="text-xs text-muted-foreground">WS-подключения</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 mb-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-2xl font-bold">{health.counters.errorsLast24h}</p>
            <p className="text-xs text-muted-foreground">Ошибки за 24 часа</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 mb-2">
              <Tag className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-2xl font-bold">{health.version}</p>
            <p className="text-xs text-muted-foreground">Версия приложения</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <Database className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">PostgreSQL</p>
              <p className="font-bold">{health.database.version}</p>
              <p className="text-xs text-muted-foreground">Размер: {health.database.sizeFormatted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Node.js {health.server.nodeVersion}</p>
              <p className="font-bold">Uptime: {health.server.uptimeFormatted}</p>
              <p className="text-xs text-muted-foreground">{health.server.platform} | {health.environment}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <HardDrive className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Память (Heap)</p>
              <p className="font-bold">{health.server.memory.heapUsed} / {health.server.memory.heapTotal}</p>
              <p className="text-xs text-muted-foreground">RSS: {health.server.memory.rss}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <NotificationDeliveryCard />
    </div>
  )
}
