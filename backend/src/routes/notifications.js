import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'

const router = express.Router()

router.get('/my', authenticateToken, asyncHandler(async (req, res) => {
  const { page = '1', limit = '20', status } = req.query
  const offset = (Number(page) - 1) * Number(limit)

  let whereClause = 'WHERE nq.user_id = $1'
  const params = [req.user.id]

  if (status) {
    params.push(status)
    whereClause += ` AND nq.status = $${params.length}`
  }

  const result = await query(
    `SELECT nq.id, nq.type, nq.channel, nq.data, nq.status, nq.sent_at, nq.created_at
     FROM notification_queue nq
     ${whereClause}
     ORDER BY nq.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, Number(limit), offset]
  )

  const countResult = await query(
    `SELECT COUNT(*) as total FROM notification_queue nq ${whereClause}`,
    params
  )

  res.json({
    notifications: result.rows,
    total: parseInt(countResult.rows[0].total),
    page: Number(page),
    limit: Number(limit),
  })
}))

router.patch('/my/:id/read', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE notification_queue SET read_at = COALESCE(read_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [req.params.id, req.user.id]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Уведомление не найдено' })
  }
  res.json({ success: true })
}))

router.patch('/my/read-all', authenticateToken, asyncHandler(async (req, res) => {
  await query(
    `UPDATE notification_queue SET read_at = COALESCE(read_at, NOW()), updated_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.id]
  )
  res.json({ success: true })
}))

router.get('/my/unread-count', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT COUNT(*) as count FROM notification_queue
     WHERE user_id = $1 AND read_at IS NULL AND status = 'sent'`,
    [req.user.id]
  )
  res.json({ count: parseInt(result.rows[0].count) })
}))

export default router
