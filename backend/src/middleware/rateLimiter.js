import rateLimit from 'express-rate-limit'

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 10,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 5000 : 100,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
})

