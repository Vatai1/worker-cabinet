import { query } from '../config/database.js'
import { updateKcUserRole } from '../config/keycloak.js'

async function syncKcRole(userId) {
  const row = (await query('SELECT keycloak_guid, role FROM users WHERE id = $1', [userId])).rows[0]
  if (row?.keycloak_guid) await updateKcUserRole(row.keycloak_guid, row.role).catch(() => {})
}

export async function grantManagerRole(userId, orgId) {
  await query(
    "UPDATE user_organizations SET org_role = 'manager' WHERE user_id = $1 AND org_id = $2 AND org_role = 'employee'",
    [userId, orgId]
  )
  const updated = await query("UPDATE users SET role = 'manager' WHERE id = $1 AND role = 'employee'", [userId])
  if (updated.rowCount > 0) await syncKcRole(userId)
}

export async function revokeManagerRoleIfUnused(userId, orgId) {
  const inOrg = await query(
    `SELECT EXISTS (SELECT 1 FROM departments WHERE manager_id = $1 AND organization_id = $2)
         OR EXISTS (SELECT 1 FROM organizations WHERE head_id = $1 AND id = $2) AS still`,
    [userId, orgId]
  )
  if (!inOrg.rows[0].still) {
    await query(
      "UPDATE user_organizations SET org_role = 'employee' WHERE user_id = $1 AND org_id = $2 AND org_role = 'manager'",
      [userId, orgId]
    )
  }
  const anywhere = await query(
    `SELECT EXISTS (SELECT 1 FROM departments WHERE manager_id = $1)
         OR EXISTS (SELECT 1 FROM organizations WHERE head_id = $1)
         OR EXISTS (SELECT 1 FROM user_organizations WHERE user_id = $1 AND org_role = 'manager' AND is_active) AS still`,
    [userId]
  )
  if (!anywhere.rows[0].still) {
    const updated = await query("UPDATE users SET role = 'employee' WHERE id = $1 AND role = 'manager'", [userId])
    if (updated.rowCount > 0) await syncKcRole(userId)
  }
}
