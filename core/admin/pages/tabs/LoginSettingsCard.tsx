import { useState, useEffect } from 'react'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Switch } from '@/shared/components/ui/Switch'
import { Label } from '@/shared/components/ui/Label'
import { useSiteSettingsStore } from '@/shared/store/siteSettingsStore'
import { LoginPreview } from '@/core/admin/components/LoginPreview'
import { DEFAULT_LOGIN_SUBTITLE, DEFAULT_LOGIN_TITLE } from '@/core/auth/components/LoginHero'
import { Loader2, Check, LogIn } from 'lucide-react'
import type { SystemSetting } from '@/core/admin/types/admin'

const LOGIN_SETTING_KEYS = ['login_title', 'login_subtitle', 'login_demo_buttons'] as const

type LoginSettings = Record<(typeof LOGIN_SETTING_KEYS)[number], string>

export function LoginSettingsCard() {
  const [values, setValues] = useState<LoginSettings | null>(null)
  const [saved, setSaved] = useState<LoginSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [keycloak, setKeycloak] = useState(false)
  const fetchPublicSettings = useSiteSettingsStore((s) => s.fetchPublicSettings)

  useEffect(() => {
    apiGet<{ keycloak: boolean }>('/auth/config').then((c) => setKeycloak(!!c.keycloak)).catch(() => {})
  }, [])

  useEffect(() => {
    apiGet<SystemSetting[]>('/admin/settings')
      .then((all) => {
        const byKey = Object.fromEntries(all.map((x) => [x.key, x.value]))
        const loaded: LoginSettings = {
          login_title: byKey.login_title ?? DEFAULT_LOGIN_TITLE,
          login_subtitle: byKey.login_subtitle ?? DEFAULT_LOGIN_SUBTITLE,
          login_demo_buttons: byKey.login_demo_buttons ?? 'true',
        }
        setValues(loaded)
        setSaved(loaded)
      })
      .catch((err) => toast.error(getErrorMessage(err)))
  }, [])

  if (!values || !saved) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const changed = LOGIN_SETTING_KEYS.some((k) => values[k] !== saved[k])
  const set = (key: keyof LoginSettings, value: string) => setValues({ ...values, [key]: value })

  const save = async () => {
    setSaving(true)
    try {
      await apiPut('/admin/settings', { settings: LOGIN_SETTING_KEYS.map((key) => ({ key, value: values[key].trim() })) })
      setSaved(values)
      fetchPublicSettings()
      toast.success('Страница входа обновлена')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><LogIn className="h-5 w-5" /> Страница входа</CardTitle>
        <CardDescription>Общая для всех учреждений — показывается до входа в систему</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-title">Заголовок</Label>
            <Input id="login-title" value={values.login_title} maxLength={120} placeholder={DEFAULT_LOGIN_TITLE} onChange={(e) => set('login_title', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-subtitle">Подзаголовок</Label>
            <textarea
              id="login-subtitle"
              rows={4}
              maxLength={300}
              value={values.login_subtitle}
              placeholder={DEFAULT_LOGIN_SUBTITLE}
              onChange={(e) => set('login_subtitle', e.target.value)}
              className="w-full resize-y rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
            />
          </div>
          {keycloak ? (
            <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">Вход через Keycloak включён — на странице входа одна кнопка «Войти через Keycloak», кнопок быстрого входа нет.</p>
          ) : (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-3">
            <div>
              <p className="text-sm font-medium">Кнопки быстрого входа</p>
              <p className="text-xs text-muted-foreground">Только в режиме разработки, на рабочем сервере не показываются</p>
            </div>
            <Switch checked={values.login_demo_buttons !== 'false'} onCheckedChange={(checked) => set('login_demo_buttons', String(checked))} />
          </div>
          )}
          <div className="flex justify-end gap-2">
            {changed && <Button variant="outline" onClick={() => setValues(saved)} disabled={saving}>Отменить</Button>}
            <Button onClick={save} disabled={saving || !changed}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Сохранить
            </Button>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Предпросмотр{keycloak ? ' · вход через Keycloak' : ''}{changed ? ' · не сохранено' : ''}</p>
          <LoginPreview title={values.login_title} subtitle={values.login_subtitle} demoButtons={values.login_demo_buttons !== 'false'} keycloak={keycloak} />
        </div>
      </CardContent>
    </Card>
  )
}
