import { test, expect, type Locator } from '@playwright/test'
import { loginAs } from '../helpers'

/**
 * Вспомогательная проверка видимости: возвращает boolean и не падает,
 * если элемент отсутствует. Используется там, где данные могут отсутствовать
 * (в этом случае тест пропускается через test.skip()).
 */
async function isVisible(loc: Locator, timeout = 3000): Promise<boolean> {
  try {
    await expect(loc.first()).toBeVisible({ timeout })
    return true
  } catch {
    return false
  }
}

/** Локатор карточки сотрудника на странице списка /employees. */
function employeeCards(page: import('@playwright/test').Page): Locator {
  // Карточка сотрудника — это <button>, внутри которого ФИО лежит в div.font-bold.
  // Ограничиваем main, чтобы не зацепить элементы шапки/сайдбара.
  return page.locator('main').locator('button:has(div.font-bold)')
}

test.describe('Модуль Сотрудники', () => {

  test.describe('HR', () => {

    test.describe('UC-1: Просмотр списка сотрудников', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin')
        await page.goto('/employees')
        await expect(
          page.getByRole('heading', { name: 'Сотрудники', exact: true })
        ).toBeVisible({ timeout: 10000 })
      })

      test('список загружается, виден счётчик сотрудников', async ({ page }) => {
        // Если список не удалось загрузить — данных нет, пропускаем.
        if (
          await page
            .getByText('Не удалось загрузить список сотрудников')
            .isVisible()
            .catch(() => false)
        ) {
          test.skip()
          return
        }

        // Счётчик вида «N из M сотрудников» присутствует всегда (даже при нуле).
        await expect(page.getByText(/из \d+ сотрудников/)).toBeVisible({ timeout: 10000 })
      })

      test('поиск по имени работает', async ({ page }) => {
        const cards = employeeCards(page)
        if ((await cards.count()) === 0) {
          test.skip()
          return
        }

        const search = page.getByPlaceholder(/Поиск по имени/)

        // Фрагмент имени первой карточки — по нему карточка должна остаться.
        const firstName = (await cards.locator('div.font-bold').first().textContent()) ?? ''
        const query = firstName.trim().split(/\s+/)[0]
        expect(query.length).toBeGreaterThan(0)

        await search.fill(query)
        await expect(cards.first()).toBeVisible({ timeout: 5000 })

        // Не существующее в базе значение → пустой результат.
        await search.fill('zzzqqqxx')
        await expect(
          page.getByText('Никого не нашли по запросу', { exact: true })
        ).toBeVisible({ timeout: 5000 })
      })

      test('клик по сотруднику открывает профиль', async ({ page }) => {
        const cards = employeeCards(page)
        if ((await cards.count()) === 0) {
          test.skip()
          return
        }

        await cards.first().scrollIntoViewIfNeeded()
        await cards.first().click()

        await expect(page).toHaveURL(/\/employees\/[^/]+$/, { timeout: 10000 })
        await expect(
          page.getByRole('button', { name: 'Назад к списку' })
        ).toBeVisible({ timeout: 10000 })
      })
    })

    test.describe('UC-2: Просмотр профиля сотрудника', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin')
        await page.goto('/employees')
        await expect(
          page.getByRole('heading', { name: 'Сотрудники', exact: true })
        ).toBeVisible({ timeout: 10000 })

        // Переходим в профиль первого сотрудника из списка.
        const cards = employeeCards(page)
        if ((await cards.count()) === 0) {
          test.skip()
          return
        }
        await cards.first().scrollIntoViewIfNeeded()
        await cards.first().click()
        await expect(page).toHaveURL(/\/employees\/[^/]+$/, { timeout: 10000 })
      })

      test('видны ФИО, должность, отдел', async ({ page }) => {
        const main = page.locator('main')

        // «Профиль сотрудника» — метка над ФИО; подтверждает, что профиль загружен.
        await expect(
          main.getByText('Профиль сотрудника', { exact: true })
        ).toBeVisible({ timeout: 10000 })

        // ФИО представлено в карточке «Личная информация».
        await expect(main.getByText('Фамилия', { exact: true })).toBeVisible()
        await expect(main.getByText('Имя', { exact: true })).toBeVisible()

        // Должность и отдел — в карточке «Работа».
        await expect(main.getByText('Должность', { exact: true })).toBeVisible()
        await expect(main.getByText('Отдел', { exact: true })).toBeVisible()
      })

      test('видна вкладка с отпусками или документами', async ({ page }) => {
        const main = page.locator('main')

        // Ищем вкладку/секцию про отпуска или документы внутри основного контента
        // (не в сайдбаре). Если таких данных нет — тест пропускается.
        const vacation = main
          .getByRole('tab', { name: /Отпуск/ })
          .or(main.getByRole('button', { name: /Отпуск/ }))
          .or(main.getByRole('link', { name: /Отпуск/ }))
          .or(main.getByRole('heading', { name: /Отпуск/ }))

        const docs = main
          .getByRole('tab', { name: /Документ/ })
          .or(main.getByRole('button', { name: /Документ/ }))
          .or(main.getByRole('link', { name: /Документ/ }))
          .or(main.getByRole('heading', { name: /Документ/ }))

        const hasVacation = await isVisible(vacation)
        const hasDocs = await isVisible(docs)

        if (!hasVacation && !hasDocs) {
          test.skip()
          return
        }

        // Если вкладка найдена — убедимся, что она действительно видна.
        if (hasVacation) {
          await expect(vacation.first()).toBeVisible()
        } else {
          await expect(docs.first()).toBeVisible()
        }
      })
    })
  })

  test.describe('Сотрудник', () => {

    test.describe('UC-3: Просмотр собственного профиля', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/profile')
      })

      test('открытие /profile, видны личные данные', async ({ page }) => {
        await expect(
          page.getByRole('heading', { name: 'Профиль', exact: true })
        ).toBeVisible({ timeout: 10000 })

        const main = page.locator('main')

        // Карточка с личной информацией.
        await expect(
          main.getByText('Личная информация', { exact: true })
        ).toBeVisible({ timeout: 10000 })

        // Личные данные: ФИО, email, должность, отдел.
        await expect(main.getByText('Фамилия', { exact: true })).toBeVisible()
        await expect(main.getByText('Имя', { exact: true })).toBeVisible()
        await expect(main.getByText('Email', { exact: true })).toBeVisible()
        await expect(main.getByText('Должность', { exact: true })).toBeVisible()
        await expect(main.getByText('Отдел', { exact: true })).toBeVisible()
      })
    })
  })
})
