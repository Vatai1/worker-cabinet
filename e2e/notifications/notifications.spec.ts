import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Уведомления', () => {

  test.describe('Сотрудник', () => {

    test.describe('UC-1: Просмотр уведомлений', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/notifications')
        await expect(page.getByRole('heading', { name: 'Уведомления', exact: true })).toBeVisible()
      })

      test('страница загружается — заголовок и подзаголовок', async ({ page }) => {
        await expect(page.getByText('Все уведомления и почтовые рассылки в одном месте')).toBeVisible()
      })

      test('видна подпись «Центр сообщений»', async ({ page }) => {
        await expect(page.getByText('Центр сообщений')).toBeVisible()
      })

      test('отображается контент уведомлений', async ({ page }) => {
        await page.waitForLoadState('networkidle')
        const empty = page.getByText('Нет уведомлений')
        if (await empty.isVisible({ timeout: 3000 }).catch(() => false)) {
          return
        }
        await expect(page.getByText(/Отправлено|Ожидает|Ошибка/).first()).toBeVisible({ timeout: 5000 })
      })
    })

    test.describe('UC-2: Взаимодействие с уведомлениями', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/notifications')
        await expect(page.getByRole('heading', { name: 'Уведомления', exact: true })).toBeVisible()
      })

      test('кнопка «Прочитать все» доступна при наличии непрочитанных', async ({ page }) => {
        const btn = page.getByRole('button', { name: 'Прочитать все' })
        if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) {
          test.skip()
          return
        }
        await expect(btn).toBeEnabled()
      })

      test('клик «Прочитать все» скрывает кнопку', async ({ page }) => {
        const btn = page.getByRole('button', { name: 'Прочитать все' })
        if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) {
          test.skip()
          return
        }
        await btn.click()
        await expect(btn).toHaveCount(0, { timeout: 5000 })
      })

      test('пагинация — переход на следующую страницу', async ({ page }) => {
        const next = page.getByRole('button', { name: 'Далее', exact: true })
        if (!(await next.isVisible({ timeout: 5000 }).catch(() => false))) {
          test.skip()
          return
        }
        await next.click()
        await expect(page.getByRole('button', { name: 'Назад', exact: true })).toBeEnabled()
      })
    })
  })
})
