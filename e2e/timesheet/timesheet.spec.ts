import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Табель', () => {

  test.describe('UC-1: Открытие табеля отдела', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'manager')
      await page.goto('/leader/timesheet')
    })

    test('заголовок «Табель» виден', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Табель', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('подзаголовок про учёт времени виден', async ({ page }) => {
      await expect(page.getByText('Учёт рабочего времени сотрудников')).toBeVisible({ timeout: 10000 })
    })

    test('легенда классификатора видна', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Легенда классификатора' })).toBeVisible({ timeout: 15000 })
    })

    test('счётчик сотрудников виден', async ({ page }) => {
      await expect(page.getByText(/сотрудников/)).toBeVisible({ timeout: 15000 })
    })
  })

  test.describe('UC-2: Переключение периода', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'manager')
      await page.goto('/leader/timesheet')
      await expect(page.getByRole('heading', { name: 'Табель', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('выбор месяца и года доступен', async ({ page }) => {
      const selects = page.locator('select')
      await expect(selects.nth(0)).toBeVisible({ timeout: 10000 })
      await expect(selects.nth(1)).toBeVisible({ timeout: 10000 })
    })

    test('смена месяца перезагружает таблицу', async ({ page }) => {
      const selects = page.locator('select')
      await selects.nth(0).selectOption({ index: 1 })
      await expect(page.getByRole('heading', { name: 'Легенда классификатора' })).toBeVisible({ timeout: 15000 })
    })
  })

  test.describe('UC-3: Отправка табеля за сегодня', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'manager')
      await page.goto('/leader/timesheet')
      await expect(page.getByRole('heading', { name: 'Табель', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('кнопка отправки за сегодня видна', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Отправ.*за сегодня/ })).toBeVisible({ timeout: 15000 })
    })

    test('клик по кнопке отправки не падает', async ({ page }) => {
      const btn = page.getByRole('button', { name: /Отправ.*за сегодня/ }).first()
      if (!(await btn.isVisible({ timeout: 15000 }).catch(() => false))) {
        test.skip()
        return
      }
      await btn.click()
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'Табель', exact: true })).toBeVisible({ timeout: 15000 })
    })
  })
})
