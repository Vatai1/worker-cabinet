import { query } from '../config/database.js'

const FULL_ACCESS_ROLES = ['superadmin', 'hr', 'admin']

export function hasFullDepartmentAccess(req) {
  return FULL_ACCESS_ROLES.includes(req.user?.role) || ['hr', 'admin'].includes(req.org?.org_role)
}

export async function managedDepartmentIds(userId, orgId) {
  const result = await query(
    `WITH RECURSIVE scope AS (
       SELECT id FROM departments WHERE manager_id = $1 AND ($2::int IS NULL OR organization_id = $2)
       UNION
       SELECT d.id FROM departments d JOIN scope s ON d.parent_id = s.id
     )
     SELECT id FROM scope`,
    [userId, orgId ?? null]
  )
  return new Set(result.rows.map((r) => r.id))
}

export async function canEditDepartmentHierarchy(req, deptId) {
  if (hasFullDepartmentAccess(req)) return true
  const ids = await managedDepartmentIds(req.user.id, req.org?.org_id ?? null)
  return ids.has(Number(deptId))
}
