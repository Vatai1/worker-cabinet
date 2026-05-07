import { body, param, validationResult } from 'express-validator'

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Ошибка валидации',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    })
  }
  next()
}

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Некорректный email'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Пароль обязателен'),
  handleValidationErrors,
]

export const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Некорректный email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Пароль должен быть минимум 6 символов'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Имя обязательно (макс. 100 символов)'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Фамилия обязательна (макс. 100 символов)'),
  body('middleName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Отчество слишком длинное (макс. 100 символов)'),
  body('position')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Должность слишком длинная (макс. 100 символов)'),
  body('phone')
    .optional()
    .trim()
    .matches(/^[\d\s\-+()]*$/)
    .withMessage('Некорректный формат телефона'),
  body('role')
    .optional()
    .isIn(['employee', 'manager', 'hr', 'admin'])
    .withMessage('Недопустимая роль'),
  handleValidationErrors,
]

export const sanitizeInput = (req, res, next) => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim()
      }
    }
  }
  next()
}
