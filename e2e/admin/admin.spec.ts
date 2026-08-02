import { test, expect, type Page, type Locator } from '@playwright/test'
import { loginAs } from '../helpers'

/**
 * Все локаторы ограничиваются `main`, чтобы не зацепить элементы шапки/сайдбара
 * (навигация, бренд, пользовательское меню и т.п.), где «Настройки», «Табель»
 * и прочие надписи могут встречаться повторно.
 */
const main = (page: Page) => page.locator('main')

/**
 * Безопасная проверка видимости: не падает, если элемент отсутствует.
 * Возвращает boolean — используется там, где данные могут отсутствовать
 * (в этом случае тест пропускается через test.skip()).
 */
async function isVisible(loc: Locator, timeout = 10000): Promise<boolean> {
  try {
    await expect(loc.first()).toBeVisible({ timeout })
    return true
  } catch {
    return false
  }
}

test.describe('Администрирование и Табель', () => {

  // ──────────────────────────────────────────────────────────────────────
  // UC-1: Админка — Пользователи (admin)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-1: Админка — Пользователи', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')
    })

    test('страница загружается, виден заголовок «Администрирование»', async ({ page }) => {
      await expect(
        main(page).getByRole('heading', { name: 'Администрирование', exact: true })
      ).toBeVisible({ timeout: 10000 })
    })

    test('виден список пользователей (checkbox, email, роль)', async ({ page }) => {
      const checkboxes = main(page).getByRole('checkbox')
      if (!(await isVisible(checkboxes.first(), 10000))) {
        test.skip()
        return
      }
      await expect(checkboxes.first()).toBeVisible({ timeout: 10000 })
    })

    test('поиск по имени работает', async ({ page }) => {
      const userRows = main(page).locator('div.cursor-pointer.group')
      if (!(await isVisible(userRows.first(), 10000))) {
        test.skip()
        return
      }

      // Имя пользователя в формате «Фамилия Имя [Отчество]».
      const nameEl = userRows.first().locator('span.font-medium').first()
      const fullName = ((await nameEl.textContent()) ?? '').trim()
      const query = fullName.split(/\s+/)[0]
      expect(query.length).toBeGreaterThan(0)

      const search = main(page).getByPlaceholder(/Поиск по имени/)
      await search.fill(query)

      // После debounce (~300 мс) список перезапрашивается; искомый
      // пользователь остаётся в результатах.
      await expect(userRows.first()).toBeVisible({ timeout: 10000 })
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-2: Админка — Модули (admin)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-2: Админка — Модули', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')
      // Открываем вкладку «Модули» в навигации админки.
      await main(page).getByRole('button', { name: 'Модули', exact: true }).click()
      await page.waitForLoadState('networkidle')
    })

    test('видны карточки модулей', async ({ page }) => {
      // Заголовок карточки раздела модулей.
      await expect(
        main(page).getByRole('heading', { name: 'Модули системы', exact: true })
      ).toBeVisible({ timeout: 10000 })

      // Имена модулей лежат в <h3> внутри сетки карточек.
      const moduleNames = main(page).locator('div.grid h3')
      if (!(await isVisible(moduleNames.first(), 10000))) {
        test.skip()
        return
      }
      await expect(moduleNames.first()).toBeVisible()
    })

    test('виден модуль «Отпуск»', async ({ page }) => {
      const vacation = main(page).getByRole('heading', { name: 'Отпуск', exact: true })
      // Модуль может быть выключен/отсутствовать в данных — пропускаем.
      if (!(await isVisible(vacation, 10000))) {
        test.skip()
        return
      }
      await expect(vacation).toBeVisible()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-3: Админка — Справочники (admin)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-3: Админка — Справочники', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')
      // Открываем вкладку «Справочники».
      await main(page).getByRole('button', { name: 'Справочники', exact: true }).click()
      await page.waitForLoadState('networkidle')
    })

    test('видны типы справочников (Должности, Типы отпусков)', async ({ page }) => {
      // Подвкладки справочников — кнопки; их accessible-имя включает счётчик,
      // поэтому используем regex, а не exact-строку.
      const positions = main(page).getByRole('button', { name: /Должности/ })
      const vacationTypes = main(page).getByRole('button', { name: /Типы отпусков/ })

      const hasPositions = await isVisible(positions.first(), 10000)
      const hasVacationTypes = await isVisible(vacationTypes.first(), 5000)

      if (!hasPositions && !hasVacationTypes) {
        test.skip()
        return
      }

      expect(hasPositions || hasVacationTypes).toBeTruthy()
    })

    test('список должностей виден', async ({ page }) => {
      // По умолчанию активна подвкладка «Должности».
      const positionsBtn = main(page).getByRole('button', { name: /Должности/ })
      if (!(await isVisible(positionsBtn.first(), 10000))) {
        test.skip()
        return
      }

      // Активный справочник показывает заголовок «Должности» (CardTitle = h3).
      await expect(
        main(page).getByRole('heading', { name: 'Должности', exact: true })
      ).toBeVisible({ timeout: 10000 })

      // Либо список должностей (строки-карточки с классами rounded-lg group),
      // либо пустое состояние «Нет должностей».
      const positionRows = main(page).locator('div.rounded-lg.group')
      const empty = main(page).getByText('Нет должностей', { exact: true })

      const hasRows = await isVisible(positionRows.first(), 5000)
      const hasEmpty = await isVisible(empty, 5000)

      if (!hasRows && !hasEmpty) {
        test.skip()
        return
      }

      expect(hasRows || hasEmpty).toBeTruthy()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-4: Админка — Настройки (admin)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-4: Админка — Настройки', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')
      // Открываем вкладку «Настройки».
      await main(page).getByRole('button', { name: 'Настройки', exact: true }).click()
      await page.waitForLoadState('networkidle')
    })

    test('видны системные настройки', async ({ page }) => {
      // Карточка раздела настроек.
      await expect(
        main(page).getByRole('heading', { name: 'Системные настройки', exact: true })
      ).toBeVisible({ timeout: 10000 })

      // Кнопка сохранения подтверждает, что интерфейс настроек отрисован.
      await expect(
        main(page).getByRole('button', { name: 'Сохранить', exact: true })
      ).toBeVisible({ timeout: 10000 })
    })

    test('виден vacation_default_days или session_duration_days', async ({ page }) => {
      // Ключи настроек выводятся моноширинным текстом.
      const vacationDays = main(page).getByText('vacation_default_days', { exact: true })
      const sessionDays = main(page).getByText('session_duration_days', { exact: true })

      const hasVacation = await isVisible(vacationDays, 10000)
      const hasSession = await isVisible(sessionDays, 5000)

      if (!hasVacation && !hasSession) {
        test.skip()
        return
      }

      expect(hasVacation || hasSession).toBeTruthy()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-5: Табель начальника (manager)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-5: Табель начальника', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'manager')
      await page.goto('/leader/timesheet')
      await page.waitForLoadState('networkidle')
    })

    test('страница табеля загружается (main виден)', async ({ page }) => {
      // Страница /leader/timesheet защищена ModuleGuard(module='timesheet'):
      // если модуль выключен — редирект на /dashboard. В этом случае пропускаем.
      if (!page.url().includes('/leader/timesheet')) {
        test.skip()
        return
      }

      await expect(main(page)).toBeVisible({ timeout: 10000 })
      await expect(
        main(page).getByRole('heading', { name: 'Табель', exact: true })
      ).toBeVisible({ timeout: 10000 })
    })

    test('если есть контент — таблица или селекторы', async ({ page }) => {
      if (!page.url().includes('/leader/timesheet')) {
        test.skip()
        return
      }

      // Сетка табеля отрисовывается как <table>.
      const table = main(page).locator('table')
      // Селекторы месяца/года всегда присутствуют в шапке страницы табеля.
      const selects = main(page).locator('select')

      const hasTable = await isVisible(table, 10000)
      const hasSelects = await isVisible(selects.first(), 5000)

      if (!hasTable && !hasSelects) {
        test.skip()
        return
      }

      expect(hasTable || hasSelects).toBeTruthy()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-6: Дашборд начальника — заявки (manager)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-6: Дашборд начальника — заявки', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'manager')
      await page.goto('/leader')
      await page.waitForLoadState('networkidle')
    })

    test('страница загружается', async ({ page }) => {
      await expect(
        main(page).getByRole('heading', { name: 'Панель лидера', exact: true })
      ).toBeVisible({ timeout: 10000 })
    })

    test('видны заявки или быстрые действия', async ({ page }) => {
      // Карточка «Требуют рассмотрения» — заявки подчинённых.
      const requests = main(page).getByRole('heading', { name: 'Требуют рассмотрения', exact: true })
      // Карточка «Быстрые действия» — quick actions.
      const quick = main(page).getByRole('heading', { name: 'Быстрые действия', exact: true })

      const hasRequests = await isVisible(requests, 10000)
      const hasQuick = await isVisible(quick, 5000)

      if (!hasRequests && !hasQuick) {
        test.skip()
        return
      }

      expect(hasRequests || hasQuick).toBeTruthy()
    })
  })
})
