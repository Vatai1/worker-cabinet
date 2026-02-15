import { useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDateTime } from '@/lib/utils'
import { Bell, Check, CheckCheck, Trash2, Filter } from 'lucide-react'

type NotificationType = 'all' | 'unread' | 'info' | 'success' | 'warning' | 'error'

export function Notifications() {
  const { notifications, markAsRead, markAllAsRead, removeNotification } = useUIStore()
  const { user } = useAuthStore()
  const [filterType, setFilterType] = useState<NotificationType>('all')

  const userNotifications = notifications.filter((n) => n.userId === user?.id)
  const userUnreadCount = userNotifications.filter((n) => !n.read).length

  const filteredNotifications = userNotifications.filter((notification) => {
    if (filterType === 'all') return true
    if (filterType === 'unread') return !notification.read
    return notification.type === filterType
  })

  const getNotificationIcon = (type: typeof notifications[0]['type']) => {
    const icons = {
      info: 'bg-blue-500',
      success: 'bg-green-500',
      warning: 'bg-yellow-500',
      error: 'bg-red-500',
    }
    return icons[type]
  }

  const getFilterLabel = (filter: NotificationType) => {
    const labels = {
      all: 'Все',
      unread: 'Непрочитанные',
      info: 'Информация',
      success: 'Успешно',
      warning: 'Предупреждения',
      error: 'Ошибки',
    }
    return labels[filter]
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Уведомления</h1>
          <p className="text-muted-foreground">
            Ваши уведомления и обновления
          </p>
        </div>
        {userUnreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsRead}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Отметить все как прочитанные
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {(Object.keys({ all: '', unread: '', info: '', success: '', warning: '', error: '' }) as NotificationType[]).map((filter) => (
              <Button
                key={filter}
                variant={filterType === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType(filter)}
              >
                {getFilterLabel(filter)}
                {filter === 'unread' && userUnreadCount > 0 && (
                  <Badge className="ml-2" variant="secondary">
                    {userUnreadCount}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notifications list */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center">
                <Bell className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
                <p className="mt-4 text-lg font-medium">Уведомлений нет</p>
                <p className="text-sm text-muted-foreground">
                  {filterType !== 'all'
                    ? 'Нет уведомлений с выбранным фильтром'
                    : 'У вас пока нет уведомлений'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredNotifications.map((notification) => (
            <Card
              key={notification.id}
              className={`transition-colors ${
                !notification.read ? 'border-primary/50 bg-primary/5' : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${getNotificationIcon(notification.type)}`} />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className={`font-semibold ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {notification.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                      </div>
                      <Badge
                        variant={notification.read ? 'outline' : 'default'}
                        className="shrink-0"
                      >
                        {notification.read ? 'Прочитано' : 'Новое'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(notification.createdAt)}
                      </span>
                      <div className="flex gap-2">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeNotification(notification.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Всего</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userNotifications.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Непрочитанные</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userUnreadCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Прочитанные</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userNotifications.filter((n) => n.read).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Сегодня</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userNotifications.filter((n) => {
                const today = new Date().toDateString()
                return new Date(n.createdAt).toDateString() === today
              }).length}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
