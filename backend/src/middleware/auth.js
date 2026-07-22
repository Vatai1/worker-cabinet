import jwt from 'jsonwebtoken'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { query } from '../config/database.js'
import keycloakConfig, { getJwksUrl } from '../config/keycloak.js'

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

async function verifyKeycloakToken(token) {
  const jwks = await getJwks()
  const { payload } = await jwtVerify(token, jwks, { clockTolerance: 30 })

  const expectedPath = `/realms/${keycloakConfig.realm}`
  if (!payload.iss || !payload.iss.endsWith(expectedPath)) {
    console.error('[KC] invalid token issuer:', payload.iss, 'expected to end with', expectedPath)
    throw new Error('Invalid token issuer')
  }

  console.log('[KC] verify token: sub=', payload.sub, 'email=', payload.email, 'preferred_username=', payload.preferred_username, 'exp=', payload.exp, 'iat=', payload.iat, 'iss=', payload.iss)
  logScopes(payload, 'token')
  console.log('[KC] token realm_access roles:', JSON.stringify(payload.realm_access?.roles || []))
  const resourceAccess = payload.resource_access || {}
  for (const [resource, access] of Object.entries(resourceAccess)) {
    console.log('[KC] token resource_access[' + resource + '] roles:', JSON.stringify(access.roles || []))
  }
  console.log('[KC] token allowed-origins:', JSON.stringify(payload['allowed-origins'] || []))
  console.log('[KC] token azp:', payload.azp, 'session_state=', payload.session_state, 'sid=', payload.sid, 'acr=', payload.acr, 'typ=', payload.typ)
  console.log('[KC] token all claim keys:', Object.keys(payload).join(', '))
  console.log('[KC] token full payload:', JSON.stringify(payload, null, 2))

  return payload
}

const SCOPE_CLAIMS = {
  openid: ['sub', 'auth_time', 'acr', 'sid', 'session_state'],
  profile: ['name', 'full_name', 'family_name', 'given_name', 'middle_name', 'middlename', 'nickname', 'preferred_username', 'profile', 'picture', 'website', 'gender', 'birth_date', 'zoneinfo', 'locale', 'updated_at'],
  email: ['email', 'email_verified'],
  address: ['address'],
  phone: ['phone_number', 'phone_number_verified', 'telephone_number'],
  roles: ['realm_access', 'resource_access', 'allowed-origins'],
  'web-origins': ['allowed-origins'],
  microprofile_jwt: ['upn', 'groups'],
  cabinet: [
    'email', 'email_verified',
    'name', 'firstname', 'lastname', 'middlename',
    'preferred_username', 'birth_date', 'gender',
    'phone_number', 'telephone_number',
    'picture',
    'position', 'hire_date', 'address', 'city', 'postal_code', 'room_number',
    'company', 'department',
    'responsibility_area',
    'groups',
  ],
}

export function logScopes(payload, label) {
  const scopeStr = payload.scope || ''
  const scopes = scopeStr.split(/\s+/).filter(Boolean)
  if (scopes.length === 0) {
    console.log(`[KC] ${label}: no scope claim present`)
    return
  }
  console.log(`[KC] ${label} scopes (${scopes.length}):`, scopes.join(', '))

  const allMappedKeys = new Set()
  for (const arr of Object.values(SCOPE_CLAIMS)) {
    for (const k of arr) allMappedKeys.add(k)
  }

  for (const scope of scopes) {
    const claimKeys = SCOPE_CLAIMS[scope]
    if (!claimKeys) {
      console.log(`[KC] ${label} scope "${scope}": (custom/unknown — claims shown in orphan section below)`)
      continue
    }
    const present = {}
    for (const key of claimKeys) {
      if (payload[key] !== undefined) present[key] = payload[key]
    }
    const presentKeys = Object.keys(present)
    if (presentKeys.length === 0) {
      console.log(`[KC] ${label} scope "${scope}": none of [${claimKeys.join(', ')}] present in token`)
    } else {
      console.log(`[KC] ${label} scope "${scope}" (${presentKeys.length}/${claimKeys.length} claims):`)
      console.log('   ', JSON.stringify(present, null, 2).replace(/\n/g, '\n    '))
    }
  }

  const orphanKeys = Object.keys(payload).filter(k =>
    !allMappedKeys.has(k) &&
    k !== 'scope' &&
    k !== 'exp' && k !== 'iat' && k !== 'nbf' && k !== 'aud' &&
    k !== 'azp' && k !== 'session_state' && k !== 'sid' && k !== 'acr' &&
    k !== 'typ' && k !== 'iss' && k !== 'jti' && k !== 'auth_time'
  )
  if (orphanKeys.length > 0) {
    const orphanClaims = {}
    for (const k of orphanKeys) orphanClaims[k] = payload[k]
    console.log(`[KC] ${label} orphan claims (not from any mapped scope, ${orphanKeys.length}):`)
    console.log('   ', JSON.stringify(orphanClaims, null, 2).replace(/\n/g, '\n    '))
  }
}

