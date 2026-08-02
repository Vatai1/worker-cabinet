import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Документы', () => {

  test.describe('Сотрудник', () => {

    test.describe('UC-1: Просмотр личных документов', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/documents')
        await expect(page.getByRole('heading', { name: 'Документы', exact: true })).toBeVisible()
      })

      test('страница загружается — заголовок и подзаголовок', async ({ page }) => {
        await expect(page.getByText('Личные документы: договоры, сертификаты и другие файлы')).toBeVisible()
      })

      test('видны кнопки фильтрации по категориям', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Все', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Договоры' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Сертификаты' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Другое' })).toBeVisible()
      })

      test('видно поле поиска документов', async ({ page }) => {
        await expect(page.getByPlaceholder('Поиск документов...')).toBeVisible()
      })

      test('видны карточки статистики', async ({ page }) => {
        await expect(page.getByText('Всего документов')).toBeVisible()
        await expect(page.getByText('Общий размер')).toBeVisible()
      })
    })

    test.describe('UC-2: Поиск и фильтрация документов', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/documents')
        await expect(page.getByRole('heading', { name: 'Документы', exact: true })).toBeVisible()
      })

      test('ввод текста в поле поиска', async ({ page }) => {
        await page.getByPlaceholder('Поиск документов...').fill('договор')
        await expect(page.getByPlaceholder('Поиск документов...')).toHaveValue('договор')
      })

      test('переключение фильтра на «Договоры»', async ({ page }) => {
        await page.getByRole('button', { name: 'Договоры' }).click()
        await expect(page.getByRole('button', { name: 'Договоры' })).toBeVisible()
      })

      test('переключение фильтра на «Сертификаты»', async ({ page }) => {
        await page.getByRole('button', { name: 'Сертификаты' }).click()
        await expect(page.getByRole('button', { name: 'Сертификаты' })).toBeVisible()
      })
    })
  })
})
