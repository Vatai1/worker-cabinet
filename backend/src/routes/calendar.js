import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler, ValidationError } from '../middleware/errors.js'
import { encrypt, decrypt, fetchEwsEvents, fetchEwsEventBody, testEwsConnection } from '../services/ewsService.js'

const router = express.Router()

router.use(authenticateToken)

/**
 * @swagger
 * /calendar/auth/url:
 *   get:
 *     tags: [Calendar]
 *     summary: Получить URL авторизации Outlook
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: URL для OAuth2 авторизации
 */
router.get('/auth/url', asyncHandler(async (req, res) => {
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/calendar/callback'

  if (!clientId) {
    return res.json({ connected: false, url: '' })
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

  if (!code) return res.redirect('/calendar?error=no_code')

  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/calendar/callback'

  if (!clientId || !clientSecret) return res.redirect('/calendar?error=no_config')

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, code: String(code),
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }).toString(),
  })

  const tokens = await tokenRes.json()
  if (!tokenRes.ok) return res.redirect('/calendar?error=token_failed')

  await query(`
    INSERT INTO outlook_tokens (user_id, access_token, refresh_token, expires_at, created_at)
    VALUES ($1, $2, $3, NOW() + INTERVAL '3600 seconds', NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET access_token = $2, refresh_token = $3, expires_at = NOW() + INTERVAL '3600 seconds', created_at = NOW()
  `, [userId, tokens.access_token, tokens.refresh_token])

  res.redirect('/calendar?connected=1')
}))

/**
 * @swagger
 * /calendar/status:
 *   get:
 *     tags: [Calendar]
 *     summary: Получить статус подключения календаря
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Статус подключения
 */
router.get('/status', asyncHandler(async (req, res) => {
  const graphResult = await query('SELECT 1 FROM outlook_tokens WHERE user_id = $1', [req.user.id])
  const graphConnected = graphResult.rows.length > 0

  const ewsResult = await query('SELECT ews_url, username, domain FROM exchange_credentials WHERE user_id = $1', [req.user.id])
  const ewsConnected = ewsResult.rows.length > 0

  res.json({
    connected: graphConnected || ewsConnected,
    graphConnected,
    ewsConnected,
    ewsConfig: ewsConnected ? { url: ewsResult.rows[0].ews_url, username: ewsResult.rows[0].username, domain: ewsResult.rows[0].domain } : null,
  })
}))

/**
 * @swagger
 * /calendar/ews/connect:
 *   post:
 *     tags: [Calendar]
 *     summary: Подключить Exchange (EWS)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, username, password]
 *             properties:
 *               url: { type: string }
 *               username: { type: string }
 *               password: { type: string }
 *               domain: { type: string }
 *     responses:
 *       200:
 *         description: EWS подключён
 */
router.post('/ews/connect', asyncHandler(async (req, res) => {
  const { url, username, password, domain } = req.body

  if (!url?.trim() || !username?.trim() || !password) {
    throw new ValidationError('Укажите URL, логин и пароль')
  }

  const test = await testEwsConnection(url.trim(), username.trim(), password, domain || '')
  if (!test.ok) {
    return res.status(400).json({ error: 'Не удалось подключиться: ' + test.error, code: 'EWS_CONNECTION_FAILED' })
  }

  const encryptedPassword = encrypt(password)

  await query(`
    INSERT INTO exchange_credentials (user_id, ews_url, username, password_encrypted, domain, connected_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET ews_url = $2, username = $3, password_encrypted = $4, domain = $5, connected_at = NOW()
  `, [req.user.id, url.trim(), username.trim(), encryptedPassword, domain || ''])

  res.json({ ok: true })
}))

/**
 * @swagger
 * /calendar/ews/disconnect:
 *   delete:
 *     tags: [Calendar]
 *     summary: Отключить Exchange (EWS)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: EWS отключён
 */
router.delete('/ews/disconnect', asyncHandler(async (req, res) => {
  await query('DELETE FROM exchange_credentials WHERE user_id = $1', [req.user.id])
  res.json({ ok: true })
}))

/**
 * @swagger
 * /calendar/events:
 *   get:
 *     tags: [Calendar]
 *     summary: Получить события календаря
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: end
 *         required: true
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Список событий
 */
