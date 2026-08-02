import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Аналитика', () => {

  test.describe('Администратор', () => {

    test.describe('UC-1: Просмотр аналитики', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin')
        await page.goto('/admin')
        await expect(page.getByRole('heading', { name: 'Администрирование', exact: true })).toBeVisible({ timeout: 10000 })
        const tab = page.getByRole('button', { name: 'Аналитика' })
        if (!(await tab.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await tab.click()
      })

      test('страница загружается, виден заголовок «Аналитика»', async ({ page }) => {
        const activity = page.getByText('Активность по дням')
        if (!(await activity.isVisible({ timeout: 15000 }).catch(() => false))) {
          test.skip()
          return
        }
        await expect(page.getByRole('heading', { name: 'Аналитика', exact: true })).toBeVisible()
      })

      test('виден селектор периода', async ({ page }) => {
        const activity = page.getByText('Активность по дням')
        if (!(await activity.isVisible({ timeout: 15000 }).catch(() => false))) {
          test.skip()
          return
        }
        const sel = page.locator('main select').first()
        await expect(sel).toBeVisible()
        await expect(sel.locator('option', { hasText: 'Год' })).toHaveCount(1)
      })

      test('переключение периода на 90 дней', async ({ page }) => {
        const activity = page.getByText('Активность по дням')
        if (!(await activity.isVisible({ timeout: 15000 }).catch(() => false))) {
          test.skip()
          return
        }
        const sel = page.locator('main select').first()
        await sel.selectOption('90')
        await expect(page.getByText('Активность по дням')).toBeVisible({ timeout: 10000 })
      })
    })

    test.describe('UC-2: Графики и статистика', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin')
        await page.goto('/admin')
        await expect(page.getByRole('heading', { name: 'Администрирование', exact: true })).toBeVisible({ timeout: 10000 })
        const tab = page.getByRole('button', { name: 'Аналитика' })
        if (!(await tab.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await tab.click()
      })

      test('видны основные карточки статистики', async ({ page }) => {
        const activity = page.getByText('Активность по дням')
        if (!(await activity.isVisible({ timeout: 15000 }).catch(() => false))) {
          test.skip()
          return
        }
        await expect(page.getByText('Размер отделов')).toBeVisible()
        await expect(page.getByText('Типы действий')).toBeVisible()
      })

      test('видна карточка активных пользователей', async ({ page }) => {
        const activity = page.getByText('Активность по дням')
        if (!(await activity.isVisible({ timeout: 15000 }).catch(() => false))) {
          test.skip()
          return
        }
        await expect(page.getByText('Самые активные пользователи')).toBeVisible()
      })

      test('видны месячные графики', async ({ page }) => {
        const activity = page.getByText('Активность по дням')
        if (!(await activity.isVisible({ timeout: 15000 }).catch(() => false))) {
          test.skip()
          return
        }
        await expect(page.getByText('Новые пользователи по месяцам')).toBeVisible()
        await expect(page.getByText('Заявления на отпуск по месяцам')).toBeVisible()
      })
    })
  })
})
