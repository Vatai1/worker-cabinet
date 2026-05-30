import { Page, expect } from '@playwright/test'
import { TEST_USERS, type TestUserRole } from './constants'
import { API_URL } from './constants'

export async function loginViaUI(page: Page, role: TestUserRole = 'employee') {
  const user = TEST_USERS[role]
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Пароль').fill(user.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
}

export async function loginViaAPI(page: Page, role: TestUserRole = 'employee') {
  const user = TEST_USERS[role]
  const res = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: user.email, password: user.password },
  })
  expect(res.ok(), `API login failed for ${user.email}: ${res.status()}`).toBeTruthy()
  const { token } = await res.json()

  await page.context().addCookies([{
    name: 'auth_token',
    value: token,
    domain: 'localhost',
    path: '/',
    sameSite: 'Lax',
    expires: Date.now() / 1000 + 604800,
  }])
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
}

export async function logout(page: Page) {
  if (page.url().includes('/login')) return
  try {
    await page.getByRole('button', { name: 'Выйти' }).click({ timeout: 3_000 })
    await expect(page).toHaveURL('/login', { timeout: 5_000 })
  } catch {
    await page.goto('/login')
  }
}
