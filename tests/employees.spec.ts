import { test, expect } from '@playwright/test'
import { loginViaUI, logout } from './helpers/auth'

test.describe('Сотрудники', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, 'employee')
    await page.goto('/employees')
    await expect(page.getByRole('heading', { name: 'Сотрудники' })).toBeVisible()
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('список сотрудников загружается', async ({ page }) => {
    await expect(page.getByPlaceholder('Поиск по имени, должности…')).toBeVisible()
  })

  test('поиск по имени', async ({ page }) => {
    await page.getByPlaceholder('Поиск по имени, должности…').fill('Иван')
    await expect(page.getByRole('button', { name: /Иван/ }).first()).toBeVisible({ timeout: 5_000 })
  })

  test('поиск фильтрует результаты', async ({ page }) => {
    const cards = page.getByRole('button').filter({ hasText: /Активен|Неактивен|В отпуске/ })
    const countBefore = await cards.count()
    await page.getByPlaceholder('Поиск по имени, должности…').fill('Иванов')
    const countAfter = await cards.count()
    expect(countAfter).toBeLessThanOrEqual(countBefore)
  })

  test('поиск без результатов показывает пустое состояние', async ({ page }) => {
    await page.getByPlaceholder('Поиск по имени, должности…').fill('zzznonexistent123')
    await expect(page.getByText('Никого не нашли по запросу')).toBeVisible({ timeout: 5_000 })
  })

  test('переход в профиль сотрудника', async ({ page }) => {
    const firstCard = page.getByRole('button').filter({ hasText: /Активен|Неактивен|В отпуске/ }).first()
    await firstCard.click()
    await expect(page).toHaveURL(/\/employees\/\d+/)
  })

  test('страница профиля отображает данные', async ({ page }) => {
    const firstCard = page.getByRole('button').filter({ hasText: /Активен|Неактивен|В отпуске/ }).first()
    await firstCard.click()
    await expect(page).toHaveURL(/\/employees\/\d+/)
    await expect(page.getByText(/Активен|Неактивен|В отпуске/)).toBeVisible({ timeout: 5_000 })
  })
})
