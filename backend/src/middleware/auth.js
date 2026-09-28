import jwt from 'jsonwebtoken'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { query } from '../config/database.js'
import keycloakConfig, { getJwksUrl, getIssuer } from '../config/keycloak.js'
import { attachOrgContext } from './orgContext.js'
import { applyTestContext } from '../utils/testScope.js'

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
  const { payload } = await jwtVerify(token, jwks, {
    clockTolerance: 30,
    issuer: getIssuer(),
  })

  if (payload.azp !== keycloakConfig.clientId && (!payload.aud || !payload.aud.includes(keycloakConfig.clientId))) {
    throw new Error(`Token not intended for client "${keycloakConfig.clientId}"`)
  }

  return payload
}

export { verifyKeycloakToken }

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
    return
  }

  const allMappedKeys = new Set()
  for (const arr of Object.values(SCOPE_CLAIMS)) {
    for (const k of arr) allMappedKeys.add(k)
  }

  for (const scope of scopes) {
    const claimKeys = SCOPE_CLAIMS[scope]
    if (!claimKeys) {
      continue
    }
    const present = {}
    for (const key of claimKeys) {
      if (payload[key] !== undefined) present[key] = payload[key]
    }
    const presentKeys = Object.keys(present)
    if (presentKeys.length === 0) {
    } else {
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
    console.log('   ', JSON.stringify(orphanClaims, null, 2).replace(/\n/g, '\n    '))
  }
}

function mapRealmRoleToOrgRole(realmRoles) {
  if (realmRoles.includes('admin') || realmRoles.includes('administrator')) return 'admin'
  if (realmRoles.includes('hr') || realmRoles.includes('hr-manager')) return 'hr'
  if (realmRoles.includes('manager')) return 'manager'
  return 'employee'
}

