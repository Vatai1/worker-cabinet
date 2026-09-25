import { query } from '../config/database.js'

const FALLBACK_DAYS = 28

export async function resolveVacationDays(userId, organizationId) {
  if (!organizationId) return FALLBACK_DAYS

  const userRes = await query('SELECT position FROM users WHERE id = $1', [userId])
  const position = userRes.rows[0]?.position || null

  const rules = await query(
    `SELECT days, user_id, position FROM vacation_day_rules
     WHERE organization_id = $1 AND (user_id = $2 OR position = $3 OR (user_id IS NULL AND position IS NULL))`,
    [organizationId, userId, position]
  )

  const userRule = rules.rows.find((r) => r.user_id === Number(userId))
  if (userRule) return userRule.days

  const posRule = position ? rules.rows.find((r) => r.position === position) : null
  if (posRule) return posRule.days

  const defaultRule = rules.rows.find((r) => r.user_id === null && r.position === null)
  if (defaultRule) return defaultRule.days

  return FALLBACK_DAYS
}

function shortName(lastName, firstName, middleName) {
  if (!lastName) return ''
  const initials = [firstName, middleName].map((p) => p?.trim()?.[0]).filter(Boolean).map((ch) => `${ch}.`).join('')
  return initials ? `${lastName} ${initials}` : lastName
}

export async function vacationStatusBatch(userIds, orgId) {
  const map = new Map()
  if (!userIds || userIds.length === 0) return map
  const orgClause = orgId ? ' AND vr.organization_id = $2' : ''
  const params = orgId ? [userIds, orgId] : [userIds]
  const result = await query(
    `SELECT vr.user_id, vr.start_date, vr.end_date, u2.last_name, u2.first_name, u2.middle_name
     FROM vacation_requests vr
     JOIN request_statuses rs ON vr.status_id = rs.id
     LEFT JOIN vacation_substitutions vs ON vs.vacation_request_id = vr.id
     LEFT JOIN users u2 ON vs.substitute_user_id = u2.id
     WHERE vr.user_id = ANY($1) AND rs.code = 'approved'
       AND vr.start_date <= CURRENT_DATE AND vr.end_date >= CURRENT_DATE${orgClause}`,
    params
  )
  for (const row of result.rows) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, { active: true, startDate: row.start_date, endDate: row.end_date, substitutes: [] })
    }
    if (row.last_name) {
      map.get(row.user_id).substitutes.push(shortName(row.last_name, row.first_name, row.middle_name))
    }
  }
  return map
}

export async function applyRuleToExistingBalances(organizationId, target, days) {
  const year = new Date().getFullYear()
  if (target.userId) {
    await query(
      `UPDATE vacation_balances SET total_days = $1, updated_at = NOW()
       WHERE organization_id = $2 AND year >= $3 AND user_id = $4`,
      [days, organizationId, year, target.userId]
    )
  } else if (target.position) {
    await query(
      `UPDATE vacation_balances vb SET total_days = $1, updated_at = NOW()
       FROM users u
       WHERE vb.user_id = u.id AND vb.organization_id = $2 AND vb.year >= $3
         AND u.position = $4
         AND NOT EXISTS (SELECT 1 FROM vacation_day_rules r WHERE r.organization_id = $2 AND r.user_id = u.id)`,
      [days, organizationId, year, target.position]
    )
  } else {
    await query(
      `UPDATE vacation_balances vb SET total_days = $1, updated_at = NOW()
       FROM users u
       WHERE vb.user_id = u.id AND vb.organization_id = $2 AND vb.year >= $3
         AND NOT EXISTS (SELECT 1 FROM vacation_day_rules r WHERE r.organization_id = $2 AND r.user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM vacation_day_rules r WHERE r.organization_id = $2 AND r.position = u.position)`,
      [days, organizationId, year]
    )
  }
}
