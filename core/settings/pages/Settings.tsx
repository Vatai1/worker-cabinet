import { useState, useEffect } from 'react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Switch } from '@/shared/components/ui/Switch'
import { Button } from '@/shared/components/ui/Button'
import { useUIStore } from '@/shared/store/uiStore'
import { useSiteSettingsStore } from '@/shared/store/siteSettingsStore'
import { Bell, Moon, Sun, Settings as SettingsIcon, LogIn, Save, Loader2 } from 'lucide-react'
import { getErrorMessage } from '@/shared/lib/utils'

export function Settings() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(false)
  const { darkMode, toggleTheme } = useUIStore()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const { settings, fetchPublicSettings, updateSettings } = useSiteSettingsStore()

  const [loginTitle, setLoginTitle] = useState('')
  const [loginSubtitle, setLoginSubtitle] = useState('')
  const [stat1Value, setStat1Value] = useState('')
  const [stat1Label, setStat1Label] = useState('')
  const [stat2Value, setStat2Value] = useState('')
  const [stat2Label, setStat2Label] = useState('')
  const [stat3Value, setStat3Value] = useState('')
  const [stat3Label, setStat3Label] = useState('')
  const [demoButtons, setDemoButtons] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPublicSettings()
  }, [fetchPublicSettings])

  useEffect(() => {
    if (settings.login_title) {
      setLoginTitle(settings.login_title)
      setLoginSubtitle(settings.login_subtitle || '')
      setStat1Value(settings.login_stat_1_value || '')
      setStat1Label(settings.login_stat_1_label || '')
      setStat2Value(settings.login_stat_2_value || '')
      setStat2Label(settings.login_stat_2_label || '')
      setStat3Value(settings.login_stat_3_value || '')
      setStat3Label(settings.login_stat_3_label || '')
      setDemoButtons(settings.login_demo_buttons !== 'false')
    }
  }, [settings])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateSettings([
        { key: 'login_title', value: loginTitle },
        { key: 'login_subtitle', value: loginSubtitle },
        { key: 'login_stat_1_value', value: stat1Value },
        { key: 'login_stat_1_label', value: stat1Label },
        { key: 'login_stat_2_value', value: stat2Value },
        { key: 'login_stat_2_label', value: stat2Label },
        { key: 'login_stat_3_value', value: stat3Value },
        { key: 'login_stat_3_label', value: stat3Label },
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
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 bg-primary/10 rounded-xl text-primary">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Настройки</h1>
            <p className="text-sm text-muted-foreground">
              Управление настройками аккаунта и интерфейса
            </p>
          </div>
        </div>
      </div>

      <div className="page-grid grid gap-6 md:grid-cols-2">
        <Card className="section-card stagger-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 bg-primary/10 rounded-lg">
                <Bell className="h-3.5 w-3.5 text-primary" />
              </div>
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

        <Card className="section-card stagger-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 bg-primary/10 rounded-lg">
                {darkMode ? <Moon className="h-3.5 w-3.5 text-primary" /> : <Sun className="h-3.5 w-3.5 text-primary" />}
              </div>
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
        <Card className="section-card stagger-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 bg-primary/10 rounded-lg">
                <LogIn className="h-3.5 w-3.5 text-primary" />
              </div>
              Страница входа
            </CardTitle>
            <CardDescription>
              Настройка внешнего вида и содержания страницы логина
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="login-title">Заголовок</Label>
                <Input
                  id="login-title"
                  value={loginTitle}
                  onChange={(e) => setLoginTitle(e.target.value)}
                  placeholder="Личный кабинет сотрудника"
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="login-subtitle">Описание</Label>
                <Input
                  id="login-subtitle"
                  value={loginSubtitle}
                  onChange={(e) => setLoginSubtitle(e.target.value)}
                  placeholder="Единая платформа для..."
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-3">Блок статистики</p>
              <div className="grid gap-4 grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Блок 1</p>
                  <Input
                    value={stat1Value}
                    onChange={(e) => setStat1Value(e.target.value)}
                    placeholder="24"
                  />
                  <Input
                    value={stat1Label}
                    onChange={(e) => setStat1Label(e.target.value)}
                    placeholder="дня отпуска"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Блок 2</p>
                  <Input
                    value={stat2Value}
                    onChange={(e) => setStat2Value(e.target.value)}
                    placeholder="156"
                  />
                  <Input
                    value={stat2Label}
                    onChange={(e) => setStat2Label(e.target.value)}
                    placeholder="сотрудников"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Блок 3</p>
                  <Input
                    value={stat3Value}
                    onChange={(e) => setStat3Value(e.target.value)}
                    placeholder="12"
                  />
                  <Input
                    value={stat3Label}
                    onChange={(e) => setStat3Label(e.target.value)}
                    placeholder="отделов"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/50 p-4">
              <div className="space-y-0.5">
                <Label>Демо-кнопки быстрого входа</Label>
                <p className="text-xs text-muted-foreground">
                  Показывать кнопки для быстрого входа под тестовыми аккаунтами
                </p>
              </div>
              <Switch
                checked={demoButtons}
                onCheckedChange={setDemoButtons}
              />
            </div>

            {error && (
              <div className="rounded-xl bg-destructive/15 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Сохранить
                  </>
                )}
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                  Сохранено
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