async function syncUserOrganizations(userId, kcPayload) {
  const groups = kcPayload.groups || []
  const realmRoles = kcPayload.realm_access?.roles || []
  const orgSlugs = groups
    .map(g => g.replace(/^\//, '').replace(/^org-/, '').toLowerCase())
    .filter(g => g && !g.startsWith('default-roles'))

  const existing = await query('SELECT COUNT(*)::int AS cnt FROM user_organizations WHERE user_id = $1', [userId])
  const isFirstOrgEntry = existing.rows[0].cnt === 0

  let firstOrgId = 1
  const joinedOrgIds = []

  if (orgSlugs.length === 0) {
    await query(
      `INSERT INTO user_organizations (user_id, org_id, org_role, is_active)
       VALUES ($1, 1, $2, true)
       ON CONFLICT (user_id, org_id) DO UPDATE SET is_active = true`,
      [userId, mapRealmRoleToOrgRole(realmRoles)]
    )
    joinedOrgIds.push(1)
  } else {
    for (const slug of orgSlugs) {
      let orgResult = await query('SELECT id FROM organizations WHERE slug = $1', [slug])
      if (orgResult.rows.length === 0) {
        orgResult = await query(
          'INSERT INTO organizations (name, slug, is_active) VALUES ($1, $2, true) RETURNING id',
          [slug.charAt(0).toUpperCase() + slug.slice(1), slug]
        )
        console.log('[KC] auto-created organization:', slug)
      }
      const orgId = orgResult.rows[0].id
      if (slug === orgSlugs[0]) firstOrgId = orgId
      joinedOrgIds.push(orgId)
      const orgRole = mapRealmRoleToOrgRole(realmRoles)
      await query(
        `INSERT INTO user_organizations (user_id, org_id, org_role, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (user_id, org_id) DO UPDATE SET is_active = true`,
        [userId, orgId, orgRole]
      )
    }

    const orgIds = (await query(
      'SELECT id FROM organizations WHERE slug = ANY($1)', [orgSlugs]
    )).rows.map(r => r.id)

    if (orgIds.length > 0) {
      await query(
        `UPDATE user_organizations SET is_active = false
         WHERE user_id = $1 AND org_id NOT IN (SELECT unnest($2::int[]))`,
        [userId, orgIds]
      )
    }
  }

  if (isFirstOrgEntry) {
    const position = String(kcPayload.position || '').trim()
    if (position) {
      const rules = await query(
        `SELECT org_role FROM role_mapping_rules
         WHERE is_active = true AND $1 ILIKE '%' || position_pattern || '%'`,
        [position]
      )
      for (const rule of rules.rows) {
        for (const orgId of joinedOrgIds) {
          await query(
            'UPDATE user_organizations SET org_role = $1 WHERE user_id = $2 AND org_id = $3',
            [rule.org_role, userId, orgId]
          )
        }
      }
    }
  }

  return firstOrgId
}

export async function findOrCreateUser(kcPayload) {
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

  async function resolveDepartmentId(deptName, orgId) {
    if (!deptName || !deptName.trim()) return null
    const trimmed = deptName.trim()
    const oid = orgId || 1
    let res = await query('SELECT id FROM departments WHERE name ILIKE $1 AND organization_id = $2', [trimmed, oid])
    if (res.rows.length > 0) return res.rows[0].id
    res = await query('INSERT INTO departments (name, organization_id) VALUES ($1, $2) RETURNING id', [trimmed, oid])
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
    'SELECT id, email, role, first_name, last_name, middle_name, gender, phone, position, hire_date, birth_date, avatar, office, cabinet, responsibility_area, department_id, is_test FROM users WHERE keycloak_guid = $1 AND is_test = false',
    [sub]
  )

  if (result.rows.length > 0) {
    const user = result.rows[0]
    if (user.is_test) return user
    const firstOrgId = await syncUserOrganizations(user.id, kcPayload)
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
      const deptId = await resolveDepartmentId(department, firstOrgId)
      if (deptId && user.department_id !== deptId) {
        updates.push(`department_id = $${paramIndex++}`)
        values.push(deptId)
      }
    }

    if (updates.length > 0) {
      values.push(user.id)
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values)
    }

    return user
  }

  result = await query(
    'SELECT id, email, role, first_name, last_name, middle_name, gender, phone, position, hire_date, birth_date, avatar, office, cabinet, responsibility_area FROM users WHERE email = $1 AND is_test = false',
    [email]
  )
  if (result.rows.length > 0) {
    const user = result.rows[0]
    await query('UPDATE users SET keycloak_guid = $1 WHERE id = $2', [sub, user.id])
    await syncUserOrganizations(user.id, kcPayload)
    return user
  }

  const hireDateVal = hireDate.trim() || new Date().toISOString().slice(0, 10)
  const birthDateVal = birthDate.trim() || null

  const insertValues = [
    email, firstName, lastName, middleName, gender, sub,
    phone, position, hireDateVal, birthDateVal,
    picture, office, cabinet, responsibilityArea, null,
  ]
  const insertCols = [
    'email', 'first_name', 'last_name', 'middle_name', 'gender', 'keycloak_guid',
    'phone', 'position', 'hire_date', 'birth_date',
    'avatar', 'office', 'cabinet', 'responsibility_area', 'department_id',
  ]

  const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ')


  result = await query(
    `INSERT INTO users (${insertCols.join(', ')}, role, status, password_hash)
     VALUES (${placeholders}, 'employee', 'active', '')
     RETURNING id, email, role, first_name, last_name, middle_name`,
    insertValues
  )

  const user = result.rows[0]
  const firstOrgId = await syncUserOrganizations(user.id, kcPayload)

  if (department) {
    const deptId = await resolveDepartmentId(department, firstOrgId)
    if (deptId) {
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, user.id])
      await query(
        'UPDATE user_organizations SET department_id = $1 WHERE user_id = $2 AND org_id = $3',
        [deptId, user.id, firstOrgId]
      ).catch(() => {})
    }
  }

  await query('INSERT INTO vacation_balances (user_id, total_days, organization_id) VALUES ($1, 28, $2)', [user.id, firstOrgId]).catch(() => {})
  await query(
    `UPDATE vacation_balances SET travel_next_available_date = hire_date + INTERVAL '2 years'
     FROM users WHERE users.id = vacation_balances.user_id AND vacation_balances.organization_id = $1 AND travel_next_available_date IS NULL`,
    [firstOrgId]
  ).catch(() => {})

  return user
}

