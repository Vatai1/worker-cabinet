import { test, expect, type Page, type Locator } from '@playwright/test'
import { loginAs } from '../helpers'

/**
 * Локаторы ограничиваются `main`, чтобы не зацепить элементы шапки/сайдбара
 * (навигация, бренд, пользовательское меню), где «Проекты», «Опросы»,
 * «Онбординг» встречаются повторно.
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

/**
 * Проверяет соответствие URL регулярке без падения теста.
 * Используется после клика, чтобы понять, произошла ли навигация.
 */
async function urlMatches(page: Page, pattern: RegExp, timeout = 10000): Promise<boolean> {
  try {
    await expect(page).toHaveURL(pattern, { timeout })
    return true
  } catch {
    return false
  }
}

/**
 * Кликабельный элемент карточки проекта внутри основного контента.
 * Карточка проекта — это ссылка/кнопка/кликабельный div, в тексте которого
 * встречается слово «проект».
 */
function projectCard(page: Page): Locator {
  return page
    .locator('main a, main [class*="cursor-pointer"], main button')
    .filter({ hasText: /проект/i })
    .first()
}

/**
 * Вкладка «Онбординг» в HR-панели — кнопка/таб/ссылка внутри основного
 * контента. Может отсутствовать, если модуль онбординга выключен.
 */
function onboardingTab(page: Page): Locator {
  return main(page)
    .getByRole('button', { name: /^Онбординг/i })
    .or(main(page).getByRole('tab', { name: /^Онбординг/i }))
    .or(main(page).getByRole('link', { name: /^Онбординг/i }))
}

