import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Crown, Check, Loader2, Save, ArrowRight, AlertTriangle, UserCog } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Input } from '@/shared/components/ui/Input'
import { Button } from '@/shared/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { cn, getErrorMessage } from '@/shared/lib/utils'

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

function personName(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

function personInitials(first?: string | null, last?: string | null): string {
  return [first?.[0], last?.[0]].filter(Boolean).join('') || '??'
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
      setSuccessMsg('Информация сохранена')
      setTimeout(() => setSuccessMsg(null), 3000)
      fetchOrg()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const openHeadPicker = async () => {
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

  const handleSelectHead = (candidate: Candidate) => {
    setConfirmCandidate(candidate)
    setShowHeadPicker(false)
  }

  const handleConfirmHead = async () => {
    if (!confirmCandidate) return
    setSavingHead(true)
    setError(null)
    try {
      await apiPut(`/organizations/${org!.id}`, { head_id: confirmCandidate.id })
      setConfirmCandidate(null)
      fetchOrg()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSavingHead(false)
    }
  }

  const handleCancelConfirm = () => {
    setConfirmCandidate(null)
    setShowHeadPicker(true)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !org) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!org) return null

  const headName = personName([org.head_last_name, org.head_first_name, org.head_middle_name])
  const headInitials = personInitials(org.head_first_name, org.head_last_name)

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-indigo-500 to-blue-600 relative">
          <div className="absolute -bottom-8 left-6 p-3 rounded-2xl bg-card shadow-lg border border-border/40">
            <Building2 className="h-7 w-7 text-indigo-500" />
          </div>
        </div>
        <CardContent className="pt-12">
          <h2 className="text-xl font-bold">{org.name}</h2>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">{org.slug}</p>
          {org.inn && <p className="text-sm text-muted-foreground mt-1">ИНН: {org.inn}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Информация об учреждении
          </CardTitle>
          <CardDescription>Название, реквизиты, адрес</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-600 text-sm">{successMsg}</div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Название</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Название учреждения" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">ИНН</label>
            <Input value={editInn} onChange={(e) => setEditInn(e.target.value)} placeholder="ИНН" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Адрес</label>
            <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Адрес" />
          </div>
          <Button onClick={handleSaveInfo} disabled={saving || !editName.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Сохранить
          </Button>
        </CardContent>
      </Card>

      <Card className="border-amber-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Руководитель учреждения
          </CardTitle>
          <CardDescription>Назначение или замена руководителя</CardDescription>
        </CardHeader>
        <CardContent>
          {headName ? (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <Avatar className="h-16 w-16 ring-2 ring-amber-500/20">
                <AvatarImage src={org.head_avatar || generateAvatarUrl(String(org.head_id))} alt={headName} />
                <AvatarFallback className="text-lg font-semibold">{headInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold">{headName}</p>
                {org.head_position && <p className="text-sm text-muted-foreground">{org.head_position}</p>}
                {org.head_email && <p className="text-xs text-muted-foreground mt-0.5">{org.head_email}</p>}
              </div>
              <Button variant="outline" size="sm" onClick={openHeadPicker}>
                <Crown className="h-4 w-4 mr-1.5" />
                Изменить
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Crown className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Руководитель не назначен</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openHeadPicker}>
                <Crown className="h-4 w-4 mr-1.5" />
                Назначить руководителя
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {showHeadPicker && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 animate-fade-in" onClick={() => { setShowHeadPicker(false); setConfirmCandidate(null) }}>
          <Card className="max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => { e.stopPropagation(); }}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCog className="h-5 w-5 text-amber-500" />
                {org.head_id ? 'Замена руководителя' : 'Назначение руководителя'}
              </CardTitle>
              <CardDescription>Выберите сотрудника учреждения</CardDescription>
            </CardHeader>
            <CardContent className="overflow-y-auto flex-1">
              {loadingCandidates ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Нет доступных кандидатов</p>
              ) : (
                <div className="space-y-1">
                  {candidates.map((c) => {
                    const name = personName([c.last_name, c.first_name, c.middle_name])
                    const initials = personInitials(c.first_name, c.last_name)
                    const isCurrent = c.id === org.head_id
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelectHead(c)}
                        disabled={savingHead || isCurrent}
                        className={cn(
                          'flex items-center gap-3 w-full p-2.5 rounded-lg text-left transition-colors',
                          isCurrent ? 'bg-amber-500/10 opacity-60 cursor-default' : 'hover:bg-muted',
                        )}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={c.avatar || generateAvatarUrl(String(c.id))} alt={name} />
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{name}</p>
                          {c.position && <p className="text-xs text-muted-foreground truncate">{c.position}</p>}
                        </div>
                        {isCurrent && <span className="text-[10px] font-medium text-amber-600 shrink-0">Текущий</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
            <div className="p-3 border-t border-border/40">
              <Button variant="outline" size="sm" className="w-full" onClick={() => { setShowHeadPicker(false); setConfirmCandidate(null) }}>
                Отмена
              </Button>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {confirmCandidate && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 animate-fade-in" onClick={() => !savingHead && handleCancelConfirm()}>
          <Card className="max-w-lg w-full mx-4" onClick={(e) => { e.stopPropagation(); }}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Подтверждение смены руководителя
              </CardTitle>
              <CardDescription>
                {org.head_id
                  ? 'Вы уверены, что хотите заменить руководителя учреждения?'
                  : 'Назначить нового руководителя учреждения?'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {org.head_id && (
                <div className="flex items-center gap-4">
                  <div className="flex-1 rounded-xl bg-muted/40 border border-border/40 p-3 text-center">
                    <Avatar className="h-14 w-14 mx-auto mb-2 ring-2 ring-border/60">
                      <AvatarImage src={org.head_avatar || generateAvatarUrl(String(org.head_id))} alt={headName} />
                      <AvatarFallback className="text-sm">{headInitials}</AvatarFallback>
                    </Avatar>
                    <p className="text-xs font-medium truncate">{headName}</p>
                    {org.head_position && <p className="text-[11px] text-muted-foreground truncate">{org.head_position}</p>}
                    <span className="inline-block mt-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Текущий</span>
                  </div>

                  <div className="flex flex-col items-center justify-center shrink-0">
                    <ArrowRight className="h-5 w-5 text-amber-500" />
                  </div>

                  <div className="flex-1 rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-center">
                    <Avatar className="h-14 w-14 mx-auto mb-2 ring-2 ring-amber-500/30">
                      <AvatarImage src={confirmCandidate.avatar || generateAvatarUrl(String(confirmCandidate.id))} alt={personName([confirmCandidate.last_name, confirmCandidate.first_name, confirmCandidate.middle_name])} />
                      <AvatarFallback className="text-sm">{personInitials(confirmCandidate.first_name, confirmCandidate.last_name)}</AvatarFallback>
                    </Avatar>
                    <p className="text-xs font-medium truncate">{personName([confirmCandidate.last_name, confirmCandidate.first_name, confirmCandidate.middle_name])}</p>
                    {confirmCandidate.position && <p className="text-[11px] text-muted-foreground truncate">{confirmCandidate.position}</p>}
                    <span className="inline-block mt-1.5 text-[10px] text-amber-600 font-medium uppercase tracking-wide">Новый</span>
                  </div>
                </div>
              )}

              {!org.head_id && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 flex items-center gap-3">
                  <Avatar className="h-12 w-12 shrink-0 ring-2 ring-amber-500/30">
                    <AvatarImage src={confirmCandidate.avatar || generateAvatarUrl(String(confirmCandidate.id))} alt={personName([confirmCandidate.last_name, confirmCandidate.first_name, confirmCandidate.middle_name])} />
                    <AvatarFallback className="text-sm">{personInitials(confirmCandidate.first_name, confirmCandidate.last_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{personName([confirmCandidate.last_name, confirmCandidate.first_name, confirmCandidate.middle_name])}</p>
                    {confirmCandidate.position && <p className="text-xs text-muted-foreground truncate">{confirmCandidate.position}</p>}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 text-amber-700 dark:text-amber-400 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>Руководитель учреждения отображается в карточке организации, иерархии и на странице учреждения. Предыдущий руководитель будет освобождён от этой роли.</p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCancelConfirm} disabled={savingHead}>
                  Отмена
                </Button>
                <Button size="sm" onClick={handleConfirmHead} disabled={savingHead}>
                  {savingHead ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  {org.head_id ? 'Заменить' : 'Назначить'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body
      )}
    </div>
  )
}
