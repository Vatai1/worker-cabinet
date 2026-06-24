import crypto from 'node:crypto'

/**
 * CSRF protection middleware using double-submit cookie pattern.
 * Validates that the X-CSRF-Token header matches the csrf_token cookie.
 * Safe methods (GET, HEAD, OPTIONS) are exempt.
 */
export function csrfMiddleware(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }

  if (req.path === '/auth/login' || req.path === '/auth/register' || req.path === '/auth/callback') {
    return next()
  }

  const cookieToken = req.cookies?.csrf_token
  const headerToken = req.headers['x-csrf-token']

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF validation failed' })
  }
  next()
}

/**
 * Generates a CSRF token cookie if one doesn't already exist.
 * The cookie is non-HttpOnly so frontend JavaScript can read it
 * and send it as the X-CSRF-Token header on mutating requests.
 */
export function generateCsrfToken(req, res, next) {
  if (!req.cookies?.csrf_token) {
    const token = crypto.randomBytes(32).toString('hex')
    const isHttps = req.protocol === 'https'
    res.cookie('csrf_token', token, {
      httpOnly: false,
      secure: isHttps,
      sameSite: isHttps ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    })
  }
  next()
}
