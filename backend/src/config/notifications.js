import { query } from './database.js'
import * as rabbitmq from './rabbitmq.js'

async function isModuleEnabled() {
  const result = await query(
    "SELECT is_enabled FROM modules WHERE code = 'notifications'"
  )
  return result.rows.length > 0 && result.rows[0].is_enabled
}

export async function notify({ userId, type, data, channel = 'email' }) {
  const enabled = await isModuleEnabled()
  if (!enabled) return null

  const result = await query(
    `INSERT INTO notification_queue (user_id, type, channel, data, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id`,
    [userId, type, channel, JSON.stringify(data || {})]
  )

  const notificationId = result.rows[0].id

  try {
    await rabbitmq.publishNotification({
      notificationId,
      userId,
      type,
      channel,
      data,
    })
  } catch (err) {
    console.warn(`[NOTIFY] RabbitMQ publish failed (id=${notificationId}): ${err.message}`)
  }

  return notificationId
}

export async function notifyBatch({ userIds, type, data, channel = 'email' }) {
  const enabled = await isModuleEnabled()
  if (!enabled) return []

  const ids = []
  for (const userId of userIds) {
    const id = await notify({ userId, type, data, channel })
    if (id) ids.push(id)
  }
  return ids
}
