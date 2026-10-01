import { query } from '../config/database.js'
import { getPushCopy } from '../config/notificationCopy.js'
import { getNotificationUrl } from '../config/notificationTarget.js'
import { sendToUser as sendPushToUser } from '../services/pushService.js'
import { isMailConfigured, renderEmail, sendEmail } from './notificationEmail.js'

export const EMAIL_BATCH = 20
export const PUSH_BATCH = 50
const MAX_ATTEMPTS = Number(process.env.NOTIFY_MAX_ATTEMPTS) || 5
const RETRY_MINUTES = [1, 5, 30, 120, 360]
const STALE_LOCK = "INTERVAL '10 minutes'"

const mailRate = () => Number(process.env.MAIL_RATE_PER_MINUTE) || 20
let windowStart = 0
let sentInWindow = 0

function mailBudget() {
  if (Date.now() - windowStart >= 60_000) {
    windowStart = Date.now()
    sentInWindow = 0
  }
  return mailRate() - sentInWindow
}

export function retryDelayMinutes(attempt) {
  return RETRY_MINUTES[Math.min(attempt, RETRY_MINUTES.length) - 1]
}

async function claimEmails(limit) {
  const result = await query(
    `UPDATE notification_queue n
     SET status = 'processing', locked_at = NOW(), attempts = attempts + 1, updated_at = NOW()
     FROM users u
     WHERE u.id = n.user_id AND n.id IN (
       SELECT id FROM notification_queue
       WHERE channel = 'email' AND (
         (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()) AND (send_at IS NULL OR send_at <= NOW()))
         OR (status = 'processing' AND locked_at < NOW() - ${STALE_LOCK})
       )
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING n.*, u.email, u.status AS user_status`,
    [limit]
  )
  return result.rows
}

async function markEmail(id, fields) {
  const keys = Object.keys(fields)
  await query(
    `UPDATE notification_queue SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, locked_at = NULL, updated_at = NOW() WHERE id = $1`,
    [id, ...keys.map((k) => fields[k])]
  )
}

export async function deliverEmails() {
  if (!isMailConfigured()) return 0
  const limit = Math.min(EMAIL_BATCH, mailBudget())
  if (limit <= 0) return 0
  const rows = await claimEmails(limit)
  for (const n of rows) {
    if (!n.email || n.user_status === 'inactive') {
      await markEmail(n.id, { status: 'cancelled', error: n.email ? 'Сотрудник отключён' : 'Нет адреса почты' })
      continue
    }
    sentInWindow++
    try {
      await sendEmail({ to: n.email, ...renderEmail(n) })
      await markEmail(n.id, { status: 'sent', sent_at: new Date(), error: null })
    } catch (err) {
      const finalFailure = n.attempts >= MAX_ATTEMPTS
      await markEmail(n.id, {
        status: finalFailure ? 'failed' : 'pending',
        error: String(err.message || err).slice(0, 1000),
        next_attempt_at: finalFailure ? null : new Date(Date.now() + retryDelayMinutes(n.attempts) * 60_000),
      })
    }
  }
  return rows.length
}

export async function deliverPush() {
  const result = await query(
    `UPDATE notification_queue SET push_status = 'processing', push_locked_at = NOW()
     WHERE id IN (
       SELECT id FROM notification_queue
       WHERE push_status = 'pending' OR (push_status = 'processing' AND push_locked_at < NOW() - ${STALE_LOCK})
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, user_id, type, data`,
    [PUSH_BATCH]
  )
  for (const n of result.rows) {
    let status = 'sent'
    try {
      const { title, body } = getPushCopy(n.type, n.data)
      await sendPushToUser(n.user_id, { title, body, url: getNotificationUrl(n.type, n.data, n.user_id) })
    } catch {
      status = 'failed'
    }
    await query('UPDATE notification_queue SET push_status = $2, push_locked_at = NULL, push_sent_at = NOW() WHERE id = $1', [n.id, status])
  }
  return result.rows.length
}

export async function deliveryStats() {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE channel = 'email' AND status IN ('pending', 'processing'))::int AS email_pending,
       COUNT(*) FILTER (WHERE channel = 'email' AND status = 'failed')::int AS email_failed,
       COUNT(*) FILTER (WHERE channel = 'email' AND status = 'sent' AND sent_at > NOW() - INTERVAL '24 hours')::int AS email_sent_24h,
       COUNT(*) FILTER (WHERE push_status IN ('pending', 'processing'))::int AS push_pending,
       EXTRACT(EPOCH FROM NOW() - MIN(created_at) FILTER (WHERE channel = 'email' AND status IN ('pending', 'processing')))::int AS oldest_pending_seconds
     FROM notification_queue`
  )
  return { ...result.rows[0], mail_configured: isMailConfigured(), mail_rate_per_minute: mailRate() }
}

export async function retryFailedEmails() {
  const result = await query(
    `UPDATE notification_queue SET status = 'pending', attempts = 0, next_attempt_at = NULL, error = NULL, updated_at = NOW()
     WHERE channel = 'email' AND status = 'failed'`
  )
  return result.rowCount
}
