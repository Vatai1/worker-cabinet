import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'

export function signAccessToken(user, sessionLifetimeMinutes) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured')
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: `${sessionLifetimeMinutes}m` }
  )
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function generateRawRefreshToken() {
  return crypto.randomBytes(48).toString('hex')
}

export async function createSession({ userId, loginMethod, ip, userAgent, refreshLifetimeDays }) {
  const rawToken = generateRawRefreshToken()
  const tokenHash = hashToken(rawToken)
  const result = await query(
    `INSERT INTO user_sessions (user_id, refresh_token_hash, login_method, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval)
     RETURNING id`,
    [userId, tokenHash, loginMethod, ip || null, userAgent || null, refreshLifetimeDays]
  )
  return { rawToken, sessionId: result.rows[0].id }
}

export async function findActiveSessionByToken(rawToken) {
  if (!rawToken) return null
  const tokenHash = hashToken(rawToken)
  const result = await query(
    `SELECT s.id, s.user_id, s.login_method, s.expires_at, s.revoked_at,
            u.id AS u_id, u.email, u.role, u.status
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [tokenHash]
  )
  return result.rows[0] || null
}

export async function rotateSession(sessionId, { ip, userAgent, refreshLifetimeDays }) {
  const rawToken = generateRawRefreshToken()
  const tokenHash = hashToken(rawToken)
  await query(
    `UPDATE user_sessions
     SET refresh_token_hash = $1, last_used_at = NOW(), expires_at = NOW() + ($2 || ' days')::interval,
         ip_address = COALESCE($3, ip_address), user_agent = COALESCE($4, user_agent)
     WHERE id = $5`,
    [tokenHash, refreshLifetimeDays, ip || null, userAgent || null, sessionId]
  )
  return rawToken
}

export async function revokeSessionByToken(rawToken) {
  if (!rawToken) return
  const tokenHash = hashToken(rawToken)
  await query(`UPDATE user_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1 AND revoked_at IS NULL`, [tokenHash])
}

export async function revokeAllUserSessions(userId) {
  await query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId])
}
