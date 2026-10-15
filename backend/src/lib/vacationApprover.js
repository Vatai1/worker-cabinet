import { query } from '../config/database.js'

export async function resolveApproverId(userId, orgId, db = { query }) {
  const userResult = await db.query('SELECT department_id FROM users WHERE id = $1', [userId])
  const ownDeptId = userResult.rows[0]?.department_id || null
  const visitedDepts = new Set()

  if (ownDeptId && !visitedDepts.has(ownDeptId)) {
    visitedDepts.add(ownDeptId)
    const dRes = await db.query('SELECT manager_id, parent_id, parent_user_id, vac_parent_approves, vac_parent_head_approves FROM departments WHERE id = $1', [ownDeptId])
    const d = dRes.rows[0]
    if (d) {
      const parentsAllowed = d.vac_parent_approves !== false
      const skipOwnManager = parentsAllowed && d.vac_parent_head_approves === true && d.parent_id !== null
      if (!skipOwnManager && d.manager_id !== null && d.manager_id !== userId) return d.manager_id
      if (parentsAllowed && d.parent_user_id !== null && d.parent_user_id !== userId) return d.parent_user_id
      if (parentsAllowed) {
        let pId = d.parent_id
        while (pId && !visitedDepts.has(pId)) {
          visitedDepts.add(pId)
          const pRes = await db.query('SELECT manager_id, parent_id, parent_user_id, vac_parent_approves, vac_parent_head_approves FROM departments WHERE id = $1', [pId])
          const p = pRes.rows[0]
          if (!p) break
          const pSkipManager = p.vac_parent_approves !== false && p.vac_parent_head_approves === true && p.parent_id !== null
          if (!pSkipManager && p.manager_id !== null && p.manager_id !== userId) return p.manager_id
          if (p.vac_parent_approves !== false && p.parent_user_id !== null && p.parent_user_id !== userId) return p.parent_user_id
          pId = p.parent_id
        }
      }
    }
  }

  const visitedOrgs = new Set()
  let currentOrgId = orgId
  while (currentOrgId && !visitedOrgs.has(currentOrgId)) {
    visitedOrgs.add(currentOrgId)
    const orgResult = await db.query('SELECT head_id, parent_id FROM organizations WHERE id = $1', [currentOrgId])
    const org = orgResult.rows[0]
    if (!org) break
    if (org.head_id !== null && org.head_id !== userId) return org.head_id
    currentOrgId = org.parent_id
  }

  return null
}

export async function coApproverId(userId, db = { query }) {
  const r = await db.query(
    `SELECT d.manager_id FROM users u JOIN departments d ON d.id = u.department_id
     WHERE u.id = $1 AND d.vac_parent_head_approves AND d.vac_parent_approves AND d.parent_id IS NOT NULL
       AND d.manager_id IS NOT NULL AND d.manager_id <> u.id`,
    [userId]
  )
  return r.rows[0]?.manager_id ?? null
}

export async function reassignPendingApprovers(orgId, db) {
  const pending = await db.query(
    `SELECT vr.id, vr.user_id, vr.approver_id, vr.start_date, vr.end_date, vr.duration, u.last_name, u.first_name
     FROM vacation_requests vr
     JOIN request_statuses rs ON rs.id = vr.status_id
     JOIN users u ON u.id = vr.user_id
     WHERE vr.organization_id = $1 AND rs.code = 'on_approval'`,
    [orgId]
  )
  const changed = []
  for (const r of pending.rows) {
    const approverId = await resolveApproverId(r.user_id, orgId, db)
    if (approverId === r.approver_id) continue
    await db.query('UPDATE vacation_requests SET approver_id = $1 WHERE id = $2', [approverId, r.id])
    changed.push({ ...r, approver_id: approverId })
  }
  return changed
}
