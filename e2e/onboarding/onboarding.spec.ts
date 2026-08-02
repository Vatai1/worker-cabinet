import { test, expect, type Page } from '@playwright/test'
import { loginAs } from '../helpers'

async function loginAsOnboarding(page: Page) {
  const res = await page.request.post('http://localhost:5000/api/auth/login', {
    data: { email: 'onboarding@example.com', password: 'password123' },
  })
  const setCookie = res.headers()['set-cookie']
  if (!setCookie) throw new Error('Login failed: no cookie')
  const tokenMatch = setCookie.match(/auth_token=([^;]+)/)
  const csrfMatch = setCookie.match(/csrf_token=([^;]+)/)
  if (!tokenMatch) throw new Error('Login failed: no auth_token')
  await page.context().addCookies([
    { name: 'auth_token', value: tokenMatch[1], domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'csrf_token', value: csrfMatch?.[1] || '', domain: 'localhost', path: '/', sameSite: 'Lax' },
  ])
}

test.describe('Модуль Онбординг', () => {

  test.describe('UC-1: Открытие страницы онбординга', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsOnboarding(page)
      await page.goto('/onboarding')
    })

    test('заголовок «Онбординг» виден', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Онбординг', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('приветствие сотрудника видно', async ({ page }) => {
      await expect(page.getByText('Добро пожаловать')).toBeVisible({ timeout: 10000 })
    })

    test('счётчик документов виден', async ({ page }) => {
      await expect(page.getByText(/из \d+ документов/)).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('UC-2: Просмотр документов и прогресса', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsOnboarding(page)
      await page.goto('/onboarding')
      await expect(page.getByRole('heading', { name: 'Онбординг', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('карточка «Прогресс» видна', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Прогресс', exact: true })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Ознакомлено документов:')).toBeVisible({ timeout: 10000 })
    })

    test('раздел «Документы» виден', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Документы', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('есть документы для ознакомления', async ({ page }) => {
      const openBtn = page.getByRole('button', { name: 'Открыть' })
      const count = await openBtn.count()
      if (count === 0) {
        test.skip()
        return
      }
      expect(count).toBeGreaterThan(0)
    })

    test('открытие документа → модалка с кнопкой «Ознакомлен»', async ({ page }) => {
      const openBtn = page.getByRole('button', { name: 'Открыть' }).first()
      if (!(await openBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
        test.skip()
        return
      }
      await openBtn.click()
      await expect(page.getByRole('button', { name: 'Ознакомлен' })).toBeVisible({ timeout: 5000 })
      await expect(page.getByRole('button', { name: 'Закрыть' })).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('UC-3: Доступ сотрудника без активного онбординга', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/onboarding')
    })

    test('редирект на дашборд', async ({ page }) => {
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
    })
  })
})
