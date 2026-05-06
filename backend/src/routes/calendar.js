import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler, NotFoundError } from '../middleware/errors.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/auth/url', asyncHandler(async (req, res) => {
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/calendar/callback'

  if (!clientId) {
    return res.json({
      connected: false,
      url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + new URLSearchParams({
        client_id: 'placeholder',
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'Calendars.Read offline_access',
        state: String(req.user.id),
      }).toString(),
    })
  }

  const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'Calendars.Read offline_access',
    state: String(req.user.id),
  }).toString()

  res.json({ url, connected: false })
}))

router.get('/auth/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query
  const userId = parseInt(String(state))

  if (!code) {
    return res.redirect('/calendar?error=no_code')
  }

  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/calendar/callback'

  if (!clientId || !clientSecret) {
    return res.redirect('/calendar?error=no_config')
  }

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: String(code),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })

  const tokens = await tokenRes.json()

  if (!tokenRes.ok) {
    console.error('Outlook token error:', tokens)
    return res.redirect('/calendar?error=token_failed')
  }

  await query(`
    INSERT INTO outlook_tokens (user_id, access_token, refresh_token, expires_at, created_at)
    VALUES ($1, $2, $3, NOW() + INTERVAL '3600 seconds', NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET access_token = $2, refresh_token = $3, expires_at = NOW() + INTERVAL '3600 seconds', created_at = NOW()
  `, [userId, tokens.access_token, tokens.refresh_token])

  res.redirect('/calendar?connected=1')
}))

router.get('/status', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT 1 FROM outlook_tokens WHERE user_id = $1',
    [req.user.id]
  )
  res.json({ connected: result.rows.length > 0 })
}))

router.get('/events', asyncHandler(async (req, res) => {
  const { start, end } = req.query

  const tokenResult = await query(
    'SELECT access_token, refresh_token, expires_at FROM outlook_tokens WHERE user_id = $1',
    [req.user.id]
  )

  if (tokenResult.rows.length === 0) {
    return res.status(404).json({ error: 'Outlook не подключен', code: 'NOT_CONNECTED' })
  }

  let { access_token, refresh_token, expires_at } = tokenResult.rows[0]

  if (new Date(expires_at) < new Date()) {
    const clientId = process.env.OUTLOOK_CLIENT_ID
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
    const redirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/calendar/callback'

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Outlook не настроен на сервере' })
    }

    const refreshRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh_token,
        grant_type: 'refresh_token',
        redirect_uri: redirectUri,
      }).toString(),
    })

    const refreshData = await refreshRes.json()
    if (!refreshRes.ok) {
      await query('DELETE FROM outlook_tokens WHERE user_id = $1', [req.user.id])
      return res.status(401).json({ error: 'Токен устарел, переподключите Outlook', code: 'NOT_CONNECTED' })
    }

    access_token = refreshData.access_token
    await query(
      'UPDATE outlook_tokens SET access_token = $1, refresh_token = $2, expires_at = NOW() + INTERVAL \'3600 seconds\' WHERE user_id = $3',
      [access_token, refreshData.refresh_token, req.user.id]
    )
  }

  const startIso = start ? new Date(String(start)).toISOString() : new Date().toISOString()
  const endIso = end ? new Date(String(end)).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const graphRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(startIso)}&endDateTime=${encodeURIComponent(endIso)}&$top=100&$select=subject,start,end,isAllDay,location,body,organizer,categories`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  )

  if (!graphRes.ok) {
    const errData = await graphRes.json()
    console.error('Graph API error:', errData)
    return res.status(502).json({ error: 'Ошибка запроса к Outlook' })
  }

  const data = await graphRes.json()
  res.json(data.value || [])
}))

router.delete('/disconnect', asyncHandler(async (req, res) => {
  await query('DELETE FROM outlook_tokens WHERE user_id = $1', [req.user.id])
  res.json({ ok: true })
}))

export default router
