import { query } from '../config/database.js'

export async function attachOrgContext(req, res, next) {
  if (!req.user) return next()

  if (req.user.role === 'superadmin' && !req.headers['x-organization-id']) {
    req.org = null
    return next()
  }

  const orgId = parseInt(req.headers['x-organization-id']) ||
    parseInt(req.cookies?.active_org_id)

  if (!orgId) {
    const fallback = await query(
      `SELECT uo.org_id, o.name, o.slug, uo.org_role
       FROM user_organizations uo
       JOIN organizations o ON uo.org_id = o.id
       WHERE uo.user_id = $1 AND uo.is_active = true AND o.is_active = true
       ORDER BY uo.org_id LIMIT 1`,
      [req.user.id]
    )
    if (fallback.rows.length === 0) {
      if (req.user.role === 'superadmin') { req.org = null; return next() }
      return res.status(403).json({ error: 'Нет доступных организаций' })
    }
    req.org = fallback.rows[0]
    return next()
  }

  const check = await query(
    `SELECT uo.org_id, o.name, o.slug, uo.org_role
     FROM user_organizations uo
     JOIN organizations o ON uo.org_id = o.id
     WHERE uo.user_id = $1 AND uo.org_id = $2
       AND uo.is_active = true AND o.is_active = true`,
    [req.user.id, orgId]
  )
  if (check.rows.length === 0) {
    if (req.user.role === 'superadmin') {
      const orgInfo = await query(
        'SELECT id as org_id, name, slug FROM organizations WHERE id = $1 AND is_active = true',
        [orgId]
      )
      req.org = orgInfo.rows[0] || null
      return next()
    }
    const fallback = await query(
      `SELECT uo.org_id, o.name, o.slug, uo.org_role
       FROM user_organizations uo
       JOIN organizations o ON uo.org_id = o.id
       WHERE uo.user_id = $1 AND uo.is_active = true AND o.is_active = true
       ORDER BY uo.org_id LIMIT 1`,
      [req.user.id]
    )
    if (fallback.rows.length > 0) {
      req.org = fallback.rows[0]
      return next()
    }
    return res.status(403).json({ error: 'Нет доступных организаций' })
  }
  req.org = check.rows[0]
  next()
}
