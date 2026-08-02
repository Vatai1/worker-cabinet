import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import cookie from 'cookie'
import { query } from './database.js'
import keycloakConfig from './keycloak.js'

const clients = new Map()

let wss = null

async function authenticateUser(req) {
  try {
    const cookies = cookie.parse(req.headers.cookie || '')
    const token = cookies.auth_token
    if (!token) return null

    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch {}

    if (decoded?.scope === 'assistant') {
      const result = await query('SELECT id FROM users WHERE id = $1', [decoded.id])
      return result.rows[0] || null
    }

    if (keycloakConfig.enabled) {
      return null
    }

    decoded = jwt.verify(token, process.env.JWT_SECRET)
    const result = await query('SELECT id FROM users WHERE id = $1', [decoded.id])
    return result.rows[0] || null
  } catch {
    return null
  }
}

export function initWsServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', async (ws, req) => {
    const user = await authenticateUser(req)
    if (!user) {
      ws.close(4001, 'Unauthorized')
      return
    }

    const userId = user.id
    if (!clients.has(userId)) clients.set(userId, new Set())
    clients.get(userId).add(ws)

    ws.on('close', () => {
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
