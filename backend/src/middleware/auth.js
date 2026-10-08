import jwt from 'jsonwebtoken'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { query } from '../config/database.js'
import keycloakConfig, { getJwksUrl, getIssuer, kcLog, kcErr } from '../config/keycloak.js'
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
  let payload
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      clockTolerance: 30,
      issuer: getIssuer(),
    }))
  } catch (err) {
    kcErr('verify: token rejected:', err.code || '', err.message, err.cause?.code || '', err.cause?.message || '', '| expected iss=', getIssuer(), 'jwks=', getJwksUrl())
    throw err
  }

  if (payload.azp !== keycloakConfig.clientId && (!payload.aud || !payload.aud.includes(keycloakConfig.clientId))) {
    kcErr('verify: wrong client, azp=', payload.azp, 'aud=', payload.aud, 'expected=', keycloakConfig.clientId)
    throw new Error(`Token not intended for client "${keycloakConfig.clientId}"`)
  }

  kcLog('verify: ok, sub=', payload.sub, 'email=', payload.email, 'azp=', payload.azp, 'scope=', payload.scope,
    'exp=', payload.exp && new Date(payload.exp * 1000).toISOString())
  return payload
}

export { verifyKeycloakToken }

function mapRealmRoleToOrgRole(realmRoles) {
  if (realmRoles.includes('admin') || realmRoles.includes('administrator')) return 'admin'
  if (realmRoles.includes('hr') || realmRoles.includes('hr-manager')) return 'hr'
  if (realmRoles.includes('manager')) return 'manager'
  return 'employee'
}

async function findOrCreateOrganization({ name, slug }) {
  const norm = (expr) => `btrim(regexp_replace(lower(regexp_replace(${expr}, '[«»"''“”]', '', 'g')), '\\s+', ' ', 'g'))`
  const found = await query(
    `SELECT id FROM organizations
     WHERE slug = $1 OR ($2::text IS NOT NULL AND ${norm('name')} = ${norm('$2')})
     ORDER BY (slug = $1) DESC, id LIMIT 1`,
    [slug, name || null]
  )
  if (found.rows.length) {
    kcLog('org: matched', JSON.stringify({ name, slug }), '→ id=', found.rows[0].id)
    return found.rows[0].id
  }
  const created = await query(
    `INSERT INTO organizations (name, slug, is_active) VALUES ($1, $2, true)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
    [name || slug.charAt(0).toUpperCase() + slug.slice(1), slug]
  )
  kcLog('org: auto-created', name || slug, 'slug=', slug, '→ id=', created.rows[0].id)
  return created.rows[0].id
}

export function keycloakOrgSource(kcPayload) {
  const groups = (kcPayload.groups || [])
    .map(g => String(g).replace(/^\//, '').replace(/^org-/, '').toLowerCase())
    .filter(g => g && !g.startsWith('default-roles'))
  if (groups.length) return { source: 'groups', orgs: groups.map(slug => ({ slug })) }
  const company = String(kcPayload.company || '').replace(/\s+/g, ' ').trim()
  if (company) return { source: 'company', orgs: [{ name: company, slug: company.toLowerCase().replace(/[«»"'“”]/g, '').trim().replace(/\s+/g, '-').slice(0, 100) }] }
  return { source: 'default', orgs: [] }
}

async function syncUserOrganizations(userId, kcPayload) {
  const realmRoles = kcPayload.realm_access?.roles || []
  const { source, orgs } = keycloakOrgSource(kcPayload)
  kcLog('org sync: user', userId, 'source=', source, 'groups=', JSON.stringify(kcPayload.groups || []),
    'company=', JSON.stringify(kcPayload.company || null), 'realmRoles=', realmRoles.join(','), '→ orgRole=', mapRealmRoleToOrgRole(realmRoles))

  const existing = await query('SELECT COUNT(*)::int AS cnt FROM user_organizations WHERE user_id = $1', [userId])
  const isFirstOrgEntry = existing.rows[0].cnt === 0

  const joinedOrgIds = orgs.length ? [] : [1]
  for (const org of orgs) joinedOrgIds.push(await findOrCreateOrganization(org))
  const firstOrgId = joinedOrgIds[0]

  for (const orgId of joinedOrgIds) {
    await query(
      `INSERT INTO user_organizations (user_id, org_id, org_role, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id, org_id) DO UPDATE SET is_active = true`,
      [userId, orgId, mapRealmRoleToOrgRole(realmRoles)]
    )
  }
  kcLog('org sync: user', userId, 'active in orgs', joinedOrgIds.join(','), 'firstEntry=', isFirstOrgEntry)
  if (orgs.length) {
    const deactivated = await query(
      'UPDATE user_organizations SET is_active = false WHERE user_id = $1 AND NOT (org_id = ANY($2::int[])) AND is_active RETURNING org_id',
      [userId, joinedOrgIds]
    )
    if (deactivated.rows.length) kcLog('org sync: user', userId, 'deactivated in orgs', deactivated.rows.map(r => r.org_id).join(','))
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
        kcLog('org sync: user', userId, 'position', JSON.stringify(position), 'matched role rule →', rule.org_role)
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
  const email = kcPayload.email
  kcLog('user: resolving sub=', sub, 'email=', email)
  if (!sub) { kcErr('user: no sub in token'); throw new Error('sub (GUID) not found in Keycloak token') }
  if (!email) { kcErr('user: no email in token, sub=', sub); throw new Error('Email not found in Keycloak token') }

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
    if (res.rows.length > 0) {
      kcLog('dept: matched', JSON.stringify(trimmed), 'org=', oid, '→ id=', res.rows[0].id)
      return res.rows[0].id
    }
    res = await query('INSERT INTO departments (name, organization_id) VALUES ($1, $2) RETURNING id', [trimmed, oid])
    kcLog('dept: auto-created', JSON.stringify(trimmed), 'org=', oid, '→ id=', res.rows[0].id)
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
    kcLog('user: found by sub → id=', user.id, 'role=', user.role)
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
      kcLog('user', user.id, 'sync fields:', updates.map((u, i) => `${u.split(' = ')[0]}=${JSON.stringify(values[i])}`).join(', '))
      values.push(user.id)
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values)
    }

    if (!updates.length) kcLog('user', user.id, 'sync fields: nothing changed')
    return user
  }

  result = await query(
    'SELECT id, email, role, first_name, last_name, middle_name, gender, phone, position, hire_date, birth_date, avatar, office, cabinet, responsibility_area FROM users WHERE email = $1 AND is_test = false',
    [email]
  )
  if (result.rows.length > 0) {
    const user = result.rows[0]
    kcLog('user: found by email → id=', user.id, 'role=', user.role, ', linking keycloak_guid=', sub)
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
  kcLog('user: created id=', user.id, 'email=', email, 'name=', [lastName, firstName, middleName].filter(Boolean).join(' '))
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
