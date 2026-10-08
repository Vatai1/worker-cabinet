import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Label } from '@/shared/components/ui/Label'
import { Switch } from '@/shared/components/ui/Switch'
import { Bell, FileText, Moon, Sun } from 'lucide-react'
import { useUIStore } from '@/shared/store/uiStore'
import { fetchPushConfig, isSubscribed, subscribePush, unsubscribePush } from '@/shared/lib/push'
import { readLocalPref, writeLocalPref } from '@/shared/lib/localPrefs'
import { NameGenitiveCard } from '@/shared/components/NameGenitive'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'

const PUSH_PREF_KEY = 'pushNotifications'

export function Settings() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotificationsState] = useState(() => readLocalPref(PUSH_PREF_KEY) === 'true')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushPublicKey, setPushPublicKey] = useState('')
  const [pushLoading, setPushLoading] = useState(false)
  const { darkMode, toggleTheme } = useUIStore()
  const [hideDepartment, setHideDepartment] = useState<boolean | null>(null)
  const [savingHideDepartment, setSavingHideDepartment] = useState(false)

  useEffect(() => {
    apiGet<{ hide_department_in_documents: boolean }>('/users/me/document-preferences')
      .then((p) => setHideDepartment(p.hide_department_in_documents))
      .catch(() => setHideDepartment(false))
  }, [])

  const handleHideDepartment = async (checked: boolean) => {
    setSavingHideDepartment(true)
    setHideDepartment(checked)
    try {
      await apiPut('/users/me/document-preferences', { hide_department_in_documents: checked })
      toast.success(checked ? 'Отдел не будет указываться в заявлениях' : 'Отдел будет указываться в заявлениях')
    } catch (err) {
      setHideDepartment(!checked)
      toast.error(getErrorMessage(err))
    } finally {
      setSavingHideDepartment(false)
    }
  }

  const setPushNotifications = (value: boolean) => {
    writeLocalPref(PUSH_PREF_KEY, String(value))
    setPushNotificationsState(value)
  }

  useEffect(() => {
    fetchPushConfig().then(({ enabled, publicKey }) => {
      setPushEnabled(enabled)
      setPushPublicKey(publicKey)
      if (!enabled) return
      if (readLocalPref(PUSH_PREF_KEY) !== 'true') return
      isSubscribed()
        .then((subscribed) => {
          if (subscribed) return
          writeLocalPref(PUSH_PREF_KEY, 'false')
          setPushNotificationsState(false)
        })
        .catch(() => {})
    })
  }, [])

  const handlePushToggle = async (checked: boolean) => {
    setPushLoading(true)
    try {
      if (checked) {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          toast.error('Разрешение на уведомления не выдано')
          setPushNotifications(false)
          return
        }
        await subscribePush(pushPublicKey)
        setPushNotifications(true)
      } else {
        await unsubscribePush()
        setPushNotifications(false)
      }
    } catch {
      toast.error('Не удалось изменить подписку на push-уведомления')
    } finally {
      setPushLoading(false)
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
                  {pushEnabled
                    ? 'Приходят даже при закрытой вкладке'
                    : 'Не настроено на сервере'}
                </p>
              </div>
              <Switch
                checked={pushNotifications}
                onCheckedChange={handlePushToggle}
                disabled={!pushEnabled || pushLoading}
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Заявления
            </CardTitle>
            <CardDescription>
              Что указывать в формируемых заявлениях
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="hide-department">Не указывать отдел</Label>
                <p className="text-xs text-muted-foreground">
                  Название отдела не будет подставляться в заявления на отпуск и перенос
                </p>
              </div>
              <Switch
                id="hide-department"
                checked={!!hideDepartment}
                onCheckedChange={handleHideDepartment}
                disabled={hideDepartment === null || savingHideDepartment}
              />
            </div>
          </CardContent>
        </Card>

        <NameGenitiveCard />
      </div>
    </div>
  )
}
