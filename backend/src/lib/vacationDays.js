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

export async function applyRuleToExistingBalances(organizationId, target, days) {
  const year = new Date().getFullYear()
  if (target.userId) {
    await query(
      `UPDATE vacation_balances SET total_days = $1, updated_at = NOW()
       WHERE organization_id = $2 AND year = $3 AND user_id = $4`,
      [days, organizationId, year, target.userId]
    )
  } else if (target.position) {
    await query(
      `UPDATE vacation_balances vb SET total_days = $1, updated_at = NOW()
       FROM users u
       WHERE vb.user_id = u.id AND vb.organization_id = $2 AND vb.year = $3
         AND u.position = $4
         AND NOT EXISTS (SELECT 1 FROM vacation_day_rules r WHERE r.organization_id = $2 AND r.user_id = u.id)`,
      [days, organizationId, year, target.position]
    )
  } else {
    await query(
      `UPDATE vacation_balances vb SET total_days = $1, updated_at = NOW()
       FROM users u
       WHERE vb.user_id = u.id AND vb.organization_id = $2 AND vb.year = $3
         AND NOT EXISTS (SELECT 1 FROM vacation_day_rules r WHERE r.organization_id = $2 AND r.user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM vacation_day_rules r WHERE r.organization_id = $2 AND r.position = u.position)`,
      [days, organizationId, year]
    )
  }
}
