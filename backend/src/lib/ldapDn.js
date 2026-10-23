import { query } from '../config/database.js'
import { syncMembershipDepartment } from './departmentMembers.js'

const DN_KEYS = ['LDAP_ENTRY_DN', 'ldap_dn', 'ldap_entry_dn', 'dn', 'DN', 'distinguishedName', 'entryDN']
const DN_SHAPE = /^(cn|uid)=[^,]+,.*\b(ou|dc)=/i

const first = (v) => (Array.isArray(v) ? v[0] : v)

export function extractLdapDn(payload) {
  for (const key of DN_KEYS) {
    const v = first(payload?.[key])
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const raw of Object.values(payload || {})) {
    const v = first(raw)
    if (typeof v === 'string' && DN_SHAPE.test(v.trim())) return v.trim()
  }
  return null
}

export function dnOuNames(dn) {
  if (!dn) return []
  return String(dn)
    .split(/(?<!\\),/)
    .map((rdn) => rdn.trim().match(/^ou\s*=\s*(.+)$/i)?.[1])
    .filter(Boolean)
    .map((v) => v.replace(/\\(.)/g, '$1').trim())
    .filter(Boolean)
}

export function dnOus(dn) {
  return dnOuNames(dn).map((v) => v.toLowerCase())
}

export function normalizeOus(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((v) => String(v).trim().toLowerCase()).filter(Boolean))]
}

export async function departmentIdFromDn(dn, orgId, db = { query }) {
  const ous = dnOus(dn)
  if (!ous.length || !orgId) return null
  const res = await db.query('SELECT id, ldap_ous FROM departments WHERE organization_id = $1 AND ldap_ous && $2::text[]', [orgId, ous])
  let best = null
  let bestRank = Infinity
  for (const d of res.rows) {
    const rank = Math.min(...d.ldap_ous.map((ou) => ous.indexOf(ou)).filter((i) => i >= 0))
    if (rank < bestRank) { best = d.id; bestRank = rank }
  }
  return best
}

export async function resolveDepartmentFromDn(dn, orgId, db = { query }) {
  const matched = await departmentIdFromDn(dn, orgId, db)
  if (matched) return { deptId: matched, created: false }
  const name = dnOuNames(dn)[0]
  if (!name || !orgId) return { deptId: null, created: false }
  const code = name.toLowerCase()
  const byName = await db.query('SELECT id FROM departments WHERE organization_id = $1 AND lower(name) = lower($2) ORDER BY id LIMIT 1', [orgId, name])
  if (byName.rows.length) {
    await db.query('UPDATE departments SET ldap_ous = array_append(ldap_ous, $1), updated_at = NOW() WHERE id = $2 AND NOT ($1 = ANY(ldap_ous))', [code, byName.rows[0].id])
    return { deptId: byName.rows[0].id, created: false }
  }
  const created = await db.query('INSERT INTO departments (name, organization_id, ldap_ous) VALUES ($1, $2, ARRAY[$3]) RETURNING id', [name, orgId, code])
  return { deptId: created.rows[0].id, created: true }
}

export async function applyDepartmentFromDn(userId, dn, orgId) {
  const { deptId, created } = await resolveDepartmentFromDn(dn, orgId)
  if (!deptId) return { deptId: null, changed: false, created: false }
  const cur = (await query('SELECT department_id FROM users WHERE id = $1', [userId])).rows[0]
  if (cur?.department_id === deptId) return { deptId, changed: false, created }
  await query('UPDATE users SET department_id = $1 WHERE id = $2', [deptId, userId])
  await syncMembershipDepartment(null, userId, cur?.department_id ?? null, deptId)
  return { deptId, changed: true, created }
}
