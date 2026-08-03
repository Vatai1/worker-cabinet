import { query } from './database.js'

const DEFAULTS = { sessionLifetime: 480, refreshLifetime: 7 }
const MAX_COOKIE_MS = 21 * 24 * 60 * 60 * 1000

export async function getAuthSettings() {
  const result = await query("SELECT settings FROM modules WHERE code = 'auth'").catch(() => ({ rows: [] }))
  const settings = result.rows[0]?.settings || {}
  const sessionLifetime = Number(settings.sessionLifetime) || DEFAULTS.sessionLifetime
  const refreshLifetime = Number(settings.refreshLifetime) || DEFAULTS.refreshLifetime
  const sessionMs = sessionLifetime * 60_000
  const refreshMs = Math.min(refreshLifetime * 86_400_000, MAX_COOKIE_MS)
  return { sessionLifetime, refreshLifetime, sessionMs, refreshMs }
}
