import { query } from '../config/database.js'

export async function createNotification(userId, title, message, type = 'info') {
  try {
    const result = await query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id as "userId", title, message, type, read, created_at as "createdAt"`,
      [userId, title, message, type]
    )
    return result.rows[0]
  } catch (error) {
    console.error('Error creating notification:', error)
    throw error
  }
}
