import express from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { validateLogin, validateRegister, sanitizeInput } from '../middleware/validation.js'
import { asyncHandler, ValidationError, UnauthorizedError } from '../middleware/errors.js'
import { authenticateToken } from '../middleware/auth.js'
import keycloakConfig, { getTokenEndpoint, getPublicAuthUrl, getPublicLogoutUrl } from '../config/keycloak.js'

const router = express.Router()

router.use(sanitizeInput)

router.get('/config', asyncHandler(async (req, res) => {
  if (!keycloakConfig.enabled) {
    return res.json({ keycloak: false })
  }

  res.json({
    keycloak: true,
    authUrl: `${getPublicAuthUrl()}?client_id=${keycloakConfig.clientId}&response_type=code&scope=openid email profile&prompt=login`,
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

  console.log('[auth/callback] code_verifier length:', code_verifier?.length, 'redirect_uri:', redirect_uri)

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
    const err = await tokenRes.json().catch(() => ({}))
    throw new ValidationError(err.error_description || 'Ошибка обмена токена')
  }

  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token
  const idToken = tokenData.id_token

  res.cookie('auth_token', accessToken, {
    ...cookieOptions(req),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })

  if (idToken) {
    res.cookie('kc_id_token', idToken, {
      ...cookieOptions(req),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
  }

  res.json({ success: true, accessToken })
}))

function cookieOptions(req) {
  return {
    httpOnly: true,
    secure: req.protocol === 'https',
    sameSite: req.protocol === 'https' ? 'strict' : 'lax',
    path: '/',
  }
}

router.post('/logout', asyncHandler(async (req, res) => {
  const opts = cookieOptions(req)
  if (keycloakConfig.enabled) {
    const idToken = req.cookies?.kc_id_token
    let logoutUrl = getPublicLogoutUrl(process.env.FRONTEND_URL || '/')
    if (idToken) {
      logoutUrl += `&id_token_hint=${encodeURIComponent(idToken)}`
    }
    res.clearCookie('auth_token', opts)
    res.clearCookie('kc_id_token', opts)
    res.json({ logoutUrl })
  } else {
    res.clearCookie('auth_token', opts)
    res.json({ success: true })
  }
}))

router.post('/register', authLimiter, validateRegister, asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate, role } = req.body

  const existingUser = await query('SELECT id FROM users WHERE email = $1', [email])
  if (existingUser.rows.length > 0) throw new ValidationError('Email уже зарегистрирован')

  const passwordHash = await bcrypt.hash(password, 10)

  const result = await query(
    `INSERT INTO users
     (email, password_hash, first_name, last_name, middle_name, position, department_id, phone, birth_date, hire_date, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, email, first_name, last_name, middle_name, position, department_id, role, created_at`,
    [email, passwordHash, firstName, lastName, middleName, position, departmentId, phone, birthDate, hireDate, role || 'employee']
  )

  const user = result.rows[0]
  await query('INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)', [user.id])

  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured')

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  res.status(201)
    .cookie('auth_token', token, {
      ...cookieOptions(req),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      token,
      user: {
        id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
        middleName: user.middle_name, position: user.position, departmentId: user.department_id, role: user.role,
      },
    })
}))

router.post('/login', authLimiter, validateLogin, asyncHandler(async (req, res) => {
  const { email, password } = req.body
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip

  const result = await query(
    `SELECT u.*, d.name as department_name, d.manager_id as department_manager_id
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.email = $1`,
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

  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured')

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  await query(
    `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, ip_address) VALUES ($1, $2, 'login', 'user', $3, $4)`,
    [user.id, `${user.first_name} ${user.last_name}`, String(user.id), ip]
  ).catch(() => {})

  let subordinates = []
  if (user.role === 'manager' || user.role === 'hr' || user.role === 'admin') {
    const subordinatesResult = await query('SELECT id FROM users WHERE manager_id = $1', [user.id])
    subordinates = subordinatesResult.rows.map(row => row.id)
  }

  res
    .cookie('auth_token', token, {
      ...cookieOptions(req),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
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

router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT u.*, d.name as department_name
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
    hireDate: user.hire_date, status: user.status, role: user.role,
    managerId: user.manager_id, avatar: user.avatar,
  })
}))

export default router
