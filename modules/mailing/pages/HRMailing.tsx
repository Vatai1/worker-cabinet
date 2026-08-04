import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Send, Upload, X, Users, Building2, Briefcase, Mail, Globe, Loader2, Check, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { ConfirmModal } from '@/shared/components/ConfirmModal'
import { apiGet, apiPost } from '@/shared/lib/apiClient'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { getErrorMessage, formatDateTime, cn } from '@/shared/lib/utils'

interface UploadedImage {
  file_key: string
  mime_type: string
  size: number
  preview?: string
}

interface Employee {
  id: number
  first_name: string
  last_name: string
  email: string
  position: string
  department_id: number
}

interface Department {
  id: number
  name: string
}

interface Position {
  id: number
  name: string
}

interface Recipient {
  status: string
  error: string | null
  first_name: string
  last_name: string
  email: string
  position: string
}

interface Campaign {
  id: number
  title: string
  channel: string
  recipient_count: number
  created_at: string
  first_name: string
  last_name: string
  recipients: Recipient[]
  sentCount: number
  failedCount: number
}

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'site', label: 'На сайте', icon: Globe },
  { value: 'both', label: 'Email и сайт', icon: Send },
] as const

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  site: 'На сайте',
  both: 'Email и сайт',
}

function RecipientCategory<T>({
  icon,
  title,
  search,
  onSearchChange,
  items,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
}: {
  icon: ReactNode
  title: string
  search: string
  onSearchChange: (value: string) => void
  items: { id: T; label: string }[]
  selected: Set<T>
  onToggle: (id: T) => void
  onToggleAll: () => void
  allSelected: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-[11px] font-semibold text-primary hover:underline shrink-0"
        >
          {allSelected ? 'Сбросить' : 'Выбрать все'}
        </button>
      </div>
      <Input
        placeholder="Поиск..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />
      <div className="max-h-44 overflow-y-auto space-y-0.5 border rounded-lg p-1.5">
        {items.map(item => (
          <label key={String(item.id)} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/60 cursor-pointer text-xs transition-colors">
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => onToggle(item.id)}
              className="sr-only"
            />
            <span className={cn(
              'flex h-[18px] w-[18px] items-center justify-center rounded-md border transition-all duration-150 shrink-0',
              selected.has(item.id)
                ? 'bg-primary border-primary shadow-sm shadow-primary/30'
                : 'border-input bg-background group-hover:border-primary/60',
            )}>
              <Check className={cn(
                'h-3 w-3 text-primary-foreground transition-all duration-150',
                selected.has(item.id) ? 'opacity-100 scale-100' : 'opacity-0 scale-50',
              )} />
            </span>
            <span className="truncate">{item.label}</span>
          </label>
        ))}
        {items.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Ничего не найдено</p>
        )}
      </div>
    </div>
  )
}

