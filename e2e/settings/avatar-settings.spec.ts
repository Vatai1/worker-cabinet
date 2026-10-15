import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test('настройки: выбор сгенерированной аватарки и сброс', async ({ page }) => {
  await loginAs(page, 'employee')
  await page.request.delete('http://localhost:5000/api/users/me/avatar')
  await page.goto('/settings')

  const card = page.locator('div', { has: page.getByText('Сгенерированные аватарки') }).last()
  await expect(page.getByRole('button', { name: 'Загрузить фото' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выбрать эту аватарку' })).toHaveCount(8)

  await card.getByRole('button', { name: 'Другие варианты' }).click()
  const [upload] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/users/me/avatar') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Выбрать эту аватарку' }).first().click(),
  ])
  expect(upload.status()).toBe(200)
  expect((await upload.json()).avatar).toBeTruthy()
  await expect(page.getByText('Аватар обновлён')).toBeVisible()
  await page.screenshot({ path: 'test-results/avatar-settings.png' })

  await page.getByRole('button', { name: 'Сбросить', exact: true }).first().click()
  const [reset] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/users/me/avatar') && r.request().method() === 'DELETE'),
    page.getByRole('button', { name: 'Сбросить', exact: true }).last().click(),
  ])
  expect(reset.status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Сбросить', exact: true })).toHaveCount(0)
})

test('настройки: карточки сворачиваются и запоминают состояние', async ({ page }) => {
  await loginAs(page, 'employee')
  await page.goto('/settings')
  await page.evaluate(() => localStorage.removeItem('collapsed_settings_appearance'))
  await page.reload()

  const header = page.getByRole('button', { name: /Оформление/ })
  await expect(header).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('Темная тема')).toBeVisible()

  await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('Темная тема')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('button', { name: /Оформление/ })).toHaveAttribute('aria-expanded', 'false')
  await page.screenshot({ path: 'test-results/settings-collapsible.png' })

  await page.getByRole('button', { name: /Оформление/ }).click()
  await expect(page.getByText('Темная тема')).toBeVisible()
})
