import { test, expect } from '@playwright/test'
import { loginViaUI, logout } from './helpers/auth'

test.describe('Отпуска', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('страница отпусков отображает баланс', async ({ page }) => {
    await expect(page.getByText(/Баланс/i)).toBeVisible({ timeout: 10_000 })
  })

  test('переключение видов календаря', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Отдел' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Мои отпуска' })).toBeVisible()
    await page.getByRole('button', { name: 'Мои отпуска' }).click()
    await expect(page.getByRole('button', { name: 'Мои отпуска' })).toHaveClass(/bg-background/)
  })

  test('навигация по годам', async ({ page }) => {
    const currentYear = new Date().getFullYear()
    await expect(page.getByText(String(currentYear))).toBeVisible()
    const prevButtons = page.locator('button').filter({ hasText: '◄' })
    if (await prevButtons.count() > 0) {
      await prevButtons.first().click()
    }
    const nextButtons = page.locator('button').filter({ hasText: '▶' })
    if (await nextButtons.count() > 0) {
      await nextButtons.last().click()
    }
  })

  test('кнопка "Заявление на отпуск" доступна', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Заявление на отпуск' })).toBeVisible()
  })

  test('кнопка "История заявок" доступна', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'История заявок' })).toBeVisible()
  })
})

test.describe('Отпуска — руководитель', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, 'manager')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('руководитель видит расширенный интерфейс', async ({ page }) => {
    await expect(page.getByText(/Управление отпусками сотрудников/)).toBeVisible()
  })
})
