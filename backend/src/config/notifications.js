import { query } from './database.js'

const NO_PUSH_TYPES = ['mailing', 'generic']

async function isModuleEnabled(db) {
  const result = await db.query("SELECT is_enabled FROM modules WHERE code = 'notifications'")
  return result.rows.length > 0 && result.rows[0].is_enabled
}

export async function getUnreadCount(userId) {
  const result = await query(
    'SELECT COUNT(*)::int AS count FROM notification_queue WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  )
  return result.rows[0].count
}

function deliveryState(type, channel) {
  return {
    status: channel === 'email' ? 'pending' : 'sent',
    pushStatus: NO_PUSH_TYPES.includes(type) ? null : 'pending',
  }
}

export async function notify({ userId, type, data, channel = 'email', db = { query } }) {
  if (!(await isModuleEnabled(db))) return null
  const { status, pushStatus } = deliveryState(type, channel)
  const result = await db.query(
    `INSERT INTO notification_queue (user_id, type, channel, data, status, push_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, type, channel, JSON.stringify(data || {}), status, pushStatus]
  )
  return result.rows[0].id
}

export async function notifyBatch({ userIds, type, data, channel = 'email', db = { query } }) {
  if (userIds.length === 0 || !(await isModuleEnabled(db))) return []
  const { status, pushStatus } = deliveryState(type, channel)
  const result = await db.query(
    `INSERT INTO notification_queue (user_id, type, channel, data, status, push_status)
     SELECT u, $2, $3, $4, $5, $6 FROM unnest($1::int[]) AS u
     RETURNING id`,
    [[...new Set(userIds.map(Number))], type, channel, JSON.stringify(data || {}), status, pushStatus]
  )
  return result.rows.map((r) => r.id)
}
