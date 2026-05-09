export function authenticateInternal(req, res, next) {
  const secret = req.headers['x-notification-secret']
  if (!secret || secret !== process.env.NOTIFICATION_SECRET) {
    return res.status(401).json({ error: 'Неверный секрет сервиса уведомлений' })
  }
  next()
}
