import { useState, useEffect, useCallback } from 'react'
import { TelemetryActions } from '@/shared/components/TelemetryActions'
import type { TelemetryAction } from '@/shared/lib/telemetry'
import { useLocation } from 'react-router-dom'
import { ChevronDown, ChevronUp, Trash2, Loader2, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { formatDateTime } from '@/shared/lib/utils'
import { cn } from '@/shared/lib/utils'

interface BugReport {
  id: number
  user_id: number
  title: string
  description: string | null
  screenshot_s3_key: string | null
  image_s3_keys?: string[]
  page_url: string | null
  browser_info: string | null
  actions: TelemetryAction[] | null
  status: string
  priority: string
  admin_comment: string | null
  reviewed_at: string | null
  reviewed_by: number | null
  created_at: string
  reporter_name: string
  reviewer_name: string | null
  user_reply: string | null
  user_reply_at: string | null
  replier_name: string | null
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: 'Новый', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  in_progress: { label: 'В работе', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  resolved: { label: 'Решён', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected: { label: 'Отклонён', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
}

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  low: { label: 'Низкий', className: 'bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400' },
  medium: { label: 'Средний', className: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400' },
  high: { label: 'Высокий', className: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
  critical: { label: 'Критичный', className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
}

export function AdminBugReports() {
  const location = useLocation()
  const [reports, setReports] = useState<BugReport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editComment, setEditComment] = useState('')
  const [editReply, setEditReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [saving, setSaving] = useState(false)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))
      const res = await fetch(`${API_BASE_URL}/bug-reports?${params}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setReports(data.data)
      setTotal(data.total)
    } catch {
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, priorityFilter, search, page, limit])

  useEffect(() => { fetchReports() }, [fetchReports])

  const loadScreenshot = async (id: number) => {
    setScreenshotUrl(null)
    setImageUrls([])
    try {
      const res = await fetch(`${API_BASE_URL}/bug-reports/${id}/screenshot`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setScreenshotUrl(data.url)
        setImageUrls(data.images ?? [])
      }
    } catch {}
  }

  const handleExpand = (report: BugReport) => {
    if (expandedId === report.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(report.id)
    setEditStatus(report.status)
    setEditPriority(report.priority)
    setEditComment(report.admin_comment || '')
    setEditReply('')
    setScreenshotUrl(null)
    setImageUrls([])
    if (report.screenshot_s3_key || report.image_s3_keys?.length) loadScreenshot(report.id)
  }

  useEffect(() => {
    const reportId = new URLSearchParams(location.search).get('reportId')
    if (!reportId || reports.length === 0) return
    const report = reports.find((r) => r.id === Number(reportId))
    if (report && expandedId !== report.id) handleExpand(report)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, location.search])

  const handleSave = async (id: number) => {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/bug-reports/${id}`, {
        method: 'PATCH',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ status: editStatus, priority: editPriority, admin_comment: editComment }),
      })
      if (!res.ok) throw new Error()
      await fetchReports()
      setExpandedId(null)
    } catch {
    } finally {
      setSaving(false)
    }
  }

  const handleSendReply = async (id: number) => {
    const reply = editReply.trim()
    if (!reply) return
    setSendingReply(true)
    try {
      const res = await fetch(`${API_BASE_URL}/bug-reports/${id}`, {
        method: 'PATCH',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ user_reply: reply }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Не удалось отправить ответ')
      }
      setEditReply('')
      await fetchReports()
      toast.success('Ответ отправлен — пользователь увидит его в уведомлениях')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось отправить ответ')
    } finally {
      setSendingReply(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить баг-репорт?')) return
    try {
      await fetch(`${API_BASE_URL}/bug-reports/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      await fetchReports()
    } catch {}
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Поиск..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg border border-input bg-background text-sm"
        >
          <option value="">Все статусы</option>
          <option value="new">Новые</option>
          <option value="in_progress">В работе</option>
          <option value="resolved">Решённые</option>
          <option value="rejected">Отклонённые</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg border border-input bg-background text-sm"
        >
          <option value="">Любой приоритет</option>
          <option value="low">Низкий</option>
          <option value="medium">Средний</option>
          <option value="high">Высокий</option>
          <option value="critical">Критичный</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Нет баг-репортов</div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const isExpanded = expandedId === report.id
            const sc = STATUS_CONFIG[report.status] || STATUS_CONFIG.new
            const pc = PRIORITY_CONFIG[report.priority] || PRIORITY_CONFIG.medium
            return (
              <div key={report.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => handleExpand(report)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{report.title}</span>
                      <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', sc.className)}>{sc.label}</span>
                      <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', pc.className)}>{pc.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {report.reporter_name} · {formatDateTime(report.created_at)}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {report.description && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Описание</div>
                        <div className="text-sm bg-muted/30 rounded-lg p-3">{report.description}</div>
                      </div>
                    )}

                    {screenshotUrl && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Скриншот</div>
                        <img src={screenshotUrl} alt="Скриншот" className="max-w-full rounded-lg border border-border" />
                      </div>
                    )}

                    {imageUrls.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Изображения ({imageUrls.length})</div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {imageUrls.map((url, i) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border hover:opacity-90">
                              <img src={url} alt={`Изображение ${i + 1}`} className="h-40 w-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {report.actions && report.actions.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Действия перед отправкой ({report.actions.length})</div>
                        <TelemetryActions actions={report.actions} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {report.page_url && (
                        <div>
                          <span className="text-muted-foreground">URL:</span>{' '}
                          <span className="font-mono break-all">{report.page_url}</span>
                        </div>
                      )}
                      {report.browser_info && (
                        <div>
                          <span className="text-muted-foreground">Браузер:</span>{' '}
                          <span className="font-mono break-all">{report.browser_info}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Статус</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                        >
                          <option value="new">Новый</option>
                          <option value="in_progress">В работе</option>
                          <option value="resolved">Решён</option>
                          <option value="rejected">Отклонён</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Приоритет</label>
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                        >
                          <option value="low">Низкий</option>
                          <option value="medium">Средний</option>
                          <option value="high">Высокий</option>
                          <option value="critical">Критичный</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Комментарий администратора · виден только администраторам</label>
                      <textarea
                        value={editComment}
                        onChange={(e) => setEditComment(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                      />
                    </div>

                    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <label className="block text-xs font-medium text-foreground">Ответ пользователю · придёт ему в уведомления</label>
                      {report.user_reply && (
                        <div className="rounded-lg border border-border bg-background px-3 py-2">
                          <p className="whitespace-pre-wrap break-words text-sm">{report.user_reply}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Отправлено {report.user_reply_at ? formatDateTime(report.user_reply_at) : ''}
                            {report.replier_name && ` · ${report.replier_name}`}
                          </p>
                        </div>
                      )}
                      <textarea
                        value={editReply}
                        onChange={(e) => setEditReply(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        placeholder={report.user_reply ? 'Новый ответ заменит предыдущий и тоже придёт в уведомления' : 'Например: исправили, обновите страницу'}
                        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                      />
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => handleSendReply(report.id)} disabled={sendingReply || !editReply.trim()}>
                          {sendingReply ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                          Отправить ответ
                        </Button>
                      </div>
                    </div>

                    {report.reviewed_at && (
                      <div className="text-xs text-muted-foreground">
                        Проверен: {formatDateTime(report.reviewed_at)}
                        {report.reviewer_name && ` · ${report.reviewer_name}`}
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(report.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Удалить
                      </Button>
                      <Button size="sm" onClick={() => handleSave(report.id)} disabled={saving}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                        Сохранить
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Назад</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Вперёд</Button>
        </div>
      )}
    </div>
  )
}
