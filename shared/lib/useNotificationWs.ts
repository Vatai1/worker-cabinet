import { useEffect, useRef, useCallback } from 'react'
import { useWsStore } from '@/shared/store/wsStore'
import { tryRefresh } from '@/shared/lib/apiClient'

const WS_UNAUTHORIZED = 4001
const BASE_RECONNECT_MS = 5000
const MAX_RECONNECT_MS = 60000

interface WsMessage {
  event: string
  data: Record<string, unknown>
}

export function useNotificationWs(onUnreadCount: (count: number) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onUnreadRef = useRef(onUnreadCount)
  onUnreadRef.current = onUnreadCount
  const attemptsRef = useRef(0)
  const authRetriedRef = useRef(false)
  const stoppedRef = useRef(false)

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${proto}//${window.location.host}/ws`

    if (stoppedRef.current) return
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    const scheduleReconnect = (delay: number) => {
      if (stoppedRef.current) return
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onopen = () => {
      attemptsRef.current = 0
      authRetriedRef.current = false
    }

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

    ws.onclose = (event) => {
      if (event.code === WS_UNAUTHORIZED) {
        if (authRetriedRef.current) return
        authRetriedRef.current = true
        tryRefresh().then((refreshed) => {
          if (refreshed) scheduleReconnect(1000)
        })
        return
      }
      const delay = Math.min(BASE_RECONNECT_MS * 2 ** attemptsRef.current, MAX_RECONNECT_MS)
      attemptsRef.current += 1
      scheduleReconnect(delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    stoppedRef.current = false
    connect()
    return () => {
      stoppedRef.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connect])
}
