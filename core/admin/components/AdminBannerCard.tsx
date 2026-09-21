import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Megaphone, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Switch } from '@/shared/components/ui/Switch'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'

interface Props {
  scope: 'global' | 'org'
}

interface BannerSettings {
  level: string
  text: string
  isActive: boolean
}

const LEVEL_OPTIONS = [
  { value: 'info', label: 'Инфо' },
  { value: 'warning', label: 'Предупреждение' },
  { value: 'danger', label: 'Опасно' },
]

const MAX_LENGTH = 500

export function AdminBannerCard({ scope }: Props) {
  const isOrg = scope === 'org'
  const [level, setLevel] = useState('info')
  const [text, setText] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiGet<BannerSettings | null>(isOrg ? '/admin/banner/org' : '/admin/banner')
      .then((data) => {
        if (data) {
          setLevel(data.level)
          setText(data.text)
          setIsActive(data.isActive)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOrg])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPut(isOrg ? '/admin/banner/org' : '/admin/banner', {
        level,
        text: text.trim(),
        isActive,
      })
      toast.success(isOrg ? 'Баннер организации сохранён' : 'Баннер системы сохранён')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-5 w-5" />
          {isOrg ? 'Баннер организации' : 'Баннер системы'}
        </CardTitle>
        <CardDescription>
          {isOrg
            ? 'Предупреждение сверху страницы для сотрудников этой организации'
            : 'Предупреждение сверху страницы для всех пользователей системы'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="space-y-1.5 flex-1">
                <label className="text-xs text-muted-foreground">Уровень серьёзности</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {LEVEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-2 sm:pt-6">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span className="text-sm font-medium">Показывать</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Текст баннера</label>
                <span className="text-xs text-muted-foreground">{text.length}/{MAX_LENGTH}</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
                rows={2}
                placeholder="Текст предупреждения"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || (isActive && text.trim().length === 0)}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Сохранить
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
