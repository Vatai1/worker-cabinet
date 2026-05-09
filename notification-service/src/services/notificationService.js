import { query } from '../config/database.js'
import { sendEmail } from '../config/email.js'
import { templates } from '../templates/index.js'
import { getChannel, QUEUE } from '../config/rabbitmq.js'

export async function createNotification({ userId, type, channel, data, sendAt }) {
  const result = await query(
    `INSERT INTO notification_queue (user_id, type, channel, data, status, send_at)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING *`,
    [userId, type, channel || 'email', JSON.stringify(data || {}), sendAt || null]
  )
  return result.rows[0]
}

export async function processMessage(msg) {
  const content = JSON.parse(msg.content.toString())
  const { notificationId, userId, type, channel: ch, data } = content

  let notification

  if (notificationId) {
    const result = await query(
      'SELECT * FROM notification_queue WHERE id = $1',
      [notificationId]
    )
    if (result.rows.length === 0) {
      console.warn(`[CONSUMER] Notification ${notificationId} not found, skipping`)
      return
    }
    notification = result.rows[0]
  } else {
    notification = {
      user_id: userId,
      type,
      channel: ch || 'email',
      data: typeof data === 'string' ? data : JSON.stringify(data || {}),
    }
  }

  await query(
    `UPDATE notification_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [notification.id]
  )

  try {
    if (notification.channel === 'email') {
      await deliverEmail(notification)
    }
    await query(
      `UPDATE notification_queue SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [notification.id]
    )
    console.log(`[CONSUMER] Sent notification id=${notification.id} type=${notification.type}`)
  } catch (err) {
    console.error(`[CONSUMER] Failed id=${notification.id}:`, err.message)
    await query(
      `UPDATE notification_queue
       SET status = 'failed', error = $1, attempts = attempts + 1, updated_at = NOW()
       WHERE id = $2`,
      [err.message?.substring(0, 1000), notification.id]
    )
    throw err
  }
}

async function deliverEmail(notification) {
  const userData = await query(
    'SELECT email, first_name, last_name FROM users WHERE id = $1',
    [notification.user_id]
  )

  if (userData.rows.length === 0) {
    throw new Error(`User not found: ${notification.user_id}`)
  }

  const user = userData.rows[0]
  const data = typeof notification.data === 'string'
    ? JSON.parse(notification.data)
    : notification.data

  const templateFn = templates[notification.type] || templates.generic
  const emailContent = templateFn({ ...data, recipientName: `${user.first_name} ${user.last_name}`.trim() })

  await sendEmail({
    to: user.email,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  })
}

export function startConsumer() {
  const channel = getChannel()

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return

    try {
      await processMessage(msg)
      channel.ack(msg)
    } catch {
      channel.nack(msg, false, false)
    }
  })

  console.log(`[CONSUMER] Listening on queue "${QUEUE}"`)
}

export async function retryFailedNotifications() {
  const result = await query(
    `UPDATE notification_queue
     SET status = 'pending', updated_at = NOW()
     WHERE status = 'failed'
       AND attempts < 3
     RETURNING id`
  )
  return result.rows.length
}

export async function getNotificationStats() {
  const result = await query(
    `SELECT status, COUNT(*) as count FROM notification_queue GROUP BY status ORDER BY status`
  )
  return result.rows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count)
    return acc
  }, {})
}
