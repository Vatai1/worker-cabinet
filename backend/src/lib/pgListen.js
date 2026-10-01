import pg from 'pg'
import { connectionConfig } from '../config/database.js'

export const NOTIFICATION_CHANNEL = 'notification_created'

export function listen(channel, onMessage, label) {
  let client = null
  let stopped = false
  let retryMs = 1000

  const connect = async () => {
    if (stopped) return
    const current = new pg.Client(connectionConfig)
    client = current
    current.on('notification', (msg) => {
      try {
        onMessage(msg.payload ? JSON.parse(msg.payload) : null)
      } catch (err) {
        console.warn(`[${label}] bad payload: ${err.message}`)
      }
    })
    current.on('error', (err) => {
      if (client !== current) return
      console.warn(`[${label}] connection error: ${err.message}`)
      reconnect()
    })
    try {
      await current.connect()
      await current.query(`LISTEN ${channel}`)
      retryMs = 1000
    } catch (err) {
      if (client !== current) return
      console.warn(`[${label}] connect failed: ${err.message}`)
      reconnect()
    }
  }

  const reconnect = () => {
    const old = client
    client = null
    old?.end().catch(() => {})
    if (stopped) return
    setTimeout(connect, retryMs)
    retryMs = Math.min(retryMs * 2, 30_000)
  }

  connect()
  return () => {
    stopped = true
    client?.end().catch(() => {})
  }
}
