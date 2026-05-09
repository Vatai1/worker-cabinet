import { test, expect } from '@playwright/test'
import { loginViaUI, logout } from './helpers/auth'
import { TEST_USERS } from './helpers/constants'

test.describe('Авторизация', () => {
  test('страница логина отображается корректно', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Личный кабинет')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Пароль')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
    await expect(page.getByText('ivanov@example.com')).toBeVisible()
  })

  test('успешный вход сотрудника', async ({ page }) => {
    await loginViaUI(page, 'employee')
    await expect(page.getByText(/Добро пожаловать.*Иван/)).toBeVisible()
  })

  test('успешный вход руководителя', async ({ page }) => {
    await loginViaUI(page, 'manager')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('успешный вход администратора', async ({ page }) => {
    await loginViaUI(page, 'admin')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('ошибка при неверном пароле', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(TEST_USERS.employee.email)
    await page.getByLabel('Пароль').fill('wrongpassword')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByText('Неверный email или пароль')).toBeVisible()
  })

  test('ошибка при несуществующем email', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('nobody@example.com')
    await page.getByLabel('Пароль').fill('password123')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByText('Неверный email или пароль')).toBeVisible()
  })

  test('ошибка при пустых полях', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.locator('#email:invalid, #password:invalid')).toHaveCount(2)
  })

  test('выход из системы', async ({ page }) => {
    await loginViaUI(page, 'employee')
    await logout(page)
    await expect(page).toHaveURL('/login')
  })

  test('редирект неавторизованного пользователя на /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })
})
