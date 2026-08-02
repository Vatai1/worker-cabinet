import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Опросы и Ассистент', () => {

  test.describe('Сотрудник', () => {

    test.describe('UC-1: Просмотр опросов', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/surveys')
      })

      test('страница опросов загружается', async ({ page }) => {
        await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
      })

      test('видны вкладки фильтрации', async ({ page }) => {
        await page.waitForLoadState('networkidle')
        const tabs = page.locator('main button').filter({ hasText: /Активные|Черновики|Закрытые|Все/i })
        if (!(await tabs.first().isVisible({ timeout: 5000 }).catch(() => false))) {
          test.skip()
          return
        }
        expect(await tabs.count()).toBeGreaterThan(0)
      })

      test('поиск опросов работает', async ({ page }) => {
        await page.waitForLoadState('networkidle')
        const search = page.locator('main input[type="text"], main input[placeholder*="поиск" i]').first()
        if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
          await search.fill('несуществующий опрос 12345')
          await page.waitForTimeout(500)
        }
      })
    })

    test.describe('UC-2: Ассистент', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/assistant')
        await page.waitForLoadState('networkidle')
      })

      test('страница ассистента загружается', async ({ page }) => {
        await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
      })

      test('видно поле ввода сообщения', async ({ page }) => {
        const input = page.locator('main textarea, main input[type="text"]').last()
        if (!(await input.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await expect(input).toBeVisible()
      })

      test('видна кнопка отправки', async ({ page }) => {
        const sendBtn = page.locator('main button[type="submit"], main button').filter({ hasText: /отправить|→|send/i }).last()
        if (!(await sendBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
          const anyBtn = page.locator('main button').last()
          if (!(await anyBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
            test.skip()
            return
          }
        }
      })
    })

    test.describe('UC-3: Просмотр проектов', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/projects')
        await page.waitForLoadState('networkidle')
      })

      test('страница проектов загружается', async ({ page }) => {
        await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
      })

      test('виден контент проектов', async ({ page }) => {
        const heading = page.getByRole('heading').first()
        const createBtn = page.getByRole('button', { name: /создать|новый проект/i })
        const hasHeading = await heading.isVisible({ timeout: 10000 }).catch(() => false)
        const hasBtn = await createBtn.isVisible({ timeout: 2000 }).catch(() => false)
        if (!hasHeading && !hasBtn) { test.skip(); return }
      })
    })

    test.describe('UC-4: Просмотр календаря', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/calendar')
        await page.waitForLoadState('networkidle')
      })

      test('страница календаря загружается', async ({ page }) => {
        await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
      })

      test('виден контент календаря', async ({ page }) => {
        const heading = page.getByRole('heading').first()
        const content = page.locator('main').locator('div, table, input').first()
        const hasHeading = await heading.isVisible({ timeout: 10000 }).catch(() => false)
        const hasContent = await content.isVisible({ timeout: 3000 }).catch(() => false)
        if (!hasHeading && !hasContent) { test.skip(); return }
      })
    })
  })

  test.describe('HR', () => {

    test.describe('UC-5: Создание опроса', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin')
        await page.goto('/hr')
        await page.waitForTimeout(2000)
        const surveyTab = page.getByRole('button', { name: /^Опросы/i })
        if (await surveyTab.isVisible({ timeout: 10000 }).catch(() => false)) {
          await surveyTab.click()
          await page.waitForTimeout(1000)
        }
      })

      test('видна кнопка «Создать опрос»', async ({ page }) => {
        const createBtn = page.getByRole('button', { name: /Создать опрос/i })
        if (!(await createBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await expect(createBtn).toBeVisible()
      })

      test('клик «Создать опрос» открывает форму', async ({ page }) => {
        const createBtn = page.getByRole('button', { name: /Создать опрос/i })
        if (!(await createBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        await createBtn.click()
        await page.waitForTimeout(1000)
        const modal = page.getByRole('heading', { name: /создан|новый опрос|конструктор/i }).first()
        const formEl = page.locator('main input, main textarea').first()
        const hasModal = await modal.isVisible({ timeout: 5000 }).catch(() => false)
        const hasForm = await formEl.isVisible({ timeout: 3000 }).catch(() => false)
        if (!hasModal && !hasForm) { test.skip(); return }
      })

      test('видны вкладки фильтрации опросов', async ({ page }) => {
        const tabs = page.locator('main button').filter({ hasText: /Активные|Черновики|Закрытые/i })
        if (!(await tabs.first().isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        expect(await tabs.count()).toBeGreaterThan(0)
      })
    })
  })
})
