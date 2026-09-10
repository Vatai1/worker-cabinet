import crypto from 'node:crypto'
import { query } from '../config/database.js'

export const TEST_PREVIEW_ROLES = ['employee', 'manager', 'hr', 'admin', 'onboarding']

function secret() {
  return process.env.JWT_SECRET || 'dev-secret'
}

export function signValue(value) {
  const v = String(value)
  const sig = crypto.createHmac('sha256', secret()).update(v).digest('hex')
  return `${v}.${sig}`
}

export function verifySignedValue(raw) {
  if (!raw || typeof raw !== 'string') return null
  const idx = raw.lastIndexOf('.')
  if (idx < 1) return null
  const v = raw.slice(0, idx)
  const sig = raw.slice(idx + 1)
  const expected = crypto.createHmac('sha256', secret()).update(v).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  try {
    if (!crypto.timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  return v
}

export function testCookieOptions(req) {
  const isHttps = req.protocol === 'https'
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'strict' : 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  }
}

export function clearTestCookies(res, req) {
  const opts = { path: '/', httpOnly: true, secure: req?.protocol === 'https', sameSite: req?.protocol === 'https' ? 'strict' : 'lax' }
  res.clearCookie('imp_user', opts)
  res.clearCookie('preview_role', opts)
}

export async function applyTestContext(req) {
  const realUser = req.user
  if (!realUser || realUser.role !== 'superadmin') return

  const impRaw = verifySignedValue(req.cookies?.imp_user)
  if (impRaw) {
    const targetId = parseInt(impRaw, 10)
    if (Number.isInteger(targetId)) {
      const r = await query(
        `SELECT id, email, role, first_name, last_name, middle_name, gender, phone,
                position, hire_date, birth_date, avatar, office, cabinet,
                responsibility_area, department_id, status, manager_id, is_test
         FROM users WHERE id = $1`,
        [targetId]
      )
      if (r.rows.length > 0 && r.rows[0].is_test === true && r.rows[0].status === 'active') {
        req.realUser = {
          id: realUser.id,
          role: 'superadmin',
          email: realUser.email,
          first_name: realUser.first_name,
          last_name: realUser.last_name,
        }
        req.user = r.rows[0]
        req.impersonatedTestUser = true
        return
      }
    }
  }

  const prRaw = verifySignedValue(req.cookies?.preview_role)
  if (prRaw && TEST_PREVIEW_ROLES.includes(prRaw)) {
    req.realUser = {
      id: realUser.id,
      role: 'superadmin',
      email: realUser.email,
      first_name: realUser.first_name,
      last_name: realUser.last_name,
    }
    req.previewRole = prRaw
    req.user = { ...realUser, role: prRaw }
  }
}

export function isRealSuperadmin(req) {
  if (req?.realUser) return req.realUser.role === 'superadmin'
  return req?.user?.role === 'superadmin'
}

export function requireRealSuperadmin(req, res, next) {
  if (isRealSuperadmin(req)) return next()
  return res.status(403).json({ error: 'Forbidden: superadmin only' })
}

export function testScopeAware(req) {
  if (req?.impersonatedTestUser) return true
  if (req?.previewRole) return false
  return req?.user?.role === 'superadmin'
}

export function excludeTest(req, alias, keyword = 'AND') {
  if (testScopeAware(req)) return ''
  return `${keyword} ${alias}.is_test = false`
}
