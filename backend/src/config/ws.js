import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import cookie from 'cookie'
import { query } from './database.js'
import keycloakConfig from './keycloak.js'
import { verifyKeycloakToken } from '../middleware/auth.js'

const clients = new Map()
const AWAY_AFTER_MS = 5 * 60 * 1000
const LAST_SEEN_THROTTLE_MS = 60 * 1000
const lastSeenWrites = new Map()

function touchLastSeen(userId, force = false) {
  const now = Date.now()
  if (!force && now - (lastSeenWrites.get(userId) || 0) < LAST_SEEN_THROTTLE_MS) return
  lastSeenWrites.set(userId, now)
  query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [userId]).catch(() => {})
}

let wss = null

async function authenticateUser(req) {
  try {
    const cookies = cookie.parse(req.headers.cookie || '')
    const token = cookies.auth_token
    if (!token) return null

    let userId = null
    try {
      userId = jwt.verify(token, process.env.JWT_SECRET).id
    } catch {
      if (!keycloakConfig.enabled) return null
      const kcPayload = await verifyKeycloakToken(token)
      const kcUser = await query('SELECT id FROM users WHERE keycloak_guid = $1', [kcPayload.sub])
      return kcUser.rows[0] || null
    }

    const result = await query('SELECT id FROM users WHERE id = $1', [userId])
    return result.rows[0] || null
  } catch {
    return null
  }
}

export function initWsServer(server) {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://host.docker.internal:5000',
  ].filter(Boolean)

  wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 4096,
    verifyClient: (info) => {
      const origin = info.req.headers.origin
      if (!origin || allowedOrigins.includes(origin)) return true
      const host = info.req.headers.host
      if (host) {
        try {
          if (new URL(origin).hostname === host.split(':')[0]) return true
        } catch {}
      }
      return false
    },
  })

  wss.on('connection', async (ws, req) => {
    ws.connectedAt = Date.now()
    ws.lastActivityAt = 0
    ws.on('message', (raw) => {
      try {
        if (JSON.parse(raw.toString())?.event !== 'activity') return
      } catch {
        return
      }
      ws.lastActivityAt = Date.now()
      if (ws.userId) touchLastSeen(ws.userId)
    })

    const user = await authenticateUser(req)
    if (!user) {
      ws.close(4001, 'Unauthorized')
      return
    }

    const userId = user.id
    if (!clients.has(userId)) clients.set(userId, new Set())
    clients.get(userId).add(ws)
    ws.userId = userId
    touchLastSeen(userId, true)

    ws.orgIds = new Set()
    try {
      const orgs = await query('SELECT org_id FROM user_organizations WHERE user_id = $1 AND is_active = true', [userId])
      for (const row of orgs.rows) ws.orgIds.add(row.org_id)
    } catch {}

    ws.on('close', () => {
      touchLastSeen(userId, true)
      const userClients = clients.get(userId)
      if (userClients) {
        userClients.delete(ws)
        if (userClients.size === 0) clients.delete(userId)
      }
    })

    ws.on('error', () => {
      const userClients = clients.get(userId)
      if (userClients) {
        userClients.delete(ws)
        if (userClients.size === 0) clients.delete(userId)
      }
    })
  })

  console.log('[WS] WebSocket server initialized on /ws')
}

export function getPresence() {
  const now = Date.now()
  const presence = new Map()
  for (const [userId, sockets] of clients) {
    let since = Infinity
    let lastActivityAt = 0
    for (const ws of sockets) {
      since = Math.min(since, ws.connectedAt ?? now)
      lastActivityAt = Math.max(lastActivityAt, ws.lastActivityAt ?? 0)
    }
    presence.set(userId, {
      status: now - lastActivityAt < AWAY_AFTER_MS ? 'online' : 'away',
      since: new Date(since).toISOString(),
      lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : null,
    })
  }
  return presence
}

export function getActiveWsCount() {
  let count = 0
  for (const set of clients.values()) count += set.size
  return count
}

export async function sendToUser(userId, event, data) {
  const userClients = clients.get(userId)
  if (!userClients || userClients.size === 0) return false

  const message = JSON.stringify({ event, data })
  const promises = []
  for (const ws of userClients) {
    if (ws.readyState === 1) {
      promises.push(new Promise((resolve) => {
        ws.send(message, (err) => resolve(!err))
      }))
    }
  }
  const results = await Promise.all(promises)
  return results.some(Boolean)
}

export function broadcastToOrg(orgId, event, data) {
  if (!orgId) return
  const message = JSON.stringify({ event, data })
  for (const userClients of clients.values()) {
    for (const ws of userClients) {
      if (ws.readyState === 1 && ws.orgIds?.has(orgId)) {
        ws.send(message, () => {})
      }
    }
  }
}
