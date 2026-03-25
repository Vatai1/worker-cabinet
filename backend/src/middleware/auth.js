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
      'SELECT id, email, role FROM users WHERE id = $1',
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

    console.log('[AUTH] User role:', req.user.role, 'Required roles:', roles)

    if (!roles.includes(req.user.role)) {
      console.log('[AUTH] Forbidden - user role:', req.user.role, 'not in:', roles)
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' })
    }

    next()
  }
}
