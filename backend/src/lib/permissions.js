import { query } from '../config/database.js'
import { FULL_ACCESS_ROLES, PERMISSIONS, PERMISSION_CODES } from './permissionCatalog.js'

export { FULL_ACCESS_ROLES, PERMISSIONS, PERMISSION_CODES }

const CACHE_TTL_MS = 30_000
let grants = null
let grantsLoadedAt = 0

async function loadGrants() {
  if (grants && Date.now() - grantsLoadedAt < CACHE_TTL_MS) return grants
  const result = await query(
    `SELECT r.name AS role, p.code FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     JOIN permissions p ON p.id = rp.permission_id`
  )
  const next = new Map()
  for (const { role, code } of result.rows) {
    if (!next.has(role)) next.set(role, new Set())
    next.get(role).add(code)
  }
  grants = next
  grantsLoadedAt = Date.now()
  return grants
}

export function invalidatePermissionCache() {
  grants = null
}

export async function permissionsFor(user, org) {
  const roles = [user?.role, org?.org_role].filter(Boolean)
  if (roles.some((r) => FULL_ACCESS_ROLES.includes(r))) return new Set(PERMISSION_CODES)
  const map = await loadGrants()
  const result = new Set()
  for (const role of roles) for (const code of map.get(role) ?? []) result.add(code)
  return result
}

export async function hasPermission(req, code) {
  return (await permissionsFor(req.user, req.org)).has(code)
}

export const requirePermission = (code) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  try {
    if (await hasPermission(req, code)) return next()
    return res.status(403).json({ error: 'Недостаточно прав для этого действия' })
  } catch (err) {
    res.locals.errorCause = err
    return res.status(500).json({ error: 'Ошибка проверки прав доступа' })
  }
}

export async function isModuleEnabledForOrg(code, orgId) {
  const result = await query(
    `SELECT m.is_enabled, mo.is_enabled_override
     FROM modules m
     LEFT JOIN module_overrides mo ON mo.module_code = m.code AND mo.org_id = $2
     WHERE m.code = $1 AND m.organization_id IS NULL`,
    [code, orgId ?? null]
  )
  const row = result.rows[0]
  return !!row && row.is_enabled && row.is_enabled_override !== false
}
