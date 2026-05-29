import { useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Label } from '@/shared/components/ui/Label'
import { Switch } from '@/shared/components/ui/Switch'
import { useUIStore } from '@/shared/store/uiStore'

import { Bell, Moon, Sun, Settings as SettingsIcon } from 'lucide-react'

export function Settings() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(false)
  const { darkMode, toggleTheme } = useUIStore()

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
    </div>
  )
}
