import jwt from 'jsonwebtoken'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { query } from '../config/database.js'
import keycloakConfig, { getIssuer, getJwksUrl } from '../config/keycloak.js'

let jwksCache = null

async function getJwks() {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(getJwksUrl()), {
      timeoutSeconds: 15,
      cacheMaxAge: 300,
    })
  }
  return jwksCache
}

const VALID_ROLES = ['admin', 'hr', 'manager', 'employee', 'onboarding']

function extractRole(token) {
  const realmRoles = token.realm_access?.roles || []
  const resourceRoles = token.resource_access?.[keycloakConfig.clientId]?.roles || []
  const allRoles = [...realmRoles, ...resourceRoles]
  const role = allRoles.find(r => VALID_ROLES.includes(r))
  return role || 'employee'
}

async function verifyKeycloakToken(token) {
  const jwks = await getJwks()
  const { payload } = await jwtVerify(token, jwks)

  const expectedPath = `/realms/${keycloakConfig.realm}`
  if (!payload.iss || !payload.iss.endsWith(expectedPath)) {
    throw new Error('Invalid token issuer')
  }

  return payload
}

async function findOrCreateUser(kcPayload) {
  const sub = kcPayload.sub
  if (!sub) throw new Error('sub (GUID) not found in Keycloak token')
  const email = kcPayload.email
  if (!email) throw new Error('Email not found in Keycloak token')

  let result = await query(
    'SELECT id, email, role, first_name, last_name FROM users WHERE keycloak_guid = $1',
    [sub]
  )

  if (result.rows.length > 0) {
    const user = result.rows[0]
    const role = extractRole(kcPayload)
    if (role !== user.role) {
      await query('UPDATE users SET role = $1 WHERE id = $2', [role, user.id])
    }
    return { ...user, role }
  }

  const role = extractRole(kcPayload)
  const firstName = kcPayload.given_name || ''
  const lastName = kcPayload.family_name || ''

  result = await query(
    `INSERT INTO users (email, first_name, last_name, role, status, keycloak_guid, password_hash)
     VALUES ($1, $2, $3, $4, 'active', $5, '')
     RETURNING id, email, role, first_name, last_name`,
    [email, firstName, lastName, role, sub]
  )

  const user = result.rows[0]
  await query('INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)', [user.id]).catch(() => {})

  return user
}

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] || req.cookies?.auth_token

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    let user

    if (keycloakConfig.enabled) {
      const kcPayload = await verifyKeycloakToken(token)
      user = await findOrCreateUser(kcPayload)
    } else {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const result = await query(
        'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1',
        [decoded.id]
      )
      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' })
      }
      user = result.rows[0]
    }

    req.user = user
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' })
    }

    next()
  }
}

export const requirePermission = (permissionCode) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (req.user.role === 'admin') return next()

    try {
      const result = await query(
        `SELECT 1 FROM role_permissions rp
         JOIN roles r ON rp.role_id = r.id
         JOIN permissions p ON rp.permission_id = p.id
         WHERE r.name = $1 AND p.code = $2`,
        [req.user.role, permissionCode]
      )

      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' })
      }

      next()
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка проверки прав доступа' })
    }
  }
}
