import { useState, useEffect, useRef } from 'react'
import { FileText, X, Download, Loader2, Plus, ChevronUp } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { formatDate } from '@/shared/lib/utils'
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
}

interface Props {
  open: boolean
  onClose: () => void
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  on_approval: { label: 'На согласовании', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  approved: { label: 'Утверждено', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected: { label: 'Отклонено', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelled_by_employee: { label: 'Отменено', className: 'bg-muted text-muted-foreground' },
  cancelled_by_manager: { label: 'Отменено', className: 'bg-muted text-muted-foreground' },
}

const emptyForm = (): AddForm => ({ vacationId: '', newStartDate: '', newDays: '', reason: '', note: '' })

export function VacationTransferApplicationModal({ open, onClose }: Props) {
  const user = useAuthStore(s => s.user)
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
      fetch(`${API_BASE_URL}/vacation/my-transferable`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE_URL}/vacation/my-transfer-requests`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
    ])
      .then(([tv, tr]) => {
        setTransferable(tv)
        setTransfers(tr)
        setSelected(new Set(tr.filter((t: TransferRequest) => t.status === 'approved').map((t: TransferRequest) => t.id)))
      })
      .catch(() => {})
      .finally(() => setDataLoading(false))
  }

  useEffect(() => {
    if (!open) return
    setTemplatesLoading(true)
    fetch(`${API_BASE_URL}/dictionaries/doc-templates`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Template[]) => {
        const filtered = data.filter(t => t.purpose === 'vacation_transfer_template')
        setTemplates(filtered)
        if (filtered.length === 1) setTemplateId(String(filtered[0].id))
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false))
    load()
  }, [open])

  const selectedVacation = transferable.find(v => String(v.id) === form.vacationId)

  useEffect(() => {
    if (!selectedVacation || !user?.id) { setBalance(null); return }
    const year = new Date(selectedVacation.start_date).getFullYear()
    const key = `${user.id}-${year}`
    if (balanceFetchRef.current === key) return
    balanceFetchRef.current = key
    fetch(`${API_BASE_URL}/vacation/balance/${user.id}?year=${year}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => setBalance(data))
      .catch(() => setBalance(null))
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
    if (isNaN(days) || days < 1) { setFormError('Некорректное количество дней'); return }

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
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка')
      }
      setForm(emptyForm())
      setShowAddForm(false)
      load()
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSelected = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const approvedIds = transfers.filter(t => t.status === 'approved').map(t => t.id)
  const canGenerate = templateId && approvedIds.some(id => selected.has(id))

  const handleGenerate = async () => {
    const transferIds = approvedIds.filter(id => selected.has(id))
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
      handleClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  const handleClose = () => {
    setForm(emptyForm())
    setShowAddForm(false)
    setError(null)
    setFormError(null)
    setSelected(new Set())
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background rounded-xl border border-border/60 shadow-sm w-full max-w-2xl mx-4 animate-scale-in max-h-[90vh] flex flex-col">
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Заявление о переносе отпуска</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Генерация документа из подтверждённых переносов
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-2 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Шаблон документа</Label>
            {templatesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-lg border border-border/60 bg-muted/30 p-3">
                Нет шаблонов с назначением «Шаблон переноса отпуска». Добавьте в справочнике.
              </p>
            ) : (
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
              >
                <option value="">Выберите шаблон</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Переносы отпуска</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setShowAddForm(v => !v); setFormError(null) }}
                className="interactive"
              >
                {showAddForm ? <ChevronUp className="h-3.5 w-3.5 mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                {showAddForm ? 'Скрыть форму' : 'Добавить перенос'}
              </Button>
            </div>

            {showAddForm && (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3 animate-slide-up">
                {formError && (
                  <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                    {formError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Отпуск для переноса *</Label>
                  {transferable.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет доступных для переноса отпусков</p>
                  ) : (
                    <select
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={form.vacationId}
                      onChange={e => setForm(f => ({ ...f, vacationId: e.target.value }))}
                    >
                      <option value="">Выберите отпуск</option>
                      {transferable.map(v => (
                        <option key={v.id} value={v.id}>
                          {formatDate(v.start_date)} — {v.duration} дн. ({v.vacation_type_name})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedVacation && (
                  <div className="space-y-1.5">
                    <div className="flex gap-4 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                      <span>Начало: <strong>{formatDate(selectedVacation.start_date)}</strong></span>
                      <span>Конец: <strong>{formatDate(selectedVacation.end_date)}</strong></span>
                      <span>Дней: <strong>{selectedVacation.duration}</strong></span>
                    </div>
                    {balance && (
                      <div className="flex gap-3 text-xs bg-primary/5 border border-primary/20 rounded-md px-3 py-2 flex-wrap">
                        <span className="text-muted-foreground">Баланс {balance.year}:</span>
                        <span>Всего: <strong>{balance.total_days}</strong></span>
                        <span>Использовано: <strong>{balance.used_days}</strong></span>
                        <span>Зарезервировано: <strong>{balance.reserved_days}</strong></span>
                        <span className={balance.available_days > 0 ? 'text-emerald-600 font-semibold' : 'text-destructive font-semibold'}>
                          Доступно: {balance.available_days} дн.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Новая дата начала *</Label>
                    <Input
                      type="date"
                      value={form.newStartDate}
                      onChange={e => setForm(f => ({ ...f, newStartDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Новое количество дней *</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="14"
                      value={form.newDays}
                      onChange={e => setForm(f => ({ ...f, newDays: e.target.value }))}
                    />
                  </div>
                </div>

                {deltaInfo() && (
                  <p className="text-xs text-muted-foreground">
                    Изменение: <strong className={deltaInfo()!.direction === 'увеличив' ? 'text-emerald-600' : 'text-orange-600'}>
                      {deltaInfo()!.direction} на {deltaInfo()!.delta} дн.
                    </strong>
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Причина переноса *</Label>
                  <Input
                    placeholder="Причина переноса"
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Доп. пометка (необязательно)</Label>
                  <Input
                    placeholder="напр. с оплатой проезда до города"
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSubmitForm}
                    disabled={submitting || !form.vacationId || !form.newStartDate || !form.newDays || !form.reason.trim()}
                  >
                    {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                    Подать на согласование
                  </Button>
                </div>
              </div>
            )}

            {dataLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Загрузка переносов...
              </div>
            ) : transfers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Нет поданных переносов</p>
            ) : (
              <div className="space-y-2">
                {transfers.map(t => {
                  const st = STATUS_LABEL[t.status] ?? { label: t.status, className: 'bg-muted text-muted-foreground' }
                  const isApproved = t.status === 'approved'
                  const delta = t.new_days - t.original_days

                  return (
                    <label
                      key={t.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                        isApproved
                          ? selected.has(t.id)
                            ? 'border-primary/60 bg-primary/5'
                            : 'border-border/60 hover:border-primary/30'
                          : 'border-border/40 bg-muted/10 opacity-70 cursor-default'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary"
                        checked={isApproved && selected.has(t.id)}
                        disabled={!isApproved}
                        onChange={() => isApproved && toggleSelected(t.id)}
                      />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm">
                            <span className="text-muted-foreground">с</span>{' '}
                            <strong>{formatDate(t.original_start)}</strong>{' '}
                            <span className="text-muted-foreground">({t.original_days} дн.)</span>{' '}
                            <span className="text-muted-foreground">→</span>{' '}
                            <strong>{formatDate(t.new_start)}</strong>{' '}
                            <span className="text-muted-foreground">({t.new_days} дн.)</span>
                          </span>
                          {delta !== 0 && (
                            <span className={`text-xs font-medium ${delta > 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                              {delta > 0 ? '+' : ''}{delta} дн.
                            </span>
                          )}
                        </div>
                        {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${st.className}`}>
                        {st.label}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 pt-4 border-t border-border/40">
          <Button type="button" variant="outline" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Отмена
          </Button>
          <Button onClick={handleGenerate} disabled={!canGenerate || generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Генерация...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Создать заявление
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
