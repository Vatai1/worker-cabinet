import express from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { validateLogin, validateRegister, sanitizeInput } from '../middleware/validation.js'
import { asyncHandler, ValidationError, UnauthorizedError, ForbiddenError } from '../middleware/errors.js'
import { authenticateToken, logScopes, verifyKeycloakToken, findOrCreateUser, ACCOUNT_DISABLED_MESSAGE } from '../middleware/auth.js'
import { isRealSuperadmin, signValue, testCookieOptions, TEST_PREVIEW_ROLES, getTestDataState } from '../utils/testScope.js'
import { personName } from '../utils/personName.js'
import keycloakConfig, { getTokenEndpoint, getPublicAuthUrl, getPublicLogoutUrl } from '../config/keycloak.js'
import { getAuthSettings } from '../config/authSettings.js'
import { signAccessToken, createSession, findActiveSessionByToken, isRecentlyRotatedToken, rotateSession, revokeSessionByToken } from '../lib/sessionTokens.js'

const router = express.Router()

router.use(sanitizeInput)

router.get('/config', asyncHandler(async (req, res) => {
  const { sessionLifetime } = await getAuthSettings()
  if (!keycloakConfig.enabled) {
    return res.json({ keycloak: false, sessionLifetime })
  }

  res.json({
    keycloak: true,
    sessionLifetime,
    authUrl: `${getPublicAuthUrl()}?client_id=${keycloakConfig.clientId}&response_type=code&scope=openid cabinet&prompt=login`,
    tokenUrl: `${keycloakConfig.publicUrl}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`,
    logoutUrl: getPublicLogoutUrl(process.env.FRONTEND_URL || '/'),
    clientId: keycloakConfig.clientId,
  })
}))

router.post('/callback', asyncHandler(async (req, res) => {
  const { code, code_verifier, redirect_uri } = req.body

  if (!code || !code_verifier) {
    throw new ValidationError('Отсутствует код или PKCE verifier')
  }

  const tokenRes = await fetch(getTokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect_uri || `${process.env.PUBLIC_URL || 'http://localhost:3000'}/auth/callback`,
      client_id: keycloakConfig.clientId,
      client_secret: keycloakConfig.clientSecret,
      code_verifier,
    }),
  })

  if (!tokenRes.ok) {
    const errBody = await tokenRes.json().catch(() => ({}))
    console.error('[KC] token exchange failed:', tokenRes.status, JSON.stringify(errBody))
    throw new ValidationError(errBody.error_description || 'Ошибка обмена токена')
  }

  const tokenData = await tokenRes.json()

  // KC is used here only to establish identity (this one exchange). From this point on,
  // the session is entirely our own: our JWT access token + our own DB-backed refresh token.
  const kcPayload = await verifyKeycloakToken(tokenData.access_token)
  const user = await findOrCreateUser(kcPayload)
  const statusRow = (await query('SELECT status FROM users WHERE id = $1', [user.id])).rows[0]
  if (statusRow?.status === 'inactive') throw new ForbiddenError(ACCOUNT_DISABLED_MESSAGE)

  const { sessionLifetime, sessionMs, refreshLifetime, refreshMs } = await getAuthSettings()
  const accessToken = signAccessToken(user, sessionLifetime)
  const { rawToken: refreshToken } = await createSession({
    userId: user.id,
    loginMethod: 'keycloak',
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
    refreshLifetimeDays: refreshLifetime,
  })

  await query(
    `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, ip_address) VALUES ($1, $2, 'login', 'user', $3, $4)`,
    [user.id, personName(user), String(user.id), getClientIp(req)]
  ).catch(() => {})

  res.cookie('auth_token', accessToken, { ...cookieOptions(req), maxAge: sessionMs })
  res.cookie('auth_refresh_token', refreshToken, { ...cookieOptions(req), maxAge: refreshMs })

  // kept only so /auth/logout can redirect through Keycloak's end-session endpoint (SSO logout)
  if (tokenData.id_token) {
    res.cookie('kc_id_token', tokenData.id_token, { ...cookieOptions(req), maxAge: refreshMs })
  }

  res.json({ success: true })
}))

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Обновить access token по собственному refresh-токену
 *     description: 'Использует auth_refresh_token из httpOnly cookie (наша БД-сессия, не зависит от Keycloak). Ротирует refresh-токен и выдаёт новый access-токен.'
 *     responses:
 *       200:
 *         description: Токен обновлён
 *       401:
 *         description: 'Refresh token истёк, отозван или отсутствует'
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.auth_refresh_token
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' })
  }

  const session = await findActiveSessionByToken(refreshToken)
  if (!session && await isRecentlyRotatedToken(refreshToken)) {
    return res.json({ success: true })
  }
  if (!session || session.status !== 'active') {
    res.clearCookie('auth_token', cookieOptions(req))
    res.clearCookie('auth_refresh_token', cookieOptions(req))
    return res.status(401).json({ error: 'Refresh token expired' })
  }

  const { sessionLifetime, sessionMs, refreshLifetime, refreshMs } = await getAuthSettings()

  const accessToken = signAccessToken({ id: session.user_id, email: session.email, role: session.role }, sessionLifetime)
  const newRefreshToken = await rotateSession(session.id, {
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
    refreshLifetimeDays: refreshLifetime,
  })

  res.cookie('auth_token', accessToken, { ...cookieOptions(req), maxAge: sessionMs })
  res.cookie('auth_refresh_token', newRefreshToken, { ...cookieOptions(req), maxAge: refreshMs })

  res.json({ success: true })
}))

