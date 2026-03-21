import { query } from '../config/database.js'

export async function createNotification(userId, title, message, type = 'info', link = null) {
  try {
    const result = await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id as "userId", title, message, type, read, link, created_at as "createdAt"`,
      [userId, title, message, type, link]
    )
    return result.rows[0]
  } catch (error) {
    console.error('Error creating notification:', error)
    throw error
  }
}
