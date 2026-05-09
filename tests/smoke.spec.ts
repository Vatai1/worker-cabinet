import { test, expect } from '@playwright/test'
import { loginViaUI, logout } from './helpers/auth'

test.describe('Smoke-тесты страниц', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, 'employee')
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('дашборд загружается', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Добро пожаловать/ })).toBeVisible()
    await expect(page.getByText('Дни отпуска')).toBeVisible()
    await expect(page.getByText('Стаж')).toBeVisible()
  })

  test('страница отпусков загружается', async ({ page }) => {
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible()
  })

  test('страница сотрудников загружается', async ({ page }) => {
    await page.goto('/employees')
    await expect(page.getByRole('heading', { name: 'Сотрудники' })).toBeVisible()
    await expect(page.getByPlaceholder('Поиск по имени, должности…')).toBeVisible()
  })

  test('страница отделов загружается', async ({ page }) => {
    await page.goto('/departments')
    await expect(page.getByRole('heading', { name: 'Отделы' })).toBeVisible()
  })

  test('страница документов загружается', async ({ page }) => {
    await page.goto('/documents')
    await expect(page.getByRole('heading', { name: /Документы/i })).toBeVisible({ timeout: 5_000 })
  })

  test('страница профиля загружается', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible()
  })

  test('навигация из сайдбара работает', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /Отпуск/ }).first().click()
    await expect(page).toHaveURL(/\/vacation/, { timeout: 5_000 })
    await page.getByRole('link', { name: /Сотрудники/ }).first().click()
    await expect(page).toHaveURL(/\/employees/, { timeout: 5_000 })
    await page.getByRole('link', { name: /Отделы/ }).first().click()
    await expect(page).toHaveURL(/\/departments/, { timeout: 5_000 })
  })
})
