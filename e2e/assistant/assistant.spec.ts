import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Ассистент', () => {

  test.describe('UC-1: Открытие страницы ассистента', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/assistant')
    })

    test('заголовок «Ассистент» виден', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Ассистент', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('кнопка «Новый чат» видна', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Новый чат/ })).toBeVisible({ timeout: 10000 })
    })

    test('описание возможностей видно', async ({ page }) => {
      await expect(page.getByText('Задайте вопрос о кадровых процедурах')).toBeVisible({ timeout: 10000 })
    })

    test('кнопка «Начать чат» видна', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Начать чат/ })).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('UC-2: Создание нового чата', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/assistant')
      await expect(page.getByRole('heading', { name: 'Ассистент', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('кнопка «Начать чат» открывает поле ввода', async ({ page }) => {
      await page.getByRole('button', { name: /Начать чат/ }).click()
      await expect(page.getByPlaceholder('Напишите сообщение...')).toBeVisible({ timeout: 5000 })
    })

    test('кнопка «Новый чат» открывает поле ввода', async ({ page }) => {
      await page.getByRole('button', { name: /Новый чат/ }).click()
      await expect(page.getByPlaceholder('Напишите сообщение...')).toBeVisible({ timeout: 5000 })
    })

    test('приветствие ассистента видно в новом чате', async ({ page }) => {
      await page.getByRole('button', { name: /Начать чат/ }).click()
      await expect(page.getByPlaceholder('Напишите сообщение...')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText(/Чем могу помочь/)).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('UC-3: Ввод сообщения', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/assistant')
      await expect(page.getByRole('heading', { name: 'Ассистент', exact: true })).toBeVisible({ timeout: 10000 })
      await page.getByRole('button', { name: /Начать чат/ }).click()
      await expect(page.getByPlaceholder('Напишите сообщение...')).toBeVisible({ timeout: 5000 })
    })

    test('кнопка отправки заблокирована при пустом вводе', async ({ page }) => {
      const sendBtn = page.getByPlaceholder('Напишите сообщение...').locator('xpath=following-sibling::button')
      await expect(sendBtn).toBeDisabled()
    })

    test('ввод текста разблокирует кнопку отправки', async ({ page }) => {
      const input = page.getByPlaceholder('Напишите сообщение...')
      const sendBtn = input.locator('xpath=following-sibling::button')
      await input.fill('Привет')
      await expect(sendBtn).toBeEnabled()
    })

    test('отправка сообщения добавляет его в ленту', async ({ page }) => {
      const input = page.getByPlaceholder('Напишите сообщение...')
      const sendBtn = input.locator('xpath=following-sibling::button')
      await input.fill('Сколько у меня отпускных дней?')
      await sendBtn.click()
      await expect(page.getByText('Сколько у меня отпускных дней?')).toBeVisible({ timeout: 5000 })
      await expect(input).toHaveText('')
    })
  })
})
