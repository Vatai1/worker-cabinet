import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Rocket, Server } from 'lucide-react'
import { formatDateTime, getErrorMessage } from '@/shared/lib/utils'
import { apiGet, apiPatch, apiPost } from '@/shared/lib/apiClient'

interface Settings { enabled: boolean; frontend_url: string; backend_health_url: string; health_timeout_seconds: number }
interface Release { version: string; commit: string; frontend: string; backend: string }
interface ContainerState { reference: string; version: string | null; running: boolean; healthy: boolean }
interface Observed { frontend?: ContainerState; backend?: ContainerState; worker?: ContainerState; maintenance?: boolean }
interface DeploymentJob {
  id: string
  release: Release
  status: 'queued' | 'running' | 'recovery_required' | 'completed' | 'failed'
  events: { stage: string; status: string; message: string; at: string }[]
  before_state: Observed
  after_state: Observed
  backup: string | null
  resolution_requested: boolean
  initiated_by: number | null
  created_at: string
}
interface DeploymentState { settings: Settings; online: boolean; observed: Observed; catalog_error: string | null; host_error: string | null; releases: Release[]; jobs: DeploymentJob[] }
const STATUS_LABELS = { queued: 'В очереди', running: 'Обновление выполняется', recovery_required: 'Требуется восстановление', completed: 'Завершено', failed: 'Не выполнено' }
const ACTIVE_STATUSES = ['queued', 'running', 'recovery_required']
const SERVICES = [['frontend', 'Фронтенд'], ['backend', 'API'], ['worker', 'Уведомления']] as const

