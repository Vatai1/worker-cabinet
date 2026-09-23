import { getNotificationTarget, type NotificationLike } from '@/shared/lib/notificationTarget'
import { markNotificationRead } from '@/shared/lib/notificationsApi'

interface ClickableNotification extends NotificationLike {
  id: number
  read_at?: string | null
}

export async function openNotification(
  n: ClickableNotification,
  navigate: (path: string) => void,
  currentUserId?: string | number | null
): Promise<boolean> {
  const target = getNotificationTarget(n, currentUserId)
  if (target) navigate(target.path)
  if (n.read_at) return false
  await markNotificationRead(n.id).catch(() => {})
  return true
}
