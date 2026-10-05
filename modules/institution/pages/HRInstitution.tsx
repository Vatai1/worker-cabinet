import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Crown, Check, Loader2, Save, ArrowRight, ArrowLeft, AlertTriangle, UserCog, Search, X, Hash, MapPin, Link2, Mail, RotateCcw, FileText } from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Input } from '@/shared/components/ui/Input'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { BannerPill } from '@/shared/components/PageBanner'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { cn, getErrorMessage, personName } from '@/shared/lib/utils'

interface OrgData {
  id: number
  name: string
  slug: string
  inn: string | null
  address: string | null
  head_id: number | null
  head_first_name: string | null
  head_last_name: string | null
  head_middle_name: string | null
  head_position: string | null
  head_email: string | null
  head_avatar: string | null
}

interface Candidate {
  id: number
  first_name: string
  last_name: string
  middle_name: string | null
  position: string | null
  avatar: string | null
}

function personInitials(first?: string | null, last?: string | null): string {
  return [first?.[0], last?.[0]].filter(Boolean).join('') || '??'
}

function PersonTile({ id, avatar, first, last, middle, position, label, accent }: {
  id: number
  avatar: string | null
  first: string | null
  last: string | null
  middle: string | null
  position: string | null
  label: string
  accent?: boolean
}) {
  const name = personName(last, first, middle)
  return (
    <div className={cn('flex-1 min-w-0 rounded-xl border p-3 text-center', accent ? 'bg-amber-500/5 border-amber-500/20' : 'bg-muted/40 border-border/40')}>
      <Avatar className={cn('h-14 w-14 mx-auto mb-2 ring-2', accent ? 'ring-amber-500/30' : 'ring-border/60')}>
        <AvatarImage src={avatar || generateAvatarUrl(String(id))} alt={name} />
        <AvatarFallback className="text-sm">{personInitials(first, last)}</AvatarFallback>
      </Avatar>
      <p className="text-xs font-medium truncate">{name}</p>
      {position && <p className="text-[11px] text-muted-foreground truncate">{position}</p>}
      <span className={cn('inline-block mt-1.5 text-[10px] font-medium uppercase tracking-wide', accent ? 'text-amber-600' : 'text-muted-foreground')}>{label}</span>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, description, tone }: { icon: typeof Building2; title: string; description: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function HRInstitution() {
  const [org, setOrg] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [editName, setEditName] = useState('')
  const [editInn, setEditInn] = useState('')
  const [editAddress, setEditAddress] = useState('')

  const [showHeadPicker, setShowHeadPicker] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [savingHead, setSavingHead] = useState(false)
  const [confirmCandidate, setConfirmCandidate] = useState<Candidate | null>(null)

  const fetchOrg = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<OrgData>('/organizations/current')
      setOrg(data)
      setEditName(data.name || '')
      setEditInn(data.inn || '')
      setEditAddress(data.address || '')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrg()
  }, [fetchOrg])

  useEffect(() => {
    const handler = () => fetchOrg()
    window.addEventListener('org-changed', handler)
    return () => window.removeEventListener('org-changed', handler)
  }, [fetchOrg])

  const resetInfo = () => {
    if (!org) return
    setEditName(org.name || '')
    setEditInn(org.inn || '')
    setEditAddress(org.address || '')
  }

  const handleSaveInfo = async () => {
    setSaving(true)
    setError(null)
    setSuccessMsg(null)
    try {
      await apiPut(`/organizations/${org!.id}`, {
        name: editName.trim(),
        inn: editInn.trim(),
        address: editAddress.trim(),
      })
      setSuccessMsg('Сохранено')
      setTimeout(() => setSuccessMsg(null), 3000)
      fetchOrg()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const closeHeadPicker = () => {
    setShowHeadPicker(false)
    setConfirmCandidate(null)
  }

  const openHeadPicker = async () => {
    setCandidateSearch('')
    setConfirmCandidate(null)
    setShowHeadPicker(true)
    setLoadingCandidates(true)
    try {
      const data = await apiGet<Candidate[]>(`/organizations/${org!.id}/candidates`)
      setCandidates(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoadingCandidates(false)
    }
  }

  const handleConfirmHead = async () => {
    if (!confirmCandidate) return
    setSavingHead(true)
    setError(null)
    try {
      await apiPut(`/organizations/${org!.id}`, { head_id: confirmCandidate.id })
      closeHeadPicker()
      fetchOrg()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSavingHead(false)
    }
  }

  useEffect(() => {
    if (!showHeadPicker) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || savingHead) return
      if (confirmCandidate) setConfirmCandidate(null)
      else setShowHeadPicker(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showHeadPicker, confirmCandidate, savingHead])

  if (loading && !org) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !org) {
    return (
      <Card className="py-8 text-center text-sm text-destructive">{error}</Card>
    )
  }

  if (!org) return null

  const headName = personName(org.head_last_name, org.head_first_name, org.head_middle_name)
  const isDirty = editName.trim() !== (org.name || '') || editInn.trim() !== (org.inn || '') || editAddress.trim() !== (org.address || '')

  const candidateQuery = candidateSearch.trim().toLowerCase()
  const filteredCandidates = candidateQuery
    ? candidates.filter((c) =>
        (personName(c.last_name, c.first_name, c.middle_name).toLowerCase() + ' ' + (c.position || '').toLowerCase()).includes(candidateQuery),
      )
    : candidates

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl gradient-primary text-white shadow-lg shadow-primary/25">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/80">Учреждение</p>
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl" style={{ textWrap: 'balance' }}>{org.name}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <BannerPill icon={Link2} tone="neutral"><span className="font-mono">{org.slug}</span></BannerPill>
              <BannerPill icon={Hash} tone={org.inn ? 'neutral' : 'warning'}>{org.inn ? `ИНН ${org.inn}` : 'ИНН не указан'}</BannerPill>
              <BannerPill icon={MapPin} tone={org.address ? 'neutral' : 'warning'} className="max-w-full">
                <span className="truncate">{org.address || 'Адрес не указан'}</span>
              </BannerPill>
              <BannerPill icon={Crown} tone={org.head_id ? 'success' : 'warning'}>{org.head_id ? 'Руководитель назначен' : 'Нет руководителя'}</BannerPill>
            </div>
          </div>
        </div>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} aria-label="Закрыть" className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden p-0 lg:col-span-3">
          <SectionHeader icon={FileText} title="Реквизиты" description="Название, ИНН и адрес учреждения" tone="bg-primary/10 text-primary" />
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => { e.preventDefault(); if (isDirty && editName.trim()) handleSaveInfo() }}
          >
            <div className="space-y-1.5">
              <label htmlFor="org-name" className="text-xs font-medium text-muted-foreground">Название</label>
              <Input id="org-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Полное название учреждения" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="org-inn" className="text-xs font-medium text-muted-foreground">ИНН</label>
                <Input id="org-inn" inputMode="numeric" maxLength={12} value={editInn} onChange={(e) => setEditInn(e.target.value.replace(/\D/g, ''))} placeholder="10 или 12 цифр" className="font-mono" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="org-address" className="text-xs font-medium text-muted-foreground">Адрес</label>
                <Input id="org-address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Юридический адрес" />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
              {successMsg && !isDirty && (
                <span className="mr-auto inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-fade-in">
                  <Check className="h-3.5 w-3.5" />
                  {successMsg}
                </span>
              )}
              {isDirty && (
                <Button type="button" variant="ghost" size="sm" onClick={resetInfo} disabled={saving}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Отменить
                </Button>
              )}
              <Button type="submit" size="sm" disabled={saving || !isDirty || !editName.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Сохранить
              </Button>
            </div>
          </form>
        </Card>

        <Card className="flex flex-col overflow-hidden p-0 lg:col-span-2">
          <SectionHeader icon={Crown} title="Руководитель" description="Подписант документов и вершина иерархии" tone="bg-amber-500/10 text-amber-500" />
          {headName ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
              <Avatar className="h-20 w-20 ring-4 ring-amber-500/15 mb-2">
                <AvatarImage src={org.head_avatar || generateAvatarUrl(String(org.head_id))} alt={headName} />
                <AvatarFallback className="text-lg font-semibold">{personInitials(org.head_first_name, org.head_last_name)}</AvatarFallback>
              </Avatar>
              <p className="text-base font-semibold">{headName}</p>
              {org.head_position && <p className="text-sm text-muted-foreground">{org.head_position}</p>}
              {org.head_email && (
                <a href={`mailto:${org.head_email}`} className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="h-3.5 w-3.5" />
                  {org.head_email}
                </a>
              )}
              <Button variant="outline" size="sm" className="mt-4" onClick={openHeadPicker}>
                <UserCog className="h-4 w-4 mr-1.5" />
                Сменить руководителя
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6">
              <div className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-border/70 px-4 py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                  <Crown className="h-6 w-6 text-amber-500" />
                </div>
                <p className="text-sm font-medium">Руководитель не назначен</p>
                <p className="mt-1 text-xs text-muted-foreground">Без руководителя не подставляются подписи в документах</p>
                <Button size="sm" className="mt-4" onClick={openHeadPicker}>
                  <Crown className="h-4 w-4 mr-1.5" />
                  Назначить
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {showHeadPicker && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => !savingHead && closeHeadPicker()}>
          <Card className="mx-4 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden p-0 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
              {confirmCandidate ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <UserCog className="h-5 w-5 text-amber-500" />}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">
                  {confirmCandidate ? 'Подтверждение' : org.head_id ? 'Замена руководителя' : 'Назначение руководителя'}
                </h3>
                <p className="text-xs text-muted-foreground">{confirmCandidate ? 'Шаг 2 из 2' : 'Шаг 1 из 2 — выберите работника'}</p>
              </div>
              <button onClick={closeHeadPicker} disabled={savingHead} aria-label="Закрыть" className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {confirmCandidate ? (
              <div className="space-y-4 overflow-y-auto scrollbar-thin overscroll-contain p-5">
                <div className="flex items-center gap-3">
                  {org.head_id && (
                    <>
                      <PersonTile id={org.head_id} avatar={org.head_avatar} first={org.head_first_name} last={org.head_last_name} middle={org.head_middle_name} position={org.head_position} label="Текущий" />
                      <ArrowRight className="h-5 w-5 shrink-0 text-amber-500" />
                    </>
                  )}
                  <PersonTile id={confirmCandidate.id} avatar={confirmCandidate.avatar} first={confirmCandidate.first_name} last={confirmCandidate.last_name} middle={confirmCandidate.middle_name} position={confirmCandidate.position} label="Новый" accent />
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Руководитель учреждения отображается в карточке организации, иерархии и на странице учреждения и получает роль «Руководитель». Предыдущий руководитель освобождается от должности; роль «Руководитель» у него снимается, если он не руководит отделом.</p>
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmCandidate(null)} disabled={savingHead}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Назад
                  </Button>
                  <Button size="sm" onClick={handleConfirmHead} disabled={savingHead}>
                    {savingHead ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                    {org.head_id ? 'Заменить' : 'Назначить'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 pt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      autoFocus
                      className="w-full rounded-lg bg-background border border-input pl-10 pr-9 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
                      placeholder="Поиск по ФИО или должности…"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                    />
                    {candidateSearch && (
                      <button
                        onClick={() => setCandidateSearch('')}
                        aria-label="Очистить"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin overscroll-contain p-3">
                  {loadingCandidates ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Нет доступных кандидатов</p>
                  ) : filteredCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Ничего не найдено</p>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredCandidates.map((c) => {
                        const name = personName(c.last_name, c.first_name, c.middle_name)
                        const isCurrent = c.id === org.head_id
                        return (
                          <button
                            key={c.id}
                            onClick={() => setConfirmCandidate(c)}
                            disabled={isCurrent}
                            className={cn(
                              'group flex items-center gap-3 w-full p-2.5 rounded-lg text-left transition-colors',
                              isCurrent ? 'bg-amber-500/10 cursor-default' : 'hover:bg-muted',
                            )}
                          >
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarImage src={c.avatar || generateAvatarUrl(String(c.id))} alt={name} />
                              <AvatarFallback className="text-xs">{personInitials(c.first_name, c.last_name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{name}</p>
                              {c.position && <p className="text-xs text-muted-foreground truncate">{c.position}</p>}
                            </div>
                            {isCurrent
                              ? <span className="text-[10px] font-medium text-amber-600 shrink-0">Текущий</span>
                              : <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>,
        document.body
      )}
    </div>
  )
}