function cookieOptions(req) {
  return {
    httpOnly: true,
    secure: req.protocol === 'https',
    sameSite: req.protocol === 'https' ? 'strict' : 'lax',
    path: '/',
  }
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
}

router.post('/logout', asyncHandler(async (req, res) => {
  const opts = cookieOptions(req)
  await revokeSessionByToken(req.cookies?.auth_refresh_token)

  if (keycloakConfig.enabled) {
    const idToken = req.cookies?.kc_id_token
    let logoutUrl = getPublicLogoutUrl(process.env.FRONTEND_URL || '/')
    if (idToken) {
      logoutUrl += `&id_token_hint=${encodeURIComponent(idToken)}`
    }
    res.clearCookie('auth_token', opts)
    res.clearCookie('auth_refresh_token', opts)
    res.clearCookie('kc_id_token', opts)
    res.clearCookie('imp_user', opts)
    res.clearCookie('preview_role', opts)
    res.json({ logoutUrl })
  } else {
    res.clearCookie('auth_token', opts)
    res.clearCookie('auth_refresh_token', opts)
    res.clearCookie('imp_user', opts)
    res.clearCookie('preview_role', opts)
    res.json({ success: true })
  }
}))

router.post('/register', authLimiter, validateRegister, asyncHandler(async (req, res) => {
  if (keycloakConfig.enabled) throw new UnauthorizedError('Используйте авторизацию через Keycloak')
  const { email, password, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate } = req.body

  const existingUser = await query('SELECT id FROM users WHERE email = $1', [email])
  if (existingUser.rows.length > 0) throw new ValidationError('Email уже зарегистрирован')

  const passwordHash = await bcrypt.hash(password, 10)

  const result = await query(
    `INSERT INTO users
     (email, password_hash, first_name, last_name, middle_name, position, department_id, phone, birth_date, hire_date, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'employee')
     RETURNING id, email, first_name, last_name, middle_name, position, department_id, role, created_at`,
    [email, passwordHash, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate]
  )

  const user = result.rows[0]
  await query('INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)', [user.id])
  await query(
    `UPDATE vacation_balances SET travel_next_available_date = hire_date + INTERVAL '2 years'
     FROM users WHERE users.id = vacation_balances.user_id AND travel_next_available_date IS NULL`
  ).catch(() => {})

  const { sessionLifetime, sessionMs, refreshLifetime, refreshMs } = await getAuthSettings()
  const token = signAccessToken(user, sessionLifetime)
  const { rawToken: refreshToken } = await createSession({
    userId: user.id,
    loginMethod: 'password',
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
    refreshLifetimeDays: refreshLifetime,
  })

  res.status(201)
    .cookie('auth_token', token, { ...cookieOptions(req), maxAge: sessionMs })
    .cookie('auth_refresh_token', refreshToken, { ...cookieOptions(req), maxAge: refreshMs })
    .json({
      token,
      user: {
        id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
        middleName: user.middle_name, position: user.position, departmentId: user.department_id, role: user.role,
      },
    })
}))

