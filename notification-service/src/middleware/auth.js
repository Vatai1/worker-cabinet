import crypto from 'node:crypto'

export function authenticateInternal(req, res, next) {
  const secret = req.headers['x-notification-secret']
  const expected = process.env.NOTIFICATION_SECRET
  if (!secret || !expected) {
    return res.status(401).json({ error: 'Неверный секрет сервиса уведомлений' })
  }
  try {
    const a = Buffer.from(secret, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Неверный секрет сервиса уведомлений' })
    }
  } catch {
    return res.status(401).json({ error: 'Неверный секрет сервиса уведомлений' })
  }
  next()
}
