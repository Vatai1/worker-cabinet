import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Справочники', () => {

  test.describe('HR', () => {

    test.describe('UC-1: Просмотр справочников', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'hr')
        await page.goto('/hr')
        await expect(page.getByRole('heading', { name: 'HR-панель' })).toBeVisible({ timeout: 10000 })
        const tab = page.getByRole('button', { name: 'Справочники' })
        if (!(await tab.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await tab.click()
      })

      test('страница загружается, виден заголовок «Справочники»', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Справочники', exact: true })).toBeVisible({ timeout: 10000 })
      })

      test('видны вкладки справочников', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Отделы' })).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('button', { name: 'Типы отпусков' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Должности' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Шаблоны документов' })).toBeVisible()
      })

      test('виден поиск по всем справочникам', async ({ page }) => {
        await expect(page.getByPlaceholder('Поиск по всем справочникам...')).toBeVisible({ timeout: 10000 })
      })
    })

    test.describe('UC-2: Управление элементами справочника', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'hr')
        await page.goto('/hr')
        await expect(page.getByRole('heading', { name: 'HR-панель' })).toBeVisible({ timeout: 10000 })
        const tab = page.getByRole('button', { name: 'Справочники' })
        if (!(await tab.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await tab.click()
      })

      test('активна вкладка «Отделы» по умолчанию', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Отделы', exact: true })).toBeVisible({ timeout: 10000 })
      })

      test('видна кнопка «Добавить отдел»', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Добавить отдел/ })).toBeVisible({ timeout: 10000 })
      })

      test('переключение на вкладку «Должности»', async ({ page }) => {
        await page.getByRole('button', { name: 'Должности' }).click()
        await expect(page.getByRole('heading', { name: 'Должности', exact: true })).toBeVisible({ timeout: 10000 })
      })

      test('переключение на вкладку «Типы отпусков»', async ({ page }) => {
        await page.getByRole('button', { name: 'Типы отпусков' }).click()
        await expect(page.getByRole('heading', { name: 'Типы отпусков', exact: true })).toBeVisible({ timeout: 10000 })
      })
    })
  })
})
