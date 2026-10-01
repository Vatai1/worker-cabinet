import { listen, NOTIFICATION_CHANNEL } from './pgListen.js'
import { sendToUser, isUserConnected } from '../config/ws.js'
import { getUnreadCount } from '../config/notifications.js'

const DEBOUNCE_MS = 300

export function startUnreadCountBroadcast() {
  const pending = new Map()
  return listen(NOTIFICATION_CHANNEL, (payload) => {
    const userId = Number(payload?.user_id)
    if (!userId || pending.has(userId) || !isUserConnected(userId)) return
    pending.set(userId, setTimeout(async () => {
      pending.delete(userId)
      try {
        await sendToUser(userId, 'notification', { unreadCount: await getUnreadCount(userId) })
      } catch {}
    }, DEBOUNCE_MS))
  }, 'NOTIFY-WS')
}
