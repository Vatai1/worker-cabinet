import webpush from 'web-push'
import { query } from '../config/database.js'

function getConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  const enabled = Boolean(publicKey && privateKey)
  if (enabled) webpush.setVapidDetails(subject, publicKey, privateKey)
  return { enabled, publicKey }
}

export function isPushConfigured() {
  return getConfig().enabled
}

export function getPublicKey() {
  return getConfig().publicKey
}

export async function sendToUser(userId, { title, body, url }) {
  if (!getConfig().enabled) return

  let subscriptions
  try {
    const result = await query('SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1', [userId])
    subscriptions = result.rows
  } catch (err) {
    console.warn(`[PUSH] Failed to load subscriptions for user ${userId}: ${err.message}`)
    return
  }

  const payload = JSON.stringify({ title, body, url })

  for (const sub of subscriptions) {
    const pushSubscription = { endpoint: sub.endpoint, keys: sub.keys }
    try {
      await webpush.sendNotification(pushSubscription, payload)
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {})
      } else {
        console.warn(`[PUSH] sendNotification failed (user=${userId}): ${err.message}`)
      }
    }
  }
}
