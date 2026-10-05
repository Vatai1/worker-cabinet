import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiDelete } from '@/shared/lib/apiClient'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { Loader2, Plus, Trash2 } from 'lucide-react'

interface TestUserRow {
  id: number
  email: string
  role: string
  first_name: string
  last_name: string
  position: string
  status: string
}

interface TestDataResp {
  department: { id: number; name: string } | null
  users: TestUserRow[]
  active: { previewRole: string | null; isImpersonated: boolean; impersonatedUserId: number | null }
}

export function TestDataTab() {
  const [data, setData] = useState<TestDataResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    apiGet<TestDataResp>('/admin/test-data')
      .then((d) => { setData(d); setError(null) })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    setBusy(true)
    try {
      const d = await apiPost<TestDataResp>('/admin/test-data')
      setData(d)
      setError(null)
    } catch (e) { setError(getErrorMessage(e)) }
    finally { setBusy(false) }
  }

  const deactivate = async () => {
    const ok = await confirmDialog({
      title: 'Деактивировать тестовых пользователей?',
      message: 'Пользователи станут неактивными и исчезнут из списков. Данные и отметка is_test сохранятся.',
      confirmText: 'Деактивировать',
    })
    if (!ok) return
    setBusy(true)
    try {
      await apiDelete('/admin/test-data')
      load()
    } catch (e) { setError(getErrorMessage(e)) }
    finally { setBusy(false) }
  }

  const hasData = !!data?.department || (data?.users?.length ?? 0) > 0
  const activeUsers = data?.users.filter((u) => u.status === 'active') ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Тестовые данные</CardTitle>
        <CardDescription>Тестовый отдел и работники, скрытые от всех, кроме супер-админа</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Загрузка…</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button onClick={create} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                {hasData ? 'Пересоздать / актуализировать' : 'Создать тестовый отдел + работников'}
              </Button>
              {activeUsers.length > 0 && (
                <Button variant="outline" onClick={deactivate} disabled={busy}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Деактивировать
                </Button>
              )}
            </div>

            {data?.department && (
              <p className="text-sm text-muted-foreground">
                Отдел: <span className="font-medium text-foreground">{data.department.name}</span> (id {data.department.id})
              </p>
            )}

            {(data?.users.length ?? 0) > 0 ? (
              <div className="space-y-1.5">
                {data!.users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{u.last_name} {u.first_name} <span className="text-muted-foreground">· {u.email}</span></span>
                    <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                    <Badge className={cn('text-[10px]', u.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
                      {u.status === 'active' ? 'active' : 'inactive'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Тестовые данные ещё не созданы.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