router.get('/events', asyncHandler(async (req, res) => {
  const { start, end } = req.query
  const startIso = start ? new Date(String(start)).toISOString() : new Date().toISOString()
  const endIso = end ? new Date(String(end)).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const allEvents = []

  const graphResult = await query('SELECT access_token, refresh_token, expires_at FROM outlook_tokens WHERE user_id = $1', [req.user.id])
  if (graphResult.rows.length > 0) {
    try {
      const graphEvents = await fetchGraphEvents(req.user.id, graphResult.rows[0], startIso, endIso)
      allEvents.push(...graphEvents)
    } catch (err) { console.error('[Graph] fetch error:', err.message) }
  }

  const ewsResult = await query('SELECT ews_url, username, password_encrypted, domain FROM exchange_credentials WHERE user_id = $1', [req.user.id])
  if (ewsResult.rows.length > 0) {
    try {
      const row = ewsResult.rows[0]
      const password = decrypt(row.password_encrypted)
      const ewsEvents = await fetchEwsEvents(row.ews_url, row.username, password, row.domain, startIso, endIso)
      allEvents.push(...ewsEvents.map(e => ({ ...e, source: 'ews' })))
    } catch (err) {
      console.error('[EWS] fetch error:', err.message)
    }
  }

  res.json(allEvents)
}))

/**
 * @swagger
 * /calendar/ews/event-body/{id}:
 *   get:
 *     tags: [Calendar]
 *     summary: Получить тело события EWS
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: ck
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Тело события
 */
router.get('/ews/event-body/:id', asyncHandler(async (req, res) => {
  const ewsResult = await query('SELECT ews_url, username, password_encrypted, domain FROM exchange_credentials WHERE user_id = $1', [req.user.id])
  if (ewsResult.rows.length === 0) return res.json({ body: undefined, attendees: undefined })

  const row = ewsResult.rows[0]
  const password = decrypt(row.password_encrypted)
  const details = await fetchEwsEventBody(row.ews_url, row.username, password, row.domain, req.params.id, req.query.ck || '')
  res.json(details)
}))

async function fetchGraphEvents(userId, tokenRow, startIso, endIso) {
  let { access_token, refresh_token, expires_at } = tokenRow

  if (new Date(expires_at) < new Date()) {
    const clientId = process.env.OUTLOOK_CLIENT_ID
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
    const redirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/calendar/callback'
    if (!clientId || !clientSecret) return []

    const refreshRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, refresh_token: refresh_token,
        grant_type: 'refresh_token', redirect_uri: redirectUri,
      }).toString(),
    })

    const refreshData = await refreshRes.json()
    if (!refreshRes.ok) {
      await query('DELETE FROM outlook_tokens WHERE user_id = $1', [userId])
      return []
    }

    access_token = refreshData.access_token
    await query(
      "UPDATE outlook_tokens SET access_token = $1, refresh_token = $2, expires_at = NOW() + INTERVAL '3600 seconds' WHERE user_id = $3",
      [access_token, refreshData.refresh_token, userId]
    )
  }

  const graphRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(startIso)}&endDateTime=${encodeURIComponent(endIso)}&$top=100&$select=subject,start,end,isAllDay,location,body,bodyPreview,organizer,categories,attendees,webLink,sensitivity,importance,responseStatus,recurrence,createdDateTime,lastModifiedDateTime,isCancelled,isOrganizer,onlineMeetingUrl,onlineMeeting,reminderMinutesBeforeStart,isReminderOn,responseRequested,showAs,type,hasAttachments,iCalUId,seriesMasterId`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  )

  if (!graphRes.ok) return []
  const data = await graphRes.json()
  return (data.value || []).map(e => ({ ...e, source: 'graph' }))
}

/**
 * @swagger
 * /calendar/disconnect:
 *   delete:
 *     tags: [Calendar]
 *     summary: Отключить календарь (Outlook)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Календарь отключён
 */
router.delete('/disconnect', asyncHandler(async (req, res) => {
  await query('DELETE FROM outlook_tokens WHERE user_id = $1', [req.user.id])
  res.json({ ok: true })
}))

export default router
