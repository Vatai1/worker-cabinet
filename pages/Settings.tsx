import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Bell, Moon, Sun, Send, Loader2 } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import * as telegramApi from '@/services/telegramApi'

export function Settings() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(false)
  const [telegramNotifications, setTelegramNotifications] = useState(false)
  const [telegramUsername, setTelegramUsername] = useState('')
  const [telegramConnected, setTelegramConnected] = useState(false)
  const [connectingTelegram, setConnectingTelegram] = useState(false)
  const { darkMode, toggleTheme } = useUIStore()

  useEffect(() => {
    loadTelegramStatus()
  }, [])

  async function loadTelegramStatus() {
    try {
      const status = await telegramApi.getUserTelegramStatus()
      setTelegramConnected(status.connected)
      setTelegramUsername(status.username || '')
      setTelegramNotifications(status.notificationsEnabled || false)
    } catch (error) {
      console.error('Error loading Telegram status:', error)
    }
  }

  async function handleConnectTelegram() {
    if (!telegramUsername.trim()) return

    try {
      setConnectingTelegram(true)
      await telegramApi.connectTelegram(telegramUsername)
      setTelegramConnected(true)
    } catch (error) {
      console.error('Error connecting Telegram:', error)
      alert('Ошибка при подключении Telegram')
    } finally {
      setConnectingTelegram(false)
    }
  }

  async function handleDisconnectTelegram() {
    try {
      setConnectingTelegram(true)
      await telegramApi.disconnectTelegram()
      setTelegramConnected(false)
      setTelegramUsername('')
      setTelegramNotifications(false)
    } catch (error) {
      console.error('Error disconnecting Telegram:', error)
      alert('Ошибка при отключении Telegram')
    } finally {
      setConnectingTelegram(false)
    }
  }

  async function handleToggleTelegramNotifications() {
    try {
      await telegramApi.toggleTelegramNotifications(!telegramNotifications)
      setTelegramNotifications(!telegramNotifications)
    } catch (error) {
      console.error('Error toggling Telegram notifications:', error)
      alert('Ошибка при изменении настроек уведомлений')
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
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Telegram-уведомления</Label>
                <p className="text-xs text-muted-foreground">
                  Получать уведомления в Telegram
                </p>
              </div>
              <Switch
                checked={telegramNotifications}
                onCheckedChange={handleToggleTelegramNotifications}
                disabled={!telegramConnected}
              />
            </div>
            {telegramConnected && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Подключен: </span>
                    <span className="font-medium">{telegramUsername}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnectTelegram}
                    disabled={connectingTelegram}
                    className="text-destructive hover:text-destructive"
                  >
                    {connectingTelegram && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Отключить
                  </Button>
                </div>
              </div>
            )}
            {!telegramConnected && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <Label htmlFor="telegram">Telegram username</Label>
                <Input
                  id="telegram"
                  placeholder="@username"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  className="h-9"
                  disabled={connectingTelegram}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleConnectTelegram}
                  disabled={connectingTelegram || !telegramUsername.trim()}
                >
                  {connectingTelegram ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {connectingTelegram ? 'Подключение...' : 'Подключить Telegram'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Введите ваш Telegram username, затем откройте бота и отправьте команду /start
                </p>
              </div>
            )}
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
    </div>
  )
}