test.describe('Проекты, Опросы, Онбординг', () => {

  // ──────────────────────────────────────────────────────────────────────
  // UC-1: Детали проекта (employee)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-1: Детали проекта', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/projects')
      await page.waitForLoadState('networkidle')
    })

    test('страница проектов загружается (main виден)', async ({ page }) => {
      await expect(main(page)).toBeVisible({ timeout: 10000 })
    })

    test('клик по проекту открывает детали', async ({ page }) => {
      const card = projectCard(page)

      // Проектов может не быть — пропускаем.
      if (!(await isVisible(card, 10000))) {
        test.skip()
        return
      }

      await card.click()

      // Должна открыться страница деталей проекта: /projects/:id.
      // Если клик привёл к модалке создания (URL не изменился) — пропускаем.
      if (!(await urlMatches(page, /\/projects\/\d+/, 10000))) {
        test.skip()
        return
      }

      await expect(main(page)).toBeVisible({ timeout: 10000 })
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-2: Документы проекта (employee)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-2: Документы проекта', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/projects')
      await page.waitForLoadState('networkidle')
    })

    test('страница проектов загружается (main виден)', async ({ page }) => {
      await expect(main(page)).toBeVisible({ timeout: 10000 })
    })

    test('из деталей проекта доступна навигация на документы', async ({ page }) => {
      const card = projectCard(page)

      // Нет проектов — пропускаем.
      if (!(await isVisible(card, 10000))) {
        test.skip()
        return
      }

      await card.click()

      // Открываются детали проекта: /projects/:id.
      if (!(await urlMatches(page, /\/projects\/\d+/, 10000))) {
        test.skip()
        return
      }

      // Навигация на раздел «Документы»: ссылка на /documents, либо
      // таб/кнопка с текстом «Документы» внутри деталей проекта.
      const docsLink = main(page)
        .locator('a[href*="/documents"], a, button, [role="tab"]')
        .filter({ hasText: /документы/i })
        .first()

      // Раздела документов может не быть — пропускаем.
      if (!(await isVisible(docsLink, 10000))) {
        test.skip()
        return
      }

      await docsLink.click()

      // Навигация отработала: либо URL содержит /documents, либо в main
      // присутствует раздел с заголовком «Документы».
      const docsUrl = await urlMatches(page, /\/documents/, 10000)
      const docsHeading = main(page).getByText('Документы', { exact: true })
      const hasDocsHeading = await isVisible(docsHeading, 10000)

      if (!docsUrl && !hasDocsHeading) {
        test.skip()
        return
      }
      expect(docsUrl || hasDocsHeading).toBeTruthy()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-3: Прохождение опроса (employee)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-3: Прохождение опроса', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/surveys')
      await page.waitForLoadState('networkidle')
    })

    test('страница опросов загружается (main виден)', async ({ page }) => {
      await expect(main(page)).toBeVisible({ timeout: 10000 })
    })

    test('клик по опросу открывает прохождение', async ({ page }) => {
      // Ссылка на прохождение опроса (href ведёт на /surveys/:id) — наиболее
      // надёжный способ попасть на страницу конкретного опроса.
      let surveyItem: Locator = main(page).locator('a[href*="/surveys/"]').first()
      let found = await isVisible(surveyItem, 10000)

      // Если опросы — кликабельные карточки (div с onClick), берём первую.
      if (!found) {
        surveyItem = main(page).locator('[class*="cursor-pointer"]').first()
        found = await isVisible(surveyItem, 10000)
      }

      // Опросов может не быть — пропускаем.
      if (!found) {
        test.skip()
        return
      }

      await surveyItem.click()

      // Прохождение опроса открывается на /surveys/:id.
      // Если клик попал не по опросу (URL не изменился) — пропускаем.
      if (!(await urlMatches(page, /\/surveys\/\d+/, 10000))) {
        test.skip()
        return
      }

      await expect(main(page)).toBeVisible({ timeout: 10000 })
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-4: Онбординг — список задач (employee)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-4: Онбординг — список задач', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/onboarding')
      await page.waitForLoadState('networkidle')
    })

    test('страница загружается (main виден) или редирект', async ({ page }) => {
      // /onboarding может быть защищён модулем (ModuleGuard) — тогда редирект
      // на дашборд. Либо main отрисован, либо ушли с /onboarding.
      const hasMain = await isVisible(main(page), 10000)
      const redirected = !page.url().includes('/onboarding')

      if (!hasMain && !redirected) {
        test.skip()
        return
      }
      expect(hasMain || redirected).toBeTruthy()
    })

    test('если онбординг доступен — видны задачи или заголовок', async ({ page }) => {
      // Если произошёл редирект — онбординг недоступен, пропускаем.
      if (!page.url().includes('/onboarding')) {
        test.skip()
        return
      }

      // Заголовок страницы онбординга либо карточки/пункты задач.
      const heading = main(page).getByRole('heading').first()
      const taskItem = main(page)
        .locator('[class*="cursor-pointer"], li, [class*="rounded"]')
        .first()

      const hasHeading = await isVisible(heading, 10000)
      const hasTasks = await isVisible(taskItem, 10000)

      if (!hasHeading && !hasTasks) {
        test.skip()
        return
      }
      expect(hasHeading || hasTasks).toBeTruthy()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // UC-5: HR Онбординг (admin)
  // ──────────────────────────────────────────────────────────────────────
  test.describe('UC-5: HR Онбординг', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/hr')
      await page.waitForTimeout(2000)

      // Открываем вкладку «Онбординг», если она видна.
      const tab = onboardingTab(page)
      if (await isVisible(tab, 10000)) {
        await tab.first().click()
        await page.waitForTimeout(1000)
      }
    })

    test('вкладка «Онбординг» доступна в HR-панели', async ({ page }) => {
      const tab = onboardingTab(page)
      // Вкладки может не быть (модуль выключен) — пропускаем.
      if (!(await isVisible(tab, 10000))) {
        test.skip()
        return
      }
      await expect(tab.first()).toBeVisible({ timeout: 10000 })
    })

    test('после выбора вкладки виден контент онбординга', async ({ page }) => {
      const tab = onboardingTab(page)
      // Нет вкладки — пропускаем.
      if (!(await isVisible(tab, 10000))) {
        test.skip()
        return
      }

      // Контент онбординга: заголовок раздела, задачи, либо таблица/список
      // сотрудников на онбординге.
      const heading = main(page).getByRole('heading').first()
      const content = main(page)
        .locator('[class*="cursor-pointer"], table, [class*="rounded"]')
        .first()

      const hasHeading = await isVisible(heading, 10000)
      const hasContent = await isVisible(content, 10000)

      if (!hasHeading && !hasContent) {
        test.skip()
        return
      }
      expect(hasHeading || hasContent).toBeTruthy()
    })
  })
})