export function DeploymentTab() {
  const [data, setData] = useState<DeploymentState | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [version, setVersion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [databaseChecked, setDatabaseChecked] = useState(false)
  const [confirmVersion, setConfirmVersion] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    try {
      const state = await apiGet<DeploymentState>('/admin/deployment')
      setData(state)
      setSettings(current => current ?? state.settings)
      setError(null)
    } catch (err) { setError(getErrorMessage(err)) }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => window.clearInterval(timer)
  }, [refresh])
  const active = data?.jobs.find(job => ACTIVE_STATUSES.includes(job.status))
  const latest = active ?? data?.jobs[0]
  const canStart = !!data?.settings.enabled && data.online && !data.catalog_error && !data.host_error && !active && data.releases.some(release => release.version === version) && !busy
  const perform = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); await refresh() } catch (err) { setError(getErrorMessage(err)) } finally { setBusy(false) }
  }
  if (!data || !settings) return <div className="p-6" role="status">{error || 'Загрузка состояния обновлений…'}</div>
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Обновление системы</h2><p className="mt-1 text-sm text-muted-foreground">Фронтенд, API и уведомления на двух серверах</p></div>
        <Button variant="outline" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />Проверить состояние</Button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">{active ? 'Связь с API временно недоступна. Задание продолжает выполняться; состояние обновится после восстановления связи. ' : ''}{error}</div>}
      {(!data.online || data.catalog_error || data.host_error) && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        {!data.online && <p>Сервис деплоя не подключён. Для запуска нужна первоначальная настройка на серверах.</p>}
        {data.catalog_error && <p>{data.catalog_error}</p>}{data.host_error && <p>{data.host_error}</p>}
      </div>}
      <div className="grid gap-4 md:grid-cols-3">{SERVICES.map(([key, title]) => {
        const container = data.observed[key]
        return <Card key={key}><CardContent className="space-y-2 p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Server className="h-4 w-4" />{title}</div>
          <p className="text-xl font-semibold">{container?.version || 'Версия не определена'}</p>
          <p className="text-sm">{!data.online ? 'Данные могут быть устаревшими' : container?.running ? 'Контейнер запущен' : 'Контейнер не запущен'}</p>
          {container?.reference && <p className="break-all text-xs text-muted-foreground">{container.reference}</p>}
        </CardContent></Card>
      })}</div>
      <Card><CardHeader><CardTitle>Опубликованный релиз</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-2"><span className="text-sm font-medium">Версия для обоих серверов</span>
            <SelectDropdown aria-label="Версия для обоих серверов" floating value={version} onChange={value => { setVersion(value); setConfirmVersion(null) }} disabled={!!active || busy} placeholder="Выберите релиз" options={data.releases.map(release => ({ value: release.version, label: `${release.version} · ${release.commit}` }))} />
          </div><Button disabled={!canStart} onClick={() => setConfirmVersion(version)}><Rocket className="h-4 w-4" />Обновить прод</Button>
        </div>
        {!data.releases.length && <p className="text-sm text-muted-foreground">Опубликованных релизов пока нет.</p>}
        {confirmVersion && <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4" role="alert">
          <p className="text-sm">Обновить оба сервера до версии {confirmVersion}? На время резервного копирования, миграций и запуска контейнеров сайт перейдёт в режим обслуживания.</p>
          <div className="flex flex-wrap gap-2"><Button disabled={!canStart} onClick={() => void perform(async () => { await apiPost('/admin/deployment/jobs', { version: confirmVersion }); setConfirmVersion(null) })}>Подтвердить обновление</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmVersion(null)}>Отмена</Button></div>
        </div>}
      </CardContent></Card>
      {latest && <Card><CardHeader><CardTitle>{STATUS_LABELS[latest.status]} · {latest.release.version}</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="break-all text-xs text-muted-foreground">{formatDateTime(latest.created_at)} · Инициатор №{latest.initiated_by ?? '—'} · Задание {latest.id}</p>
        <ol className="space-y-2" aria-live="polite">{latest.events.filter((event, index, events) => !events.slice(index + 1).some(item => item.stage === event.stage)).map(event => <li key={event.stage} className="flex items-start gap-2 text-sm">
          {event.status === 'completed' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : event.status === 'failed' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}<span>{event.message}</span>
        </li>)}{!latest.events.length && <li className="text-sm">Ожидание сервиса деплоя…</li>}</ol>
        {latest.backup && <p className="text-sm text-muted-foreground">Резервная копия: {latest.backup}</p>}
        {active?.status === 'recovery_required' && <div className="space-y-3 rounded-xl border border-destructive/30 p-4">
          <p className="text-sm">Проверьте журналы контейнеров и состояние БД на серверах. При необходимости восстановите совместимую версию вручную. Эта кнопка проверяет готовность серверов и снимает режим обслуживания; она не откатывает БД или образы.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={databaseChecked} onChange={event => setDatabaseChecked(event.target.checked)} disabled={busy || active.resolution_requested} className="mt-1" />Я проверил схему и данные БД, приложение совместимо с ней</label>
          <Button variant="outline" disabled={!databaseChecked || busy || active.resolution_requested || !data.online} onClick={() => void perform(async () => { await apiPost(`/admin/deployment/jobs/${active.id}/recover`, { database_checked: true }); setDatabaseChecked(false) })}>{active.resolution_requested ? 'Проверка восстановления запрошена…' : 'Проверить восстановление'}</Button>
        </div>}
      </CardContent></Card>}
      <Card><CardHeader><CardTitle>История обновлений</CardTitle></CardHeader><CardContent className="space-y-3">
        {!data.jobs.length && <p className="text-sm text-muted-foreground">Обновления ещё не запускались.</p>}
        {data.jobs.map(job => <details key={job.id} className="rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer">{job.release.version} · {STATUS_LABELS[job.status]} · {formatDateTime(job.created_at)}</summary>
          <div className="mt-3 space-y-2"><p className="break-all text-xs text-muted-foreground">Задание {job.id} · Инициатор №{job.initiated_by ?? '—'}</p>
            {job.events.map((event, index) => <p key={index}>{formatDateTime(event.at)} · {event.message} · {event.status === 'completed' ? 'Готово' : event.status === 'failed' ? 'Ошибка' : 'Выполняется'}</p>)}
            {job.backup && <p>Резервная копия: {job.backup}</p>}
            {(['before_state', 'after_state'] as const).map(key => <div key={key}><p className="font-medium">{key === 'before_state' ? 'До обновления' : 'После обновления'}</p>{SERVICES.map(([service, title]) => <p key={service} className="break-all text-xs text-muted-foreground">{title}: {job[key][service]?.reference || 'Нет данных'}</p>)}</div>)}
          </div>
        </details>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Настройки обновления</CardTitle></CardHeader><CardContent>
        <form onSubmit={event => { event.preventDefault(); void perform(() => apiPatch('/admin/deployment/settings', settings)) }} className="space-y-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} disabled={!!active || busy} onChange={event => setSettings({ ...settings, enabled: event.target.checked })} />Разрешить обновление прода</label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">Адрес сайта<Input type="url" placeholder="https://cabinet.example.ru" value={settings.frontend_url} disabled={!!active || busy} onChange={event => setSettings({ ...settings, frontend_url: event.target.value })} /></label>
            <label className="space-y-2 text-sm">Адрес проверки API<Input type="url" placeholder="http://backend:5000/api/health" value={settings.backend_health_url} disabled={!!active || busy} onChange={event => setSettings({ ...settings, backend_health_url: event.target.value })} /></label>
            <label className="space-y-2 text-sm">Ожидание готовности, секунд<Input type="number" min={30} max={600} value={settings.health_timeout_seconds} disabled={!!active || busy} onChange={event => setSettings({ ...settings, health_timeout_seconds: Number(event.target.value) })} /></label>
          </div><Button type="submit" variant="outline" disabled={!!active || busy}>Сохранить настройки</Button>
        </form>
      </CardContent></Card>
    </div>
  )
}
