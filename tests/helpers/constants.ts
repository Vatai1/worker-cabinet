export const API_URL = process.env.API_URL || 'http://localhost:5000/api'

export const TEST_USERS = {
  employee: {
    email: 'ivanov@example.com',
    password: 'password123',
    firstName: 'Иван',
  },
  manager: {
    email: 'petrov@example.com',
    password: 'password123',
    firstName: 'Пётр',
  },
  admin: {
    email: 'admin@example.com',
    password: 'password123',
    firstName: 'Админ',
  },
} as const

export type TestUserRole = keyof typeof TEST_USERS
