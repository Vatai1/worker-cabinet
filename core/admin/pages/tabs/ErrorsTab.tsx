import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { cn } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { Loader2, Check, ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { TelemetryActions } from '@/shared/components/TelemetryActions'
import type { TelemetryAction } from '@/shared/lib/telemetry'

export function ErrorsTab() {
  const [errors, setErrors] = useState<{ id: number; message: string; stack: string | null; path: string | null; method: string | null; status_code: number | null; user_email: string | null; ip: string | null; module: string | null; actions: TelemetryAction[] | null; created_at: string }[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [filterModule, setFilterModule] = useState('')

  const fetchErrors = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/error-log?page=${page}&limit=25`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setErrors(data.errors)
        setTotal(data.total)
      }
    } catch {} finally { setLoading(false) }
  }, [page])

  useEffect(() => { fetchErrors() }, [fetchErrors])

  const totalPages = Math.ceil(total / 25)
  const statusColor = (code: number) => {
    if (code >= 500) return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
    if (code >= 400) return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30'
    return 'text-muted-foreground bg-muted/50'
  }

  const moduleCounts = errors.reduce((acc, e) => {
    const mod = e.module || 'general'
    acc[mod] = (acc[mod] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const sortedModules = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])
  const filteredErrors = filterModule ? errors.filter(e => (e.module || 'general') === filterModule) : errors

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Журнал ошибок</CardTitle>
            <CardDescription>Всего: {total}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchErrors}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Обновить</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : errors.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Check className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Ошибок не обнаружено</p>
          </div>
        ) : (
          <>
            {sortedModules.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFilterModule('')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    !filterModule ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                  )}
                >
                  Все
                  <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', !filterModule ? 'bg-primary-foreground/20' : 'bg-muted')}>{errors.length}</span>
                </button>
                {sortedModules.map(([mod, count]) => (
                  <button
                    key={mod}
                    onClick={() => setFilterModule(filterModule === mod ? '' : mod)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      filterModule === mod ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {mod}
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', filterModule === mod ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
                  </button>
                ))}
              </div>
            )}
            {filteredErrors.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <Check className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">Нет ошибок в этом модуле</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredErrors.map((err) => (
                  <div key={err.id} className={cn('p-4 rounded-xl border transition-colors cursor-pointer', expandedId === err.id ? 'border-border bg-muted/10' : 'border-border/30 hover:border-border/60')} onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}>
                    <div className="flex items-start gap-3">
                      <Badge className={cn('text-[10px] shrink-0', statusColor(err.status_code || 500))}>
                        {err.module === 'frontend' ? 'JS' : err.status_code || 500}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{err.message}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {err.module && <span className="font-mono px-1.5 py-0.5 rounded bg-muted/50">{err.module}</span>}
                          {err.method && <span className="font-mono">{err.method}</span>}
                          {err.path && <span className="font-mono truncate">{err.path}</span>}
                          <span>·</span>
                          <span>{new Date(err.created_at).toLocaleString('ru-RU')}</span>
                          {err.user_email && <><span>·</span><span>{err.user_email}</span></>}
                        </div>
                        {expandedId === err.id && err.stack && (
                          <pre className="mt-3 p-3 rounded-lg bg-muted/30 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground max-h-64 overflow-y-auto">
                            {err.stack}
                          </pre>
                        )}
                        {expandedId === err.id && err.actions && err.actions.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs text-muted-foreground">Действия пользователя перед ошибкой</p>
                            <TelemetryActions actions={err.actions} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">{(page - 1) * 25 + 1}–{Math.min(page * 25, total)} из {total}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
