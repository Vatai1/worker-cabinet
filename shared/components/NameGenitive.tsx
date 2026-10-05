import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FileSignature } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'

export interface PersonName {
  lastName: string
  firstName: string
  middleName: string
}

export interface NameGenitiveInfo {
  saved: boolean
  nominative: PersonName
  genitive: PersonName
  suggestion: PersonName
}

const FIELDS: { key: keyof PersonName; label: string }[] = [
  { key: 'lastName', label: 'Фамилия' },
  { key: 'firstName', label: 'Имя' },
  { key: 'middleName', label: 'Отчество' },
]

const loadInfo = () => apiGet<NameGenitiveInfo>('/users/me/name-genitive')
const saveGenitive = (value: PersonName) => apiPut('/users/me/name-genitive', value)

export function NameGenitiveForm({ nominative, value, onChange }: { nominative: PersonName; value: PersonName; onChange: (v: PersonName) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_1fr]">
      <div data-testid="name-genitive-preview" className="self-start rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm leading-relaxed">
        <div className="text-muted-foreground">От</div>
        {FIELDS.map(({ key }) => value[key].trim() && <div key={key} className="break-words">{value[key]}</div>)}
      </div>
      <div className="space-y-2">
        {FIELDS.filter(({ key }) => key !== 'middleName' || nominative.middleName || value.middleName).map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`gen-${key}`} className="text-xs text-muted-foreground">
              {label}{nominative[key] ? ` (${nominative[key]})` : ''}
            </Label>
            <Input
              id={`gen-${key}`}
              className="h-9"
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const isComplete = (v: PersonName) => !!v.lastName.trim() && !!v.firstName.trim()

function NameGenitiveDialog({ info, onDone }: { info: NameGenitiveInfo; onDone: (saved: boolean) => void }) {
  const [value, setValue] = useState(info.genitive)
  const [saving, setSaving] = useState(false)
  useModalOpen(true)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDone])

  const save = async () => {
    setSaving(true)
    try {
      await saveGenitive(value)
      onDone(true)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onDone(false)} />
      <div role="dialog" aria-modal="true" aria-labelledby="name-genitive-title" className="relative mx-4 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-scale-in">
        <h3 id="name-genitive-title" className="text-lg font-semibold">Как склоняется ваше ФИО?</h3>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Так ФИО будет написано в заявлениях. Проверьте и поправьте, если нужно — изменить можно в настройках.
        </p>
        <NameGenitiveForm nominative={info.nominative} value={value} onChange={setValue} />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onDone(false)}>Отмена</Button>
          <Button onClick={save} disabled={saving || !isComplete(value)}>Сохранить и продолжить</Button>
        </div>
      </div>
    </div>
  )
}

export function useNameGenitiveGate() {
  const [pending, setPending] = useState<{ info: NameGenitiveInfo; resolve: (ok: boolean) => void } | null>(null)

  const ensure = useCallback(async () => {
    let info: NameGenitiveInfo
    try {
      info = await loadInfo()
    } catch {
      return true
    }
    if (info.saved) return true
    return new Promise<boolean>((resolve) => setPending({ info, resolve }))
  }, [])

  const dialog = pending && (
    <NameGenitiveDialog
      info={pending.info}
      onDone={(saved) => {
        pending.resolve(saved)
        setPending(null)
      }}
    />
  )

  return { ensure, dialog }
}

export function NameGenitiveCard() {
  const [info, setInfo] = useState<NameGenitiveInfo | null>(null)
  const [value, setValue] = useState<PersonName | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadInfo()
      .then((data) => {
        setInfo(data)
        setValue(data.genitive)
      })
      .catch(() => setInfo(null))
  }, [])

  if (!info || !value) return null

  const save = async () => {
    setSaving(true)
    try {
      await saveGenitive(value)
      setInfo({ ...info, saved: true, genitive: value })
      toast.success('Сохранено')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const changed = !info.saved || FIELDS.some(({ key }) => value[key] !== info.genitive[key])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-5 w-5" />
          ФИО в заявлениях
        </CardTitle>
        <CardDescription>
          Родительный падеж — «от кого» в шапке заявления{info.saved ? '' : '. Сейчас подставляется автоматически'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NameGenitiveForm nominative={info.nominative} value={value} onChange={setValue} />
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving || !changed || !isComplete(value)}>Сохранить</Button>
        </div>
      </CardContent>
    </Card>
  )
}
