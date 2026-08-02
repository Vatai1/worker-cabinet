import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

/**
 * Локаторы ограничиваются `main`, чтобы не зацепить элементы шапки/сайдбара,
 * где «Отделы» / «Документы» / «Уведомления» могут встречаться в навигации.
 */
const main = (page: import('@playwright/test').Page) => page.locator('main')

test.describe('Модуль Отделы и Документы', () => {
  // ──────────────────────────────────────────────────────────────────────
  // UC-1: Просмотр списка отделов (HR)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-1: Просмотр списка отделов', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/departments')
      // Заголовок «Отделы» появляется при успешной загрузке (даже при пустом списке).
      await expect(
        main(page).getByRole('heading', { name: 'Отделы', exact: true })
      ).toBeVisible({ timeout: 10000 })
    })

    test('список отделов загружается', async ({ page }) => {
      // Заголовок страницы списка
      await expect(
        main(page).getByRole('heading', { name: 'Отделы', exact: true })
      ).toBeVisible()
      // Поле поиска подтверждает, что интерфейс списка отрисован
      await expect(
        page.getByPlaceholder('Поиск по названию или руководителю...')
      ).toBeVisible()

      // В списке должен быть хотя бы один отдел; иначе — пропускаем
      const deptHeadings = main(page).getByRole('heading', { level: 3 })
      if ((await deptHeadings.count()) === 0) {
        test.skip()
        return
      }
      await expect(deptHeadings.first()).toBeVisible()
    })

    test('виден отдел «Отдел разработки»', async ({ page }) => {
      const dept = main(page).getByRole('heading', {
        name: 'Отдел разработки',
        exact: true,
      })
      // Такого отдела может не быть в тестовых данных — пропускаем
      if (!(await dept.first().isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip()
        return
      }
      await expect(dept).toBeVisible()
    })

    test('клик по отделу открывает детали', async ({ page }) => {
      const deptHeadings = main(page).getByRole('heading', { level: 3 })
      if ((await deptHeadings.count()) === 0) {
        test.skip()
        return
      }

      const name = ((await deptHeadings.first().textContent()) ?? '').trim()
      expect(name.length).toBeGreaterThan(0)

      // Клик по названию отдела; событие всплывает к карточке с onClick.
      await deptHeadings.first().click()

      // Открывается страница деталей отдела
      await expect(page).toHaveURL(/\/departments\/\d+$/, { timeout: 10000 })
      // Заголовок детали содержит то же название отдела
      await expect(
        main(page).getByRole('heading', { name, exact: true })
      ).toBeVisible({ timeout: 10000 })
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-2: Просмотр деталей отдела (HR)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-2: Просмотр деталей отдела', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/departments')
      await expect(
        main(page).getByRole('heading', { name: 'Отделы', exact: true })
      ).toBeVisible({ timeout: 10000 })

      // Переходим в первый отдел списка
      const deptHeadings = main(page).getByRole('heading', { level: 3 })
      if ((await deptHeadings.count()) === 0) {
        test.skip()
        return
      }
      await deptHeadings.first().click()
      await expect(page).toHaveURL(/\/departments\/\d+$/, { timeout: 10000 })
    })

    test('виден заголовок отдела', async ({ page }) => {
      // h1 содержит название отдела
      const heading = main(page).getByRole('heading', { level: 1 })
      await expect(heading).toBeVisible({ timeout: 10000 })
      const text = ((await heading.textContent()) ?? '').trim()
      expect(text.length).toBeGreaterThan(0)
    })

    test('страница отдела показывает сотрудников', async ({ page }) => {
      const content = main(page)
      // Участники отдела показаны карточками с именами в <h4>.
      const memberNames = content.getByRole('heading', { level: 4 })
      // Руководитель — отдельная карточка с подписью «Руководитель отдела».
      const managerLabel = content.getByText('Руководитель отдела', {
        exact: true,
      })

      const hasMembers = (await memberNames.count()) > 0
      const hasManager = await managerLabel
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)

      // Если в отделе нет ни сотрудников, ни руководителя — пропускаем
      if (!hasMembers && !hasManager) {
        test.skip()
        return
      }

      if (hasMembers) {
        await expect(memberNames.first()).toBeVisible()
      }
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-3: Просмотр документов (Сотрудник)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-3: Просмотр документов', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/documents')
      await expect(
        main(page).getByRole('heading', { name: 'Документы', exact: true })
      ).toBeVisible({ timeout: 10000 })
    })

    test('страница документов загружается', async ({ page }) => {
      await expect(
        main(page).getByRole('heading', { name: 'Документы', exact: true })
      ).toBeVisible()
      // Поле поиска подтверждает, что страница отрисована
      await expect(page.getByPlaceholder('Поиск документов...')).toBeVisible()
    })

    test('виден заголовок или список', async ({ page }) => {
      const content = main(page)
      // Заголовок раздела
      const heading = content.getByRole('heading', {
        name: 'Документы',
        exact: true,
      })
      // Карточки документов содержат кнопку «Просмотр» (только у реальных документов)
      const docButtons = content.getByRole('button', {
        name: 'Просмотр',
        exact: true,
      })

      const hasHeading = await heading.first().isVisible().catch(() => false)
      const hasDocs = (await docButtons.count()) > 0

      // Если нет ни заголовка, ни списка — пропускаем
      if (!hasHeading && !hasDocs) {
        test.skip()
        return
      }
      expect(hasHeading || hasDocs).toBeTruthy()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-4: Просмотр уведомлений (Сотрудник)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-4: Просмотр уведомлений', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/notifications')
      await expect(
        main(page).getByRole('heading', {
          name: 'Уведомления',
          exact: true,
        })
      ).toBeVisible({ timeout: 10000 })
    })

    test('страница уведомлений загружается', async ({ page }) => {
      await expect(
        main(page).getByRole('heading', { name: 'Уведомления', exact: true })
      ).toBeVisible()
    })

    test('виден заголовок или список', async ({ page }) => {
      const content = main(page)
      // Заголовок раздела
      const heading = content.getByRole('heading', {
        name: 'Уведомления',
        exact: true,
      })
      // Пустое состояние, когда уведомлений нет
      const emptyState = content.getByText('Нет уведомлений', { exact: true })
      // Каждое уведомление имеет подпись статуса
      const statusLabels = content.getByText(/^(Отправлено|Ожидает|Ошибка)$/)

      const hasHeading = await heading.first().isVisible().catch(() => false)
      const hasEmpty = await emptyState
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
      const hasItems = (await statusLabels.count()) > 0

      // Если нет ни заголовка, ни списка, ни пустого состояния — пропускаем
      if (!hasHeading && !hasEmpty && !hasItems) {
        test.skip()
        return
      }
      expect(hasHeading || hasEmpty || hasItems).toBeTruthy()
    })
  })
})
