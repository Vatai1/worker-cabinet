import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    const result = await query(
      'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1',
      [decoded.id]
    )
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' })
    }
    
    req.user = result.rows[0]
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' })
    }

    next()
  }
}

export const requirePermission = (permissionCode) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (req.user.role === 'admin') return next()

    try {
      const result = await query(
        `SELECT 1 FROM role_permissions rp
         JOIN roles r ON rp.role_id = r.id
         JOIN permissions p ON rp.permission_id = p.id
         WHERE r.name = $1 AND p.code = $2`,
        [req.user.role, permissionCode]
      )

      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' })
      }

      next()
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка проверки прав доступа' })
    }
  }
}
