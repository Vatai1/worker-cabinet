import { query } from '../config/database.js'

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Ошибка валидации данных') {
    super(message, 400, 'VALIDATION_ERROR')
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Требуется авторизация') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Доступ запрещен') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ресурс не найден') {
    super(message, 404, 'NOT_FOUND')
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Конфликт данных') {
    super(message, 409, 'CONFLICT')
  }
}

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

export const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    body: process.env.NODE_ENV === 'development' ? req.body : undefined,
  })

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip

  if (!err.isOperational && err.statusCode !== 401 && err.statusCode !== 403) {
    query(
      `INSERT INTO error_log (message, stack, path, method, status_code, user_id, user_email, ip) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        err.message?.substring(0, 2000),
        process.env.NODE_ENV === 'development' ? err.stack?.substring(0, 5000) : null,
        req.path?.substring(0, 500),
        req.method,
        err.statusCode || 500,
        req.user?.id || null,
        req.user?.email || null,
        ip,
      ]
    ).catch(() => {})
  }

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    })
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Недействительный токен', code: 'INVALID_TOKEN' })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Токен истек', code: 'TOKEN_EXPIRED' })
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Запись уже существует', code: 'DUPLICATE_ENTRY' })
  }

  if (err.code === '23503') {
    return res.status(400).json({ error: 'Нарушение ссылочной целостности', code: 'FOREIGN_KEY_VIOLATION' })
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Внутренняя ошибка сервера',
    code: 'INTERNAL_ERROR',
  })
}

export default AppError
