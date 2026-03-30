import { useState } from 'react'
import { Building2, Wrench, Palmtree, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'

type DictTab = 'departments' | 'skills' | 'vacation-types'

interface Props {
  open: boolean
  onClose: () => void
  onAdded: () => void
  tab: DictTab
}

const TAB_CONFIG: Record<DictTab, { label: string; icon: typeof Building2; showCode: boolean }> = {
  departments: { label: 'отдел', icon: Building2, showCode: false },
  skills: { label: 'навык', icon: Wrench, showCode: false },
  'vacation-types': { label: 'тип отпуска', icon: Palmtree, showCode: true },
}

export function AddDictItemModal({ open, onClose, onAdded, tab }: Props) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = TAB_CONFIG[tab]
  const Icon = config.icon

  const reset = () => {
    setName('')
    setCode('')
    setError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (config.showCode && !code.trim()) {
      setError('Код обязателен')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body: Record<string, string> = { name: name.trim() }
      if (config.showCode) body.code = code.trim()

      const res = await fetch(`${API_BASE_URL}/dictionaries/${tab}`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка')
      }
      onAdded()
      handleClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl gradient-primary">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold">
              Добавить {config.label}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 ml-12">
            Введите данные для нового элемента справочника
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {config.showCode && (
              <div className="space-y-2">
                <Label htmlFor="dict-code">Код *</Label>
                <Input
                  id="dict-code"
                  placeholder="Например, sick_leave"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="dict-name">Название *</Label>
              <Input
                id="dict-name"
                placeholder="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
              <Button type="submit" disabled={!name.trim() || saving}>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Добавление…
                  </span>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