export function HRMailing() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<UploadedImage[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set())
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set())
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<number>>(new Set())
  const [channel, setChannel] = useState<'email' | 'site' | 'both'>('site')

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])

  const [employeeSearch, setEmployeeSearch] = useState('')
  const [positionSearch, setPositionSearch] = useState('')
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmData, setConfirmData] = useState<{ open: boolean }>({ open: false })

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [empRes, deptRes, posRes, campRes] = await Promise.all([
          apiGet<Employee[]>('/users?limit=500'),
          apiGet<Department[]>('/departments'),
          apiGet<Position[]>('/dictionaries/positions'),
          apiGet<Campaign[]>('/mailings'),
        ])
        setEmployees(empRes)
        setDepartments(deptRes)
        setPositions(posRes)
        setCampaigns(campRes)
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      } finally {
        setCampaignsLoading(false)
      }
    }
    loadData()
  }, [])

  const filteredEmployees = employees.filter(e =>
    `${e.first_name} ${e.last_name} ${e.email}`.toLowerCase().includes(employeeSearch.toLowerCase())
  )
  const filteredPositions = positions.filter(p => p.name.toLowerCase().includes(positionSearch.toLowerCase()))
  const filteredDepartments = departments.filter(d => d.name.toLowerCase().includes(departmentSearch.toLowerCase()))

  const toggleUser = (id: number) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePosition = (name: string) => {
    setSelectedPositions(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleDept = (id: number) => {
    setSelectedDeptIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allUsersSelected = employees.length > 0 && employees.every(e => selectedUserIds.has(e.id))
  const allPositionsSelected = positions.length > 0 && positions.every(p => selectedPositions.has(p.name))
  const allDeptsSelected = departments.length > 0 && departments.every(d => selectedDeptIds.has(d.id))

  const toggleAllUsers = () => {
    setSelectedUserIds(allUsersSelected ? new Set() : new Set(employees.map(e => e.id)))
  }
  const toggleAllPositions = () => {
    setSelectedPositions(allPositionsSelected ? new Set() : new Set(positions.map(p => p.name)))
  }
  const toggleAllDepts = () => {
    setSelectedDeptIds(allDeptsSelected ? new Set() : new Set(departments.map(d => d.id)))
  }

  const hasRecipients = selectedUserIds.size > 0 || selectedPositions.size > 0 || selectedDeptIds.size > 0

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const remaining = 5 - images.length
    const toUpload = Array.from(files).slice(0, remaining)
    for (const file of toUpload) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await fetch(`${API_BASE_URL}/mailings/upload`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        })
        if (!res.ok) throw new Error('Ошибка загрузки')
        const data = await res.json()
        setImages(prev => [...prev, { ...data, preview: URL.createObjectURL(file) }])
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (index: number) => {
    setImages(prev => {
      const removed = prev[index]
      if (removed.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      await apiPost('/mailings', {
        title,
        message,
        images: images.map(({ file_key, mime_type, size }) => ({ file_key, mime_type, size })),
        channel,
        recipients: {
          userIds: Array.from(selectedUserIds),
          positions: Array.from(selectedPositions),
          departmentIds: Array.from(selectedDeptIds),
        },
      })
      setTitle('')
      setMessage('')
      setImages(prev => {
        prev.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview) })
        return []
      })
      setSelectedUserIds(new Set())
      setSelectedPositions(new Set())
      setSelectedDeptIds(new Set())
      const campRes = await apiGet<Campaign[]>('/mailings')
      setCampaigns(campRes)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const handleLoadDetail = async (id: number) => {
    try {
      const detail = await apiGet<Campaign>(`/mailings/${id}`)
      setDetailCampaign(detail)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  useEffect(() => {
    const campaignId = detailCampaign?.id
    if (!campaignId) return
    const interval = setInterval(async () => {
      try {
        const detail = await apiGet<Campaign>(`/mailings/${campaignId}`)
        setDetailCampaign(prev => (prev?.id === campaignId ? detail : prev))
      } catch { /* пусто */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [detailCampaign?.id])

  const recipientSummary = [
    selectedUserIds.size > 0 && `${selectedUserIds.size} сотрудн.`,
    selectedPositions.size > 0 && `${selectedPositions.size} должн.`,
    selectedDeptIds.size > 0 && `${selectedDeptIds.size} отдел.`,
  ].filter(Boolean).join(', ')

  const detailSent = detailCampaign?.recipients.filter(r => r.status === 'sent').length ?? 0
  const detailFailed = detailCampaign?.recipients.filter(r => r.status === 'failed').length ?? 0
  const detailPending = detailCampaign ? detailCampaign.recipients.length - detailSent - detailFailed : 0

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-destructive text-sm">{error}</p>
      )}

      <Card>
        <CardContent className="p-6 space-y-5">
          <Input
            placeholder="Заголовок рассылки"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <textarea
            className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Текст сообщения..."
            value={message}
            onChange={e => setMessage(e.target.value)}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Изображения</p>
              <span className="text-xs text-muted-foreground">{images.length}/5</span>
            </div>
            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {images.map((img, i) => (
                  <div key={img.file_key} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                    <img src={img.preview || ''} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {images.length < 5 && (
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Загрузить
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RecipientCategory<number>
              icon={<Users className="h-4 w-4" />}
              title="Сотрудники"
              search={employeeSearch}
              onSearchChange={setEmployeeSearch}
              items={filteredEmployees.slice(0, 50).map(e => ({ id: e.id, label: `${e.last_name} ${e.first_name}` }))}
              selected={selectedUserIds}
              onToggle={toggleUser}
              onToggleAll={toggleAllUsers}
              allSelected={allUsersSelected}
            />
            <RecipientCategory<string>
              icon={<Briefcase className="h-4 w-4" />}
              title="Должности"
              search={positionSearch}
              onSearchChange={setPositionSearch}
              items={filteredPositions.map(p => ({ id: p.name, label: p.name }))}
              selected={selectedPositions}
              onToggle={togglePosition}
              onToggleAll={toggleAllPositions}
              allSelected={allPositionsSelected}
            />
            <RecipientCategory<number>
              icon={<Building2 className="h-4 w-4" />}
              title="Отделы"
              search={departmentSearch}
              onSearchChange={setDepartmentSearch}
              items={filteredDepartments.map(d => ({ id: d.id, label: d.name }))}
              selected={selectedDeptIds}
              onToggle={toggleDept}
              onToggleAll={toggleAllDepts}
              allSelected={allDeptsSelected}
            />
          </div>

          {hasRecipients && (
            <p className="text-xs text-muted-foreground">Выбрано: {recipientSummary}</p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Канал доставки</p>
            <div className="flex gap-2">
              {CHANNEL_OPTIONS.map(opt => {
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    onClick={() => setChannel(opt.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all border',
                      channel === opt.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'text-muted-foreground hover:bg-muted/60 border-border/40',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              disabled={!title.trim() || !message.trim() || !hasRecipients || sending}
              onClick={() => setConfirmData({ open: true })}
            >
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Отправить
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmModal
        isOpen={confirmData.open}
        onClose={() => setConfirmData({ open: false })}
        onConfirm={() => { setConfirmData({ open: false }); handleSend() }}
        title="Подтверждение рассылки"
        message={`Отправить «${title}» через ${CHANNEL_LABELS[channel]}? Получателей: ${recipientSummary}`}
        confirmText="Отправить"
      />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">История рассылок</h2>
        {campaignsLoading ? (
          <p className="text-muted-foreground text-sm">Загрузка...</p>
        ) : campaigns.length === 0 ? (
          <p className="text-muted-foreground text-sm">Нет рассылок</p>
        ) : (
          <div className="grid gap-3">
            {campaigns.map(c => (
              <Card
                key={c.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => handleLoadDetail(c.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{c.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{formatDateTime(c.created_at)}</span>
                        <span>{CHANNEL_LABELS[c.channel] || c.channel}</span>
                        <span>{c.recipient_count} получ.</span>
                        {c.sentCount !== undefined && (
                          <>
                            <span className="text-green-500">{c.sentCount} отправ.</span>
                            {c.failedCount > 0 && <span className="text-destructive">{c.failedCount} ошиб.</span>}
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.first_name} {c.last_name}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {detailCampaign && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setDetailCampaign(null)} />
          <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border/60 bg-card p-6 shadow-xl animate-scale-in">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">Получатели</h3>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{detailCampaign.title}</p>
              </div>
              <button
                onClick={() => setDetailCampaign(null)}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailCampaign.recipients.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Отправлено: {detailSent}
                </span>
                {detailFailed > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    Ошибки: {detailFailed}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Ожидают: {detailPending}
                </span>
              </div>
            )}

            <div className="mt-4 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {detailCampaign.recipients.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Нет данных о получателях</p>
              ) : (
                detailCampaign.recipients.map((r, i) => {
                  const sent = r.status === 'sent'
                  const failed = r.status === 'failed'
                  return (
                    <div key={i} className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/40">
                      {sent ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      ) : failed ? (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      ) : (
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="font-medium">{r.last_name} {r.first_name}</span>
                          <span className="text-muted-foreground"> — {r.position}</span>
                        </p>
                        {failed && r.error && (
                          <p className="mt-0.5 truncate text-xs text-destructive">Ошибка: {r.error}</p>
                        )}
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                        sent && 'bg-green-500/10 text-green-600',
                        failed && 'bg-destructive/10 text-destructive',
                        !sent && !failed && 'bg-muted text-muted-foreground',
                      )}>
                        {sent ? 'Отправлено' : failed ? 'Ошибка' : 'Ожидает'}
                      </span>
                    </div>
                  )
                })
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <Button variant="outline" onClick={() => setDetailCampaign(null)}>Закрыть</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
