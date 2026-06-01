import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Switch } from '@/shared/components/ui/Switch'
import { Button } from '@/shared/components/ui/Button'
import { Bell, Moon, Sun, LogIn, Save, Loader2 } from 'lucide-react'
import { useUIStore } from '@/shared/store/uiStore'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useSiteSettingsStore } from '@/shared/store/siteSettingsStore'
import { getErrorMessage } from '@/shared/lib/utils'

export function Settings() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(false)
  const { darkMode, toggleTheme } = useUIStore()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const { settings, loaded, fetchPublicSettings, updateSettings } = useSiteSettingsStore()
  const [loginTitle, setLoginTitle] = useState('')
  const [loginSubtitle, setLoginSubtitle] = useState('')
  const [demoButtons, setDemoButtons] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) fetchPublicSettings()
  }, [isAdmin, fetchPublicSettings])

  useEffect(() => {
    if (!loaded) return
    setLoginTitle(settings.login_title || '')
    setLoginSubtitle(settings.login_subtitle || '')
    setDemoButtons(settings.login_demo_buttons !== 'false')
  }, [loaded, settings])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateSettings([
        { key: 'login_title', value: loginTitle },
        { key: 'login_subtitle', value: loginSubtitle },
        { key: 'login_demo_buttons', value: String(demoButtons) },
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Настройки</h1>
        <p className="text-muted-foreground mt-2">
          Управление настройками аккаунта и интерфейса
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Уведомления
            </CardTitle>
            <CardDescription>
              Настройка способов получения уведомлений
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Почтовые уведомления</Label>
                <p className="text-xs text-muted-foreground">
                  Получать уведомления на email
                </p>
              </div>
              <Switch
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Push-уведомления</Label>
                <p className="text-xs text-muted-foreground">
                  Получать уведомления в браузере
                </p>
              </div>
              <Switch
                checked={pushNotifications}
                onCheckedChange={setPushNotifications}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {darkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              Оформление
            </CardTitle>
            <CardDescription>
              Настройка внешнего вида приложения
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Темная тема</Label>
                <p className="text-xs text-muted-foreground">
                  Использовать темное оформление
                </p>
              </div>
              <Switch
                checked={darkMode}
                onCheckedChange={toggleTheme}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              Страница входа
            </CardTitle>
            <CardDescription>
              Настройка внешнего вида и содержания страницы логина
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="login-title">Заголовок</Label>
                <Input
                  id="login-title"
                  value={loginTitle}
                  onChange={(e) => setLoginTitle(e.target.value)}
                  placeholder="Личный кабинет сотрудника"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-subtitle">Описание</Label>
                <Input
                  id="login-subtitle"
                  value={loginSubtitle}
                  onChange={(e) => setLoginSubtitle(e.target.value)}
                  placeholder="Единая платформа для..."
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Демо-кнопки быстрого входа</Label>
                <p className="text-xs text-muted-foreground">
                  Показывать кнопки для быстрого входа под тестовыми аккаунтами
                </p>
              </div>
              <Switch checked={demoButtons} onCheckedChange={setDemoButtons} />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Сохранение...</>
                ) : (
                  <><Save className="h-4 w-4" /> Сохранить</>
                )}
              </Button>
              {saved && <span className="text-sm text-emerald-600">Сохранено</span>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
