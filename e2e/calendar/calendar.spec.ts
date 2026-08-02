import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Календарь', () => {

  test.describe('Сотрудник', () => {

    test.describe('UC-1: Просмотр календаря', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/calendar')
        await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
      })

      test('страница загружается — заголовок и подпись', async ({ page }) => {
        await expect(page.getByText('Расписание')).toBeVisible()
      })

      test('видны переключатели вида: Месяц, Неделя, День', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Месяц', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Неделя', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'День', exact: true })).toBeVisible()
      })

      test('видна кнопка навигации «Сегодня»', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Сегодня', exact: true })).toBeVisible()
      })

      test('видна боковая панель календарей', async ({ page }) => {
        await expect(page.getByText('Отпуска', { exact: true })).toBeVisible()
        await expect(page.getByText('На согласовании', { exact: true })).toBeVisible()
      })
    })

    test.describe('UC-2: Навигация и переключение видов', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/calendar')
        await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
      })

      test('переключение на вид «Месяц» меняет заголовок периода', async ({ page }) => {
        const title = page.getByRole('heading').filter({ hasNotText: 'Календарь' })
        const before = await title.textContent()
        await page.getByRole('button', { name: 'Месяц', exact: true }).click()
        await expect(title).not.toHaveText(before || '')
      })

      test('переключение на вид «День» показывает день недели', async ({ page }) => {
        const title = page.getByRole('heading').filter({ hasNotText: 'Календарь' })
        await page.getByRole('button', { name: 'День', exact: true }).click()
        await expect(title).toContainText(/понедельник|вторник|среда|четверг|пятница|суббота|воскресенье/)
      })

      test('кнопка «Сегодня» кликабельна', async ({ page }) => {
        const today = page.getByRole('button', { name: 'Сегодня', exact: true })
        await today.click()
        await expect(today).toBeVisible()
      })
    })
  })
})
