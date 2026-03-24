import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE_URL } from '@/lib/api'
import { getAuthHeaders } from '@/lib/authHeaders'
import { getErrorMessage, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Badge } from '@/components/ui/Badge'
import {
  Plus, Trash2, Edit2, CheckCircle2, Circle, FileText, Loader2,
  Users, BookOpen, Building2, X, Download,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingRecord {
  id: number
  userId: number
  firstName: string
  lastName: string
  position: string
  department: string | null
  startedAt: string
  completedAt: string | null
  totalDocs: number
  acknowledgedDocs: number
}

interface OnboardingDetail extends OnboardingRecord {
  email: string
  documents: {
    id: number
    title: string
    contentText: string | null
    fileUrl: string | null
    acknowledgedAt: string | null
  }[]
}

interface OnboardingTemplate {
  id: number
  title: string
  contentText: string | null
  fileKey: string | null
  departmentId: number | null
  departmentName: string | null
  position: string | null
  createdAt: string
}

interface Department {
  id: number
  name: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HROnboarding() {
  const { id: urlId } = useParams<{ id?: string }>()
  const [tab, setTab] = useState<'employees' | 'templates'>('employees')

  const [records, setRecords] = useState<OnboardingRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [detail, setDetail] = useState<OnboardingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<OnboardingRecord | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editTemplate, setEditTemplate] = useState<OnboardingTemplate | null>(null)
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<OnboardingTemplate | null>(null)

  const [departments, setDepartments] = useState<Department[]>([])
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    fetchRecords()
    fetchDepartments()
  }, [])

  useEffect(() => {
    if (urlId) openDetail(parseInt(urlId))
  }, [urlId])

  const fetchRecords = async () => {
    setRecordsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding`, { headers: getAuthHeaders() })
      const data = await res.json()
      setRecords(data.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        position: r.position,
        department: r.department,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        totalDocs: parseInt(r.total_docs),
        acknowledgedDocs: parseInt(r.acknowledged_docs),
      })))
    } catch {
      setRecords([])
    } finally {
      setRecordsLoading(false)
    }
  }

  const fetchTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/templates`, { headers: getAuthHeaders() })
      const data = await res.json()
      setTemplates(data.map((t: any) => ({
        id: t.id,
        title: t.title,
        contentText: t.content_text,
        fileKey: t.file_key,
        departmentId: t.department_id,
        departmentName: t.department_name,
        position: t.position,
        createdAt: t.created_at,
      })))
    } catch {
      setTemplates([])
    } finally {
      setTemplatesLoading(false)
    }
  }

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      const data = await res.json()
      setDepartments(data)
    } catch {
      setDepartments([])
    }
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/${id}`, { headers: getAuthHeaders() })
      const data = await res.json()
      setDetail({
        id: data.id,
        userId: data.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        position: data.position,
        department: data.department,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        totalDocs: data.documents.length,
        acknowledgedDocs: data.documents.filter((d: any) => d.acknowledgedAt).length,
        documents: data.documents,
      })
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCancelOnboarding = async () => {
    if (!cancelTarget) return
    setCancelLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/${cancelTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDetail(null)
      setCancelTarget(null)
      await fetchRecords()
    } catch (err: unknown) {
      setActionError(getErrorMessage(err))
    } finally {
      setCancelLoading(false)
    }
  }

  const handleTabChange = (newTab: 'employees' | 'templates') => {
    setTab(newTab)
    if (newTab === 'templates' && templates.length === 0) {
      fetchTemplates()
    }
  }

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateTarget) return
    setActionError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/templates/${deleteTemplateTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDeleteTemplateTarget(null)
      await fetchTemplates()
    } catch (err: unknown) {
      setActionError(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Онбординг</h1>
          <p className="text-muted-foreground">Управление онбордингом сотрудников</p>
        </div>
        {tab === 'employees' && (
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить сотрудника
          </Button>
        )}
        {tab === 'templates' && (
          <Button onClick={() => { setEditTemplate(null); setShowTemplateModal(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Создать шаблон
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border/50">
        {([['employees', 'Сотрудники', Users], ['templates', 'Шаблоны', BookOpen]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'employees' && (
        <div>
          {recordsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Нет записей об онбординге</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Сотрудник</th>
                    <th className="text-left py-3 px-4 font-medium">Должность</th>
                    <th className="text-left py-3 px-4 font-medium">Отдел</th>
                    <th className="text-left py-3 px-4 font-medium">Начало</th>
                    <th className="text-left py-3 px-4 font-medium">Прогресс</th>
                    <th className="text-left py-3 px-4 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => openDetail(r.id)}
                      className="border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-medium">{r.lastName} {r.firstName}</td>
                      <td className="py-3 px-4 text-muted-foreground">{r.position}</td>
                      <td className="py-3 px-4 text-muted-foreground">{r.department || '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground">{formatDate(r.startedAt)}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium">{r.acknowledgedDocs}/{r.totalDocs}</span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={r.completedAt ? 'success' : 'secondary'}>
                          {r.completedAt ? 'Завершён' : 'В процессе'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div>
          {templatesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Нет шаблонов документов</div>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <Card key={t.id} className="border border-border/50">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {t.contentText && <Badge variant="secondary" className="text-xs">Текст</Badge>}
                        {t.fileKey && <Badge variant="secondary" className="text-xs"><FileText className="h-3 w-3 mr-1" />Файл</Badge>}
                        {t.departmentName && <Badge variant="outline" className="text-xs"><Building2 className="h-3 w-3 mr-1" />{t.departmentName}</Badge>}
                        {t.position && <Badge variant="outline" className="text-xs">{t.position}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setEditTemplate(t); setShowTemplateModal(true) }}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteTemplateTarget(t)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {(detail !== null || detailLoading) && (
        <OnboardingDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setDetail(null)}
          onCancel={(record) => setCancelTarget(record)}
        />
      )}

      {cancelTarget && (
        <ConfirmModal
          title="Отменить онбординг"
          message={`Отменить онбординг для ${cancelTarget.lastName} ${cancelTarget.firstName}? Роль сотрудника будет изменена на «Сотрудник».`}
          confirmLabel="Отменить онбординг"
          confirmVariant="destructive"
          loading={cancelLoading}
          error={actionError}
          onConfirm={handleCancelOnboarding}
          onClose={() => { setCancelTarget(null); setActionError(null) }}
        />
      )}

      {showAddModal && (
        <AddOnboardingModal
          departments={departments}
          templates={templates}
          onTemplatesNeeded={fetchTemplates}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); fetchRecords() }}
        />
      )}

      {showTemplateModal && (
        <TemplateModal
          template={editTemplate}
          departments={departments}
          onClose={() => { setShowTemplateModal(false); setEditTemplate(null) }}
          onSuccess={() => { setShowTemplateModal(false); setEditTemplate(null); fetchTemplates() }}
        />
      )}

      {deleteTemplateTarget && (
        <ConfirmModal
          title="Удалить шаблон"
          message={`Удалить шаблон «${deleteTemplateTarget.title}»?`}
          confirmLabel="Удалить"
          confirmVariant="destructive"
          error={actionError}
          onConfirm={handleDeleteTemplate}
          onClose={() => { setDeleteTemplateTarget(null); setActionError(null) }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OnboardingDetailModal({ detail, loading, onClose, onCancel }: {
  detail: OnboardingDetail | null
  loading: boolean
  onClose: () => void
  onCancel: (r: OnboardingDetail) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h3 className="text-lg font-semibold">
            {detail ? `${detail.lastName} ${detail.firstName}` : 'Загрузка...'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
          {detail && !loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Должность: </span>{detail.position}</div>
                <div><span className="text-muted-foreground">Отдел: </span>{detail.department || '—'}</div>
                <div><span className="text-muted-foreground">Email: </span>{detail.email}</div>
                <div><span className="text-muted-foreground">Начало: </span>{formatDate(detail.startedAt)}</div>
                <div><span className="text-muted-foreground">Прогресс: </span>{detail.acknowledgedDocs}/{detail.totalDocs}</div>
                <div><span className="text-muted-foreground">Статус: </span>
                  <Badge variant={detail.completedAt ? 'success' : 'secondary'}>
                    {detail.completedAt ? 'Завершён' : 'В процессе'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Документы</h4>
                {detail.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                    {doc.acknowledgedAt
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      {doc.acknowledgedAt && (
                        <p className="text-xs text-muted-foreground">Ознакомлен {formatDate(doc.acknowledgedAt)}</p>
                      )}
                    </div>
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {detail && !detail.completedAt && (
          <div className="p-6 border-t border-border/50 flex justify-end">
            <Button variant="destructive" size="sm" onClick={() => onCancel(detail)}>
              Отменить онбординг
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function AddOnboardingModal({ departments, templates, onTemplatesNeeded, onClose, onSuccess }: {
  departments: Department[]
  templates: OnboardingTemplate[]
  onTemplatesNeeded: () => void
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', password: '',
    department_id: '', position: '',
  })
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (templates.length === 0) onTemplatesNeeded()
  }, [])

  useEffect(() => {
    const deptId = form.department_id ? parseInt(form.department_id) : null
    const pos = form.position.toLowerCase().trim()
    const matched = templates
      .filter(t => {
        const deptMatch = !t.departmentId || t.departmentId === deptId
        const posMatch = !t.position || (pos && t.position.toLowerCase().includes(pos))
        return deptMatch && posMatch
      })
      .map(t => t.id)
    setSelectedTemplateIds(matched)
  }, [form.department_id, form.position, templates])

  const toggleTemplate = (id: number) => {
    setSelectedTemplateIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          department_id: form.department_id || null,
          template_ids: selectedTemplateIds,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onSuccess()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h3 className="text-lg font-semibold">Добавить сотрудника на онбординг</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Фамилия</Label>
              <Input value={form.last_name} onChange={e => setForm(prev => ({ ...prev, last_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Имя</Label>
              <Input value={form.first_name} onChange={e => setForm(prev => ({ ...prev, first_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Пароль</Label>
              <Input type="password" value={form.password} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Должность</Label>
              <Input value={form.position} onChange={e => setForm(prev => ({ ...prev, position: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Отдел</Label>
              <select
                value={form.department_id}
                onChange={e => setForm(prev => ({ ...prev, department_id: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Не выбран</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Документы для ознакомления</Label>
            <p className="text-xs text-muted-foreground">Подходящие шаблоны выбраны автоматически. Вы можете добавить или убрать.</p>
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground">Нет доступных шаблонов. Сначала создайте шаблоны на вкладке «Шаблоны».</p>
            )}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {templates.map(t => (
                <label key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={selectedTemplateIds.includes(t.id)}
                    onChange={() => toggleTemplate(t.id)}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    <div className="flex gap-2 mt-0.5">
                      {t.departmentName && <span className="text-xs text-muted-foreground">{t.departmentName}</span>}
                      {t.position && <span className="text-xs text-muted-foreground">{t.position}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="p-6 border-t border-border/50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Добавить
          </Button>
        </div>
      </div>
    </div>
  )
}

function TemplateModal({ template, departments, onClose, onSuccess }: {
  template: OnboardingTemplate | null
  departments: Department[]
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = !!template
  const [title, setTitle] = useState(template?.title || '')
  const [contentText, setContentText] = useState(template?.contentText || '')
  const [departmentId, setDepartmentId] = useState(template?.departmentId?.toString() || '')
  const [position, setPosition] = useState(template?.position || '')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    if (!contentText.trim() && !file && !template?.fileKey) {
      setError('Необходимо указать текст или загрузить файл')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('title', title)
      if (contentText) formData.append('content_text', contentText)
      if (departmentId) formData.append('department_id', departmentId)
      if (position) formData.append('position', position)
      if (file) formData.append('file', file)

      const url = isEdit
        ? `${API_BASE_URL}/onboarding/templates/${template!.id}`
        : `${API_BASE_URL}/onboarding/templates`
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onSuccess()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h3 className="text-lg font-semibold">{isEdit ? 'Редактировать шаблон' : 'Создать шаблон'}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="space-y-1">
            <Label>Название *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Текст документа</Label>
            <textarea
              value={contentText}
              onChange={e => setContentText(e.target.value)}
              rows={6}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Введите текст документа..."
            />
          </div>
          <div className="space-y-1">
            <Label>Файл (PDF, DOCX, до 20 МБ)</Label>
            {template?.fileKey && !file && (
              <p className="text-xs text-muted-foreground">Текущий файл сохранён. Загрузите новый, чтобы заменить.</p>
            )}
            <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Отдел (опционально)</Label>
              <select
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Все отделы</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Должность (опционально)</Label>
              <Input value={position} onChange={e => setPosition(e.target.value)} placeholder="Например: Разработчик" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="p-6 border-t border-border/50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, message, confirmLabel, confirmVariant = 'default', loading, error, onConfirm, onClose }: {
  title: string
  message: string
  confirmLabel: string
  confirmVariant?: 'default' | 'destructive'
  loading?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground">{message}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>Отмена</Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
