export function errorHandler(err, req, res, _next) {
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  })

  res.status(err.statusCode || 500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Внутренняя ошибка сервера',
    code: err.code || 'INTERNAL_ERROR',
  })
}
