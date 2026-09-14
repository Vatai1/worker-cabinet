import { useEffect, useRef, useCallback } from 'react'
import { useWsStore } from '@/shared/store/wsStore'

interface WsMessage {
  event: string
  data: Record<string, unknown>
}

export function useNotificationWs(onUnreadCount: (count: number) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onUnreadRef = useRef(onUnreadCount)
  onUnreadRef.current = onUnreadCount

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${proto}//${window.location.host}/ws`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        if (msg.event === 'notification' && typeof msg.data.unreadCount === 'number') {
          onUnreadRef.current(msg.data.unreadCount as number)
        }
        if (msg.event === 'vacation_changed') {
          useWsStore.getState().bumpVacationEvents({
            organizationId: msg.data?.organizationId as number | undefined,
            actorId: msg.data?.actorId as number | undefined,
          })
        }
      } catch {}
    }

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 5000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connect])
}
