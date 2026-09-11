import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Download, Loader2, Plus, ChevronUp, Trash2, Repeat, FileText, ArrowRight, PlaneTakeoff, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Card } from '@/shared/components/ui/Card'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { cn, getErrorMessage, formatDate } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { useAuthStore } from '@/core/auth/store/authStore'

interface Template {
  id: number
  name: string
  purpose: string
}

interface TransferableVacation {
  id: number
  start_date: string
  end_date: string
  duration: number
  vacation_type_name: string
}

interface TransferRequest {
  id: number
  new_start: string
  new_end: string
  new_days: number
  note: string | null
  original_id: number
  original_start: string
  original_end: string
  original_days: number
  status: 'on_approval' | 'approved' | 'rejected' | 'cancelled_by_employee' | 'cancelled_by_manager'
}

interface Balance {
  total_days: number
  used_days: number
  reserved_days: number
  available_days: number
  year: number
}

interface AddForm {
  vacationId: string
  newStartDate: string
  newDays: string
  reason: string
  note: string
  hasTravel: boolean
  travelDestination: string
  travelChildren: Array<{ fullName: string; birthDate: string }>
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  on_approval: { label: 'На согласовании', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  approved: { label: 'Утверждено', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  rejected: { label: 'Отклонено', className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  cancelled_by_employee: { label: 'Отменено', className: 'bg-muted text-muted-foreground' },
  cancelled_by_manager: { label: 'Отменено', className: 'bg-muted text-muted-foreground' },
}

const emptyForm = (): AddForm => ({ vacationId: '', newStartDate: '', newDays: '', reason: '', note: '', hasTravel: false, travelDestination: '', travelChildren: [] })

export function VacationTransferApplicationPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [transferable, setTransferable] = useState<TransferableVacation[]>([])
  const [transfers, setTransfers] = useState<TransferRequest[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<AddForm>(emptyForm())
  const [balance, setBalance] = useState<Balance | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const balanceFetchRef = useRef<string | null>(null)

  const load = () => {
    setDataLoading(true)
    Promise.all([
      fetch(`${API_BASE_URL}/vacation/my-transferable`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE_URL}/vacation/my-transfer-requests`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([tv, tr]) => {
        setTransferable(tv)
        const approvedIds = new Set(tr.filter((t: TransferRequest) => t.status === 'approved').map((t: TransferRequest) => t.id))
        setTransfers(tr)
        setSelected((prev) => {
          const next = new Set<number>()
          for (const id of prev) if (approvedIds.has(id)) next.add(id)
          return next
        })
      })
      .catch(() => {})
      .finally(() => setDataLoading(false))
  }

  useEffect(() => {
    setTemplatesLoading(true)
    fetch(`${API_BASE_URL}/dictionaries/doc-templates`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Template[]) => {
        const filtered = data.filter((t) => t.purpose === 'vacation_transfer_template')
        setTemplates(filtered)
        if (filtered.length === 1) setTemplateId(String(filtered[0].id))
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false))
    load()
  }, [])

  const selectedVacation = transferable.find((v) => String(v.id) === form.vacationId)

  useEffect(() => {
    if (!selectedVacation || !user?.id) {
      setBalance(null)
      return
    }
    const year = new Date(selectedVacation.start_date).getFullYear()
    const key = `${user.id}-${year}`
    if (balanceFetchRef.current === key) return
    balanceFetchRef.current = key
    fetch(`${API_BASE_URL}/vacation/balance/${user.id}?year=${year}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setBalance(data))
      .catch(() => setBalance(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVacation?.id, user?.id])

  const computedNewDays = () => {
    const n = Number(form.newDays)
    return isNaN(n) || n <= 0 ? null : n
  }

  const deltaInfo = () => {
    if (!selectedVacation || !computedNewDays()) return null
    const delta = computedNewDays()! - selectedVacation.duration
    return { delta: Math.abs(delta), direction: delta >= 0 ? 'увеличив' : 'сократив' }
  }

  const handleSubmitForm = async () => {
    if (!form.vacationId || !form.newStartDate || !form.newDays || !form.reason.trim()) {
      setFormError('Заполните все обязательные поля')
      return
    }
    const days = Number(form.newDays)
    if (isNaN(days) || days < 1) {
      setFormError('Некорректное количество дней')
      return
    }

    if (form.hasTravel) {
      if (!form.travelDestination.trim()) {
        setFormError('Укажите город проезда')
        return
      }
      for (const child of form.travelChildren) {
        if (!child.fullName.trim()) {
          setFormError('Укажите ФИО ребёнка')
          return
        }
        if (!child.birthDate) {
          setFormError('Укажите дату рождения ребёнка')
          return
        }
        const age = (Date.now() - new Date(child.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        if (age >= 18) {
          setFormError('Ребёнок должен быть младше 18 лет')
          return
        }
      }
    }

    const startParts = form.newStartDate.split('-').map(Number)
    const newEnd = new Date(startParts[0], startParts[1] - 1, startParts[2] + days - 1)
    const newEndDate = `${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, '0')}-${String(newEnd.getDate()).padStart(2, '0')}`

    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/vacation/requests/${form.vacationId}/transfer`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({
          newStartDate: form.newStartDate,
          newEndDate,
          reason: form.reason,
          note: form.note || undefined,
          hasTravel: form.hasTravel,
          travelDestination: form.hasTravel ? form.travelDestination.trim() || undefined : undefined,
          travelChildren: form.hasTravel ? form.travelChildren : [],
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка')
      }
      setForm(emptyForm())
      setShowAddForm(false)
      toast.success('Перенос отправлен на согласование')
      load()
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const approvedIds = transfers.filter((t) => t.status === 'approved').map((t) => t.id)
  const canGenerate = templateId && approvedIds.some((id) => selected.has(id))

  const handleGenerate = async () => {
    const transferIds = approvedIds.filter((id) => selected.has(id))
    if (!templateId || transferIds.length === 0) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/vacation/generate-transfer-application`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ templateId: Number(templateId), transferIds }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка генерации')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Заявление_перенос.docx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Заявление сформировано')
      navigate('/vacation')
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  const addChild = () =>
    setForm((f) => ({ ...f, travelChildren: [...f.travelChildren, { fullName: '', birthDate: '' }] }))
  const patchChild = (index: number, patch: Partial<{ fullName: string; birthDate: string }>) =>
    setForm((f) => ({ ...f, travelChildren: f.travelChildren.map((c, i) => (i === index ? { ...c, ...patch } : c)) }))
  const removeChild = (index: number) =>
    setForm((f) => ({ ...f, travelChildren: f.travelChildren.filter((_, i) => i !== index) }))

  const approvedSelectedCount = approvedIds.filter((id) => selected.has(id)).length

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Link
          to="/vacation"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Отпуск
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
            <Repeat className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Заявление на перенос</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Подайте перенос и соберите документ из уже подтверждённых
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3.5">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Шаблон документа</h2>
        </div>
        <div className="p-5">
          {templatesLoading ? (
            <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              Нет шаблонов с назначением «Шаблон переноса отпуска». Добавьте в справочнике документов.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => {
                const active = templateId === String(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(String(t.id))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        active ? 'border-primary' : 'border-muted-foreground/40',
                      )}
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <FileText className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="truncate text-sm font-medium">{t.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Переносы отпуска</h2>
            {approvedSelectedCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                выбрано {approvedSelectedCount}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant={showAddForm ? 'outline' : 'default'}
            size="sm"
            onClick={() => {
              setShowAddForm((v) => !v)
              setFormError(null)
            }}
          >
            {showAddForm ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            {showAddForm ? 'Скрыть форму' : 'Добавить перенос'}
          </Button>
        </div>

        {showAddForm && (
          <div className="animate-slide-up space-y-3 border-b border-border/60 bg-muted/10 p-5">
            {formError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Отпуск для переноса *</Label>
              {transferable.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет доступных для переноса отпусков</p>
              ) : (
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.vacationId}
                  onChange={(e) => setForm((f) => ({ ...f, vacationId: e.target.value }))}
                >
                  <option value="">Выберите отпуск</option>
                  {transferable.map((v) => (
                    <option key={v.id} value={v.id}>
                      {formatDate(v.start_date)} — {v.duration} дн. ({v.vacation_type_name})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedVacation && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span>
                    Начало: <strong className="text-foreground">{formatDate(selectedVacation.start_date)}</strong>
                  </span>
                  <span>
                    Конец: <strong className="text-foreground">{formatDate(selectedVacation.end_date)}</strong>
                  </span>
                  <span>
                    Дней: <strong className="text-foreground">{selectedVacation.duration}</strong>
                  </span>
                </div>
                {balance && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Баланс {balance.year}:</span>
                    <span>
                      Всего: <strong>{balance.total_days}</strong>
                    </span>
                    <span>
                      Использовано: <strong>{balance.used_days}</strong>
                    </span>
                    <span>
                      Зарезервировано: <strong>{balance.reserved_days}</strong>
                    </span>
                    <span className={balance.available_days > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-destructive'}>
                      Доступно: {balance.available_days} дн.
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Новая дата начала *</Label>
                <Input
                  type="date"
                  value={form.newStartDate}
                  onChange={(e) => setForm((f) => ({ ...f, newStartDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Новое количество дней *</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="14"
                  value={form.newDays}
                  onChange={(e) => setForm((f) => ({ ...f, newDays: e.target.value }))}
                />
              </div>
            </div>

            {deltaInfo() && (
              <p className="text-xs text-muted-foreground">
                Изменение:{' '}
                <strong className={deltaInfo()!.direction === 'увеличив' ? 'text-emerald-600' : 'text-orange-600'}>
                  {deltaInfo()!.direction} на {deltaInfo()!.delta} дн.
                </strong>
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Причина переноса *</Label>
              <Input
                placeholder="Причина переноса"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Доп. пометка (необязательно)</Label>
              <Input
                placeholder="напр. с оплатой проезда до города"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>

            <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={form.hasTravel}
                onChange={(e) => setForm((f) => ({ ...f, hasTravel: e.target.checked }))}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <PlaneTakeoff className="h-4 w-4 text-muted-foreground" />
              С проездом к месту проведения отпуска
            </label>

            {form.hasTravel && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-background p-3">
                <div>
                  <Label className="mb-1 block text-xs">Город (страна — при выезде за границу)</Label>
                  <Input
                    placeholder="Напр. Москва"
                    value={form.travelDestination}
                    onChange={(e) => setForm((f) => ({ ...f, travelDestination: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Несовершеннолетние дети</Label>
                    <button
                      type="button"
                      onClick={addChild}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Добавить ребёнка
                    </button>
                  </div>
                  {form.travelChildren.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет детей для проезда</p>
                  ) : (
                    form.travelChildren.map((child, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <Input
                          placeholder="ФИО ребёнка"
                          value={child.fullName}
                          onChange={(e) => patchChild(index, { fullName: e.target.value })}
                          className="flex-1"
                        />
                        <Input
                          type="date"
                          value={child.birthDate}
                          onChange={(e) => patchChild(index, { birthDate: e.target.value })}
                          className="w-[150px]"
                        />
                        <button
                          type="button"
                          onClick={() => removeChild(index)}
                          className="mt-0.5 rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                size="sm"
                onClick={handleSubmitForm}
                disabled={submitting || !form.vacationId || !form.newStartDate || !form.newDays || !form.reason.trim()}
              >
                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Подать на согласование
              </Button>
            </div>
          </div>
        )}

        <div className="p-5">
          {dataLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка переносов…
            </div>
          ) : transfers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
              Нет поданных переносов
            </div>
          ) : (
            <div className="space-y-2">
              {transfers.map((t) => {
                const st = STATUS_LABEL[t.status] ?? { label: t.status, className: 'bg-muted text-muted-foreground' }
                const isApproved = t.status === 'approved'
                const isSelected = isApproved && selected.has(t.id)
                const delta = t.new_days - t.original_days

                return (
                  <label
                    key={t.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                      isApproved
                        ? isSelected
                          ? 'cursor-pointer border-primary/60 bg-primary/5'
                          : 'cursor-pointer border-border/60 hover:border-primary/30'
                        : 'cursor-default border-border/40 bg-muted/10 opacity-70',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                      checked={isSelected}
                      disabled={!isApproved}
                      onChange={() => isApproved && toggleSelected(t.id)}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <strong>{formatDate(t.original_start)}</strong>
                          <span className="text-xs text-muted-foreground">{t.original_days} дн.</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="inline-flex items-center gap-1.5">
                          <strong>{formatDate(t.new_start)}</strong>
                          <span className="text-xs text-muted-foreground">{t.new_days} дн.</span>
                        </span>
                        {delta !== 0 && (
                          <span className={cn('text-xs font-medium', delta > 0 ? 'text-emerald-600' : 'text-orange-600')}>
                            {delta > 0 ? '+' : ''}
                            {delta} дн.
                          </span>
                        )}
                      </div>
                      {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', st.className)}>
                      {st.label}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          {transfers.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              В документ попадут только отмеченные утверждённые переносы
            </p>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => navigate('/vacation')}>
          Отмена
        </Button>
        <Button onClick={handleGenerate} disabled={!canGenerate || generating}>
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {generating ? 'Формирование…' : 'Создать заявление'}
        </Button>
      </div>
    </div>
  )
}