router.post('/login', authLimiter, validateLogin, asyncHandler(async (req, res) => {
  if (keycloakConfig.enabled) throw new UnauthorizedError('Используйте авторизацию через Keycloak')
  const { email, password } = req.body
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip

  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.middle_name,
       u.position, u.department_id, u.phone, u.birth_date, u.hire_date,
       u.status, u.role, u.manager_id, u.avatar, u.failed_login_count, u.locked_until,
       d.name as department_name, d.manager_id as department_manager_id
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.email = $1 AND u.is_test = false`,
    [email]
  )

  if (result.rows.length === 0) {
    await query(`INSERT INTO failed_login_attempts (email, ip_address) VALUES ($1, $2)`, [email, ip]).catch(() => {})
    throw new UnauthorizedError('Неверный email или пароль')
  }

  const user = result.rows[0]

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new UnauthorizedError('Аккаунт временно заблокирован. Обратитесь к администратору.')
  }

  const validPassword = await bcrypt.compare(password, user.password_hash)

  if (!validPassword) {
    const newCount = (user.failed_login_count || 0) + 1
    const lockThreshold = 5
    if (newCount >= lockThreshold) {
      await query(`UPDATE users SET failed_login_count = $1, locked_until = NOW() + interval '30 minutes' WHERE id = $2`, [newCount, user.id])
    } else {
      await query(`UPDATE users SET failed_login_count = $1 WHERE id = $2`, [newCount, user.id])
    }
    await query(`INSERT INTO failed_login_attempts (email, ip_address) VALUES ($1, $2)`, [email, ip]).catch(() => {})
    throw new UnauthorizedError('Неверный email или пароль')
  }

  if (user.failed_login_count > 0 || user.locked_until) {
    await query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [user.id])
  }

  if (user.status === 'inactive') throw new ForbiddenError(ACCOUNT_DISABLED_MESSAGE)

  const { sessionLifetime, sessionMs, refreshLifetime, refreshMs } = await getAuthSettings()
  const token = signAccessToken(user, sessionLifetime)
  const { rawToken: refreshToken } = await createSession({
    userId: user.id,
    loginMethod: 'password',
    ip,
    userAgent: req.headers['user-agent'],
    refreshLifetimeDays: refreshLifetime,
  })

  await query(
    `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, ip_address) VALUES ($1, $2, 'login', 'user', $3, $4)`,
    [user.id, personName(user), String(user.id), ip]
  ).catch(() => {})

  let subordinates = []
  if (user.role === 'manager' || user.role === 'hr' || user.role === 'admin') {
    const subordinatesResult = await query('SELECT id FROM users WHERE manager_id = $1', [user.id])
    subordinates = subordinatesResult.rows.map(row => row.id)
  }

  res
    .cookie('auth_token', token, { ...cookieOptions(req), maxAge: sessionMs })
    .cookie('auth_refresh_token', refreshToken, { ...cookieOptions(req), maxAge: refreshMs })
    .json({
      token,
      user: {
        id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
        middleName: user.middle_name, position: user.position, department: user.department_name,
        departmentId: user.department_id, phone: user.phone, birthDate: user.birth_date,
        hireDate: user.hire_date, status: user.status, role: user.role,
        managerId: user.manager_id, subordinates, avatar: user.avatar,
      },
    })
}))

function requireRealSuper(req, res, next) {
  if (isRealSuperadmin(req)) return next()
  throw new UnauthorizedError('Недоступно')
}

async function logImpersonation(req, action, target, mode) {
  const actor = req.realUser || req.user
  await query(
    `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, ip_address) VALUES ($1, $2, $3, 'user', $4, $5, $6)`,
    [actor.id, personName(actor), action, String(target.id), JSON.stringify({ targetName: personName(target), mode }), getClientIp(req)]
  ).catch((err) => console.error('[AUDIT LOG ERROR]', err.message))
}

function impersonationMode(req) {
  if (req.impersonatedRealUser) return 'view'
  if (req.impersonatedTestUser) return 'test'
  return null
}

/**
 * @swagger
 * /auth/view-as/search:
 *   get:
 *     tags: [Auth]
 *     summary: Поиск пользователя для просмотра кабинета от его лица (суперадмин)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: q, in: query, required: true, schema: { type: string }, description: 'ФИО, email или должность, от 2 символов' }
 *     responses:
 *       200:
 *         description: 'До 20 активных пользователей: id, firstName, lastName, middleName, email, position, department, role, isTest'
 */
router.get('/view-as/search', authenticateToken, requireRealSuper, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  const like = `%${q}%`
  const result = await query(
    `SELECT u.id, u.first_name, u.last_name, u.middle_name, u.email, u.position, u.role, u.is_test, d.name AS department_name
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.status = 'active' AND u.id <> $2
       AND (u.last_name || ' ' || u.first_name || ' ' || COALESCE(u.middle_name, '') ILIKE $1
            OR u.first_name || ' ' || u.last_name ILIKE $1 OR u.email ILIKE $1 OR u.position ILIKE $1)
     ORDER BY u.is_test, u.last_name, u.first_name
     LIMIT 20`,
    [like, (req.realUser || req.user).id]
  )
  res.json(result.rows.map((u) => ({
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    middleName: u.middle_name,
    email: u.email,
    position: u.position,
    department: u.department_name,
    role: u.role,
    isTest: u.is_test === true,
  })))
}))

/**
 * @swagger
 * /auth/view-as:
 *   post:
 *     tags: [Auth]
 *     summary: Посмотреть кабинет от лица пользователя (суперадмин, включая другой аккаунт суперадмина — только просмотр)
 *     description: 'Для реального пользователя включается режим «только просмотр» — любые изменяющие запросы отклоняются с 403 VIEW_ONLY. За тестовых пользователей доступен полный вход. Вход и выход пишутся в журнал аудита'
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: integer }
 *     responses:
 *       200:
 *         description: '{ success, userId, viewOnly }'
 *       400:
 *         description: Пользователь неактивен или это вы сами
 */
router.post('/view-as', authenticateToken, requireRealSuper, asyncHandler(async (req, res) => {
  const userId = parseInt(req.body?.userId, 10)
  if (!Number.isInteger(userId)) throw new ValidationError('userId обязателен')
  const actorId = (req.realUser || req.user).id
  const target = (await query(
    `SELECT id, first_name, last_name, middle_name, status, role, is_test FROM users WHERE id = $1`,
    [userId]
  )).rows[0]
  if (!target) throw new ValidationError('Пользователь не найден')
  if (target.id === actorId) throw new ValidationError('Нельзя войти от своего имени')
  if (target.status !== 'active') throw new ValidationError('Пользователь деактивирован')

  if (impersonationMode(req)) await logImpersonation(req, 'impersonation_stop', req.user, impersonationMode(req))
  res.cookie('imp_user', signValue(String(userId)), testCookieOptions(req))
  res.clearCookie('preview_role', { path: '/' })
  const viewOnly = target.is_test !== true
  await logImpersonation(req, 'impersonation_start', target, viewOnly ? 'view' : 'test')
  res.json({ success: true, userId, viewOnly })
}))

router.post('/impersonate/stop', authenticateToken, asyncHandler(async (req, res) => {
  if (!isRealSuperadmin(req) && !req.impersonatedTestUser) {
    throw new UnauthorizedError('Недоступно')
  }
  if (impersonationMode(req)) await logImpersonation(req, 'impersonation_stop', req.user, impersonationMode(req))
  const opts = cookieOptions(req)
  res.clearCookie('imp_user', opts)
  res.clearCookie('preview_role', opts)
  res.json({ success: true })
}))

router.get('/test/state', authenticateToken, requireRealSuper, asyncHandler(async (req, res) => {
  res.json(await getTestDataState(req))
}))

router.post('/test/preview-role', authenticateToken, requireRealSuper, asyncHandler(async (req, res) => {
  const role = String(req.body?.role || '')
  if (!TEST_PREVIEW_ROLES.includes(role)) throw new ValidationError('Некорректная роль')
  res.cookie('preview_role', signValue(role), testCookieOptions(req))
  res.clearCookie('imp_user', { path: '/' })
  res.json({ success: true, previewRole: role })
}))

router.post('/test/impersonate', authenticateToken, requireRealSuper, asyncHandler(async (req, res) => {
  const userId = parseInt(req.body?.userId, 10)
  if (!Number.isInteger(userId)) throw new ValidationError('userId обязателен')
  const target = (await query(`SELECT id, is_test, status FROM users WHERE id = $1`, [userId])).rows[0]
  if (!target || target.is_test !== true) throw new ValidationError('Пользователь не является тестовым')
  if (target.status !== 'active') throw new ValidationError('Тестовый пользователь деактивирован')
  if (impersonationMode(req)) await logImpersonation(req, 'impersonation_stop', req.user, impersonationMode(req))
  res.cookie('imp_user', signValue(String(userId)), testCookieOptions(req))
  res.clearCookie('preview_role', { path: '/' })
  const testTarget = (await query('SELECT id, first_name, last_name, middle_name FROM users WHERE id = $1', [userId])).rows[0]
  await logImpersonation(req, 'impersonation_start', testTarget, 'test')
  res.json({ success: true, userId })
}))

router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.middle_name,
       u.position, u.department_id, u.phone, u.birth_date, u.hire_date,
       u.status, u.role, u.manager_id, u.avatar, u.is_test,
       d.name as department_name
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.id = $1`,
    [req.user.id]
  )

  if (result.rows.length === 0) throw new UnauthorizedError('Пользователь не найден')

  const user = result.rows[0]

  res.json({
    id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
    middleName: user.middle_name, position: user.position, department: user.department_name,
    departmentId: user.department_id, phone: user.phone, birthDate: user.birth_date,
    hireDate: user.hire_date, status: user.status,
    role: req.previewRole || user.role,
    managerId: user.manager_id, avatar: user.avatar,
    isImpersonated: !!(req.impersonatedTestUser || req.impersonatedRealUser),
    isTestUser: user.is_test === true || !!req.impersonatedTestUser,
    viewOnly: !!req.impersonatedRealUser,
    previewRole: req.previewRole || null,
    realUserId: req.realUser?.id ?? null,
    realUserName: req.realUser ? personName(req.realUser) : null,
  })
}))

export default router
