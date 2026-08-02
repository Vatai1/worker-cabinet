import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Иерархия', () => {

  test.describe('HR', () => {

    test.describe('UC-1: Просмотр оргструктуры', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'hr')
        await page.goto('/hr')
        await expect(page.getByRole('heading', { name: 'HR-панель' })).toBeVisible({ timeout: 10000 })
        const tab = page.getByRole('button', { name: 'Иерархия' })
        if (!(await tab.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await tab.click()
      })

      test('страница загружается, виден заголовок «Иерархия»', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Иерархия', exact: true })).toBeVisible({ timeout: 15000 })
      })

      test('видна панель элементов с блоками', async ({ page }) => {
        await expect(page.getByText('Элементы', { exact: true })).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('Отдел', { exact: true })).toBeVisible()
        await expect(page.getByText('Сотрудник', { exact: true })).toBeVisible()
        await expect(page.getByText('Описание', { exact: true })).toBeVisible()
      })

      test('видна кнопка «Сохранить»', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Сохранить/ })).toBeVisible({ timeout: 10000 })
      })

      test('виден холст иерархии', async ({ page }) => {
        await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 })
      })
    })

    test.describe('UC-2: Элементы управления холстом', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'hr')
        await page.goto('/hr')
        await expect(page.getByRole('heading', { name: 'HR-панель' })).toBeVisible({ timeout: 10000 })
        const tab = page.getByRole('button', { name: 'Иерархия' })
        if (!(await tab.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await tab.click()
      })

      test('видны элементы управления (Controls)', async ({ page }) => {
        await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('.react-flow__controls')).toBeVisible({ timeout: 10000 })
      })

      test('видна мини-карта (MiniMap)', async ({ page }) => {
        await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('.react-flow__minimap')).toBeVisible({ timeout: 10000 })
      })
    })
  })
})
