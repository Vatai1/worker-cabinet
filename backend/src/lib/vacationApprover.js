import { query } from '../config/database.js'

export function vacationApproversSql(userId, orgId) {
  return `
    WITH RECURSIVE employee AS (
      SELECT u.id, d.id AS department_id,
             CASE WHEN u.vac_parent_approves AND (${orgId} IS NULL OR manager_membership.user_id IS NOT NULL)
                  THEN NULLIF(u.manager_id, u.id) END AS manager_id
      FROM users u
      LEFT JOIN user_organizations membership ON membership.user_id = u.id AND membership.org_id = ${orgId}
      LEFT JOIN departments d ON d.id = COALESCE(membership.department_id, u.department_id)
        AND (${orgId} IS NULL OR d.organization_id = ${orgId})
      LEFT JOIN user_organizations manager_membership ON manager_membership.user_id = u.manager_id
        AND manager_membership.org_id = ${orgId} AND manager_membership.is_active
      WHERE u.id = ${userId}
    ), department_chain AS (
      SELECT d.id, d.organization_id, d.manager_id, d.parent_id, d.parent_user_id,
             d.vac_parent_approves, d.vac_parent_head_approves, 0 AS depth, ARRAY[d.id] AS visited
      FROM departments d JOIN employee e ON e.department_id = d.id
      UNION ALL
      SELECT parent.id, parent.organization_id, parent.manager_id, parent.parent_id, parent.parent_user_id,
             parent.vac_parent_approves, parent.vac_parent_head_approves, chain.depth + 1, chain.visited || parent.id
      FROM department_chain chain
      JOIN departments parent ON parent.id = chain.parent_id AND parent.organization_id = chain.organization_id
      WHERE (chain.depth > 0 OR chain.vac_parent_approves IS NOT FALSE)
        AND NOT parent.id = ANY(chain.visited)
    ), organization_chain AS (
      SELECT o.id, o.head_id, o.parent_id, 0 AS depth, ARRAY[o.id] AS visited
      FROM organizations o CROSS JOIN employee WHERE o.id = ${orgId}
      UNION ALL
      SELECT parent.id, parent.head_id, parent.parent_id, chain.depth + 1, chain.visited || parent.id
      FROM organization_chain chain JOIN organizations parent ON parent.id = chain.parent_id
      WHERE NOT parent.id = ANY(chain.visited)
    )
    SELECT COALESCE(
      e.manager_id,
      (SELECT candidate.id
       FROM department_chain d
       CROSS JOIN LATERAL (VALUES
         (1, CASE WHEN NOT (d.vac_parent_approves IS NOT FALSE AND d.vac_parent_head_approves IS TRUE AND d.parent_id IS NOT NULL)
                  THEN d.manager_id END),
         (2, CASE WHEN d.vac_parent_approves IS NOT FALSE THEN d.parent_user_id END)
       ) AS candidate(priority, id)
       WHERE candidate.id <> e.id
       ORDER BY d.depth, candidate.priority LIMIT 1),
      (SELECT head_id FROM organization_chain WHERE head_id <> e.id ORDER BY depth LIMIT 1)
    ) AS approver_id,
    CASE WHEN e.manager_id IS NULL AND own.vac_parent_head_approves AND own.vac_parent_approves AND own.parent_id IS NOT NULL
         THEN NULLIF(own.manager_id, e.id) END AS co_approver_id
    FROM employee e
    LEFT JOIN department_chain own ON own.depth = 0
  `
}

export async function resolveVacationApprovers(userId, orgId, db = { query }) {
  const result = await db.query(vacationApproversSql('$1::int', '$2::int'), [userId, orgId])
  return result.rows[0] ?? { approver_id: null, co_approver_id: null }
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
    const { approver_id: approverId } = await resolveVacationApprovers(r.user_id, orgId, db)
    if (approverId === r.approver_id) continue
    await db.query('UPDATE vacation_requests SET approver_id = $1 WHERE id = $2', [approverId, r.id])
    changed.push({ ...r, approver_id: approverId })
  }
  return changed
}