const VIEW_ONLY_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const VIEW_ONLY_ALLOWED_PATHS = new Set(['/api/auth/impersonate/stop', '/api/auth/logout', '/api/auth/view-as'])

function rejectViewOnlyWrite(req, res) {
  if (!req.impersonatedRealUser || VIEW_ONLY_SAFE_METHODS.has(req.method)) return false
  const path = (req.originalUrl || '').split('?')[0]
  if (VIEW_ONLY_ALLOWED_PATHS.has(path)) return false
  res.status(403).json({ error: 'Режим просмотра: изменения от имени другого пользователя недоступны', code: 'VIEW_ONLY' })
  return true
}

export const ACCOUNT_DISABLED_MESSAGE = 'Учётная запись деактивирована. Обратитесь к HR или администратору'

const rejectDisabledAccount = (req, res) => {
  if (req.user?.status !== 'inactive') return false
  res.status(401).json({ error: ACCOUNT_DISABLED_MESSAGE, code: 'ACCOUNT_DISABLED' })
  return true
}

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] || req.cookies?.auth_token

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    if (decoded?.scope === 'assistant') {
      const result = await query(
        `SELECT id, email, role, first_name, last_name, middle_name, gender, phone,
                position, hire_date, birth_date, avatar, office, cabinet,
                responsibility_area, department_id, status, manager_id
         FROM users WHERE id = $1`,
        [decoded.id]
      )
      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'Пользователь не найден' })
      }
      req.user = result.rows[0]
      if (rejectDisabledAccount(req, res)) return
      return attachOrgContext(req, res, next)
    }

    const result = await query(
      `SELECT id, email, role, first_name, last_name, middle_name, gender, phone,
              position, hire_date, birth_date, avatar, office, cabinet,
              responsibility_area, department_id, status, manager_id
       FROM users WHERE id = $1`,
      [decoded.id]
    )
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Пользователь не найден' })
    }

    req.user = result.rows[0]
    if (rejectDisabledAccount(req, res)) return
    await applyTestContext(req)
    if (rejectViewOnlyWrite(req, res)) return
    return attachOrgContext(req, res, next)
  } catch (err) {
    console.error('authenticateToken failed:', err.message)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (req.user.role === 'superadmin') return next()
    if (roles.includes(req.user.role)) return next()
    if (req.org?.org_role && roles.includes(req.org.org_role)) return next()

    return res.status(403).json({ error: 'Недостаточно прав для этого действия' })
  }
}

export const authorizeGlobalRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (req.user.role === 'superadmin') return next()
    if (roles.includes(req.user.role)) return next()

    return res.status(403).json({ error: 'Недостаточно прав для этого действия' })
  }
}

export const authorizeOrgRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (req.user.role === 'superadmin') return next()
    if (req.org?.org_role && roles.includes(req.org.org_role)) return next()

    return res.status(403).json({ error: 'Недостаточно прав для этого действия' })
  }
}

export const requirePermission = (permissionCode) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (req.user.role === 'superadmin') return next()
    if (req.user.role === 'admin') return next()

    try {
      const effectiveRole = req.org?.org_role || req.user.role
      const result = await query(
        `SELECT 1 FROM role_permissions rp
         JOIN roles r ON rp.role_id = r.id
         JOIN permissions p ON rp.permission_id = p.id
         WHERE r.name = $1 AND p.code = $2`,
        [effectiveRole, permissionCode]
      )

      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'Недостаточно прав для этого действия' })
      }

      next()
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка проверки прав доступа' })
    }
  }
}