async function findOrCreateUser(kcPayload) {
  const sub = kcPayload.sub
  if (!sub) throw new Error('sub (GUID) not found in Keycloak token')
  const email = kcPayload.email
  if (!email) throw new Error('Email not found in Keycloak token')

  const firstName = kcPayload.firstname || kcPayload.given_name || ''
  const lastName = kcPayload.lastname || kcPayload.family_name || ''
  const middleName = kcPayload.middlename || kcPayload.middle_name || ''
  const gender = kcPayload.gender || ''
  const phone = kcPayload.phone_number || kcPayload.telephone_number || ''
  const position = kcPayload.position || ''
  const hireDate = kcPayload.hire_date || ''
  const birthDate = kcPayload.birth_date || ''
  const picture = kcPayload.picture || ''
  const address = kcPayload.address || ''
  const city = kcPayload.city || ''
  const office = [address, city].filter(Boolean).join(', ')
  const cabinet = kcPayload.room_number || ''
  const responsibilityArea = kcPayload.responsibility_area || ''
  const department = kcPayload.department || ''

  async function resolveDepartmentId(deptName) {
    if (!deptName || !deptName.trim()) return null
    const trimmed = deptName.trim()
    let res = await query('SELECT id FROM departments WHERE name ILIKE $1', [trimmed])
    if (res.rows.length > 0) return res.rows[0].id
    res = await query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [trimmed])
    console.log('[KC] auto-created department:', trimmed, '→ id=', res.rows[0].id)
    return res.rows[0].id
  }

  const KC_SYNC_FIELDS = [
    { claim: firstName, db: 'first_name' },
    { claim: lastName, db: 'last_name' },
    { claim: middleName, db: 'middle_name' },
    { claim: gender, db: 'gender' },
    { claim: phone, db: 'phone' },
    { claim: position, db: 'position' },
    { claim: office, db: 'office' },
    { claim: cabinet, db: 'cabinet' },
  ]

  const KC_DATE_FIELDS = [
    { claim: hireDate, db: 'hire_date' },
    { claim: birthDate, db: 'birth_date' },
  ]

  let result = await query(
    'SELECT id, email, role, first_name, last_name, middle_name, gender, phone, position, hire_date, birth_date, avatar, office, cabinet, responsibility_area, department_id FROM users WHERE keycloak_guid = $1',
    [sub]
  )

  if (result.rows.length > 0) {
    const user = result.rows[0]
    const updates = []
    const values = []
    let paramIndex = 1

    for (const f of KC_SYNC_FIELDS) {
      const val = String(f.claim).trim()
      if (val && String(user[f.db] || '').trim() !== val) {
        updates.push(`${f.db} = $${paramIndex++}`)
        values.push(val)
      }
    }

    for (const f of KC_DATE_FIELDS) {
      const val = f.claim.trim()
      if (val && val !== 'null' && val !== 'undefined') {
        const dbVal = user[f.db] ? String(user[f.db]).slice(0, 10) : ''
        if (dbVal !== val) {
          updates.push(`${f.db} = $${paramIndex++}`)
          values.push(val)
        }
      }
    }

    if (picture && user.avatar !== picture) {
      updates.push(`avatar = $${paramIndex++}`)
      values.push(picture)
    }

    if (responsibilityArea && String(user.responsibility_area || '').trim() !== responsibilityArea.trim()) {
      updates.push(`responsibility_area = $${paramIndex++}`)
      values.push(responsibilityArea.trim())
    }

    if (department) {
      const deptId = await resolveDepartmentId(department)
      if (deptId && user.department_id !== deptId) {
        updates.push(`department_id = $${paramIndex++}`)
        values.push(deptId)
      }
    }

    if (updates.length > 0) {
      values.push(user.id)
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values)
      console.log('[KC] user profile synced from KC: id=', user.id, 'updated=', updates.length, 'fields:', updates.map(u => u.split('=')[0].trim()).join(','))
    }

    console.log('[KC] user matched by keycloak_guid sub=', sub, '→ db id=', user.id, 'role=', user.role)
    return user
  }

  result = await query(
    'SELECT id, email, role, first_name, last_name, middle_name, gender, phone, position, hire_date, birth_date, avatar, office, cabinet, responsibility_area FROM users WHERE email = $1',
    [email]
  )
  if (result.rows.length > 0) {
    const user = result.rows[0]
    console.log('[KC] user matched by email=', email, '→ db id=', user.id, 'linking keycloak_guid=', sub)
    await query('UPDATE users SET keycloak_guid = $1 WHERE id = $2', [sub, user.id])
    return user
  }

  const hireDateVal = hireDate.trim() || new Date().toISOString().slice(0, 10)
  const birthDateVal = birthDate.trim() || null
  const deptId = await resolveDepartmentId(department)

  const insertValues = [
    email, firstName, lastName, middleName, gender, sub,
    phone, position, hireDateVal, birthDateVal,
    picture, office, cabinet, responsibilityArea, deptId,
  ]
  const insertCols = [
    'email', 'first_name', 'last_name', 'middle_name', 'gender', 'keycloak_guid',
    'phone', 'position', 'hire_date', 'birth_date',
    'avatar', 'office', 'cabinet', 'responsibility_area', 'department_id',
  ]

  const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ')

  console.log('[KC] creating new user from KC token: email=', email, 'name=', firstName, lastName, middleName, 'gender=', gender, 'phone=', phone, 'position=', position, 'sub=', sub)

  result = await query(
    `INSERT INTO users (${insertCols.join(', ')}, role, status, password_hash)
     VALUES (${placeholders}, 'employee', 'active', '')
     RETURNING id, email, role, first_name, last_name, middle_name`,
    insertValues
  )

  const user = result.rows[0]
  await query('INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)', [user.id]).catch(() => {})
  console.log('[KC] new user created from KC, db id=', user.id, 'email=', user.email)

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
    console.error('[KC] authenticateToken failed:', err.message)
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
