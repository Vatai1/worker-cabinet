import type { Page, APIRequestContext } from '@playwright/test'

type Role = 'employee' | 'manager' | 'hr' | 'admin'

const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  employee: { email: 'ivanov@example.com', password: 'password123' },
  manager: { email: 'petrov@example.com', password: 'password123' },
  hr: { email: 'elena@example.com', password: 'password123' },
  admin: { email: 'admin@example.com', password: 'password123' },
}

export async function loginAs(page: Page, role: Role) {
  const res = await page.request.post('http://localhost:5000/api/auth/login', {
    data: CREDENTIALS[role],
  })
  const setCookie = res.headers()['set-cookie']
  if (!setCookie) throw new Error('Login failed: no cookie')

  const tokenMatch = setCookie.match(/auth_token=([^;]+)/)
  const csrfMatch = setCookie.match(/csrf_token=([^;]+)/)
  if (!tokenMatch) throw new Error('Login failed: no auth_token')

  await page.context().addCookies([
    {
      name: 'auth_token',
      value: tokenMatch[1],
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'csrf_token',
      value: csrfMatch?.[1] || '',
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    },
  ])
}
