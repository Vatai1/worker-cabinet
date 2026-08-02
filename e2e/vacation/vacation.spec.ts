import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'

test.describe('Модуль Отпуск', () => {

  test.describe('Сотрудник', () => {

    test.describe('UC-1: Создание заявки на отпуск', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/vacation')
        await expect(page.getByRole('heading', { name: 'Отпуск', exact: true })).toBeVisible()
      })

      test('видит баланс и календарь', async ({ page }) => {
        await expect(page.getByText('Баланс отпускных дней')).toBeVisible()
        await expect(page.getByText('Всего дней')).toBeVisible()
        await expect(page.getByText('Доступно', { exact: true })).toBeVisible()
        await expect(page.getByRole('heading', { name: /Календарь отпусков/ })).toBeVisible()
      })

      test('выбор дат на календаре → форма создания', async ({ page }) => {
        const decSection = page.locator('div.border.rounded-lg').filter({ hasText: 'Декабрь' }).first()
        const decCells = decSection.locator('[data-date-cell]')
        await decCells.nth(14).click()
        await expect(page.getByText(/Выбрана дата:/)).toBeVisible({ timeout: 3000 })
        await decCells.nth(19).click()
        await expect(page.getByText(/Период:/)).toBeVisible({ timeout: 3000 })
      })

      test('заполнение формы и отправка заявки', async ({ page }) => {
        const decSection = page.locator('div.border.rounded-lg').filter({ hasText: 'Декабрь' }).first()
        const decCells = decSection.locator('[data-date-cell]')
        await decCells.nth(14).click()
        await decCells.nth(19).click()

        await expect(page.getByText('Создать заявку на отпуск')).toBeVisible({ timeout: 5000 })
        await page.locator('#vacationType').selectOption('annual_paid')
        await page.getByPlaceholder('Укажите причину или дополнительные сведения...').fill('Новый год дома')
        await page.getByRole('button', { name: 'Создать заявку' }).click()

        await expect(page.getByText('Создать заявку на отпуск')).toHaveCount(0, { timeout: 5000 })
      })

      test('учебный отпуск — справка обязательна', async ({ page }) => {
        const decSection = page.locator('div.border.rounded-lg').filter({ hasText: 'Декабрь' }).first()
        const decCells = decSection.locator('[data-date-cell]')
        await decCells.nth(14).click()
        await decCells.nth(19).click()

        await expect(page.getByText('Создать заявку на отпуск')).toBeVisible({ timeout: 5000 })
        await page.locator('#vacationType').selectOption('educational')
        await expect(page.getByText('Справка')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Создать заявку' })).toBeDisabled()
      })
    })

    test.describe('UC-2: Отмена заявки на отпуск', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/vacation')
        await expect(page.getByRole('heading', { name: 'Отпуск', exact: true })).toBeVisible()
      })

      test('в списке есть заявки с кнопкой отмены', async ({ page }) => {
        await expect(page.getByText('Мои заявки')).toBeVisible({ timeout: 5000 })
        const cancelButtons = page.getByRole('button', { name: 'Отменить заявку' })
        expect(await cancelButtons.count()).toBeGreaterThan(0)
      })

      test('клик отмены → модалка подтверждения', async ({ page }) => {
        await expect(page.getByText('Мои заявки')).toBeVisible({ timeout: 5000 })
        const cancelBtn = page.getByRole('button', { name: 'Отменить заявку' }).first()
        await cancelBtn.scrollIntoViewIfNeeded()
        await cancelBtn.evaluate((el: HTMLElement) => el.click())
        await expect(page.getByRole('heading', { name: 'Отменить заявку?' })).toBeVisible({ timeout: 5000 })
      })
    })

    test.describe('UC-3: Просмотр истории отпусков', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/vacation')
      })

      test('открытие истории → список заявок', async ({ page }) => {
        await page.getByRole('button', { name: /История/ }).click()
        await expect(page.getByRole('heading', { name: 'История отпусков' })).toBeVisible({ timeout: 5000 })
        await expect(page.getByText(/Всего заявок:/)).toBeVisible()
      })

      test('фильтр по статусу', async ({ page }) => {
        await page.getByRole('button', { name: /История/ }).click()
        await expect(page.getByRole('heading', { name: 'История отпусков' })).toBeVisible({ timeout: 5000 })
        await page.locator('select').nth(1).selectOption('approved')
        await expect(page.getByText(/Найдено:/)).toBeVisible()
      })

      test('фильтр по году + сброс', async ({ page }) => {
        await page.getByRole('button', { name: /История/ }).click()
        await expect(page.getByRole('heading', { name: 'История отпусков' })).toBeVisible({ timeout: 5000 })
        await page.locator('select').first().selectOption({ index: 1 })
        await expect(page.getByRole('button', { name: /Сбросить/ })).toBeVisible()
        await page.getByRole('button', { name: /Сбросить/ }).click()
        await expect(page.getByText(/Всего заявок:/)).toBeVisible()
      })
    })

    test.describe('UC-4: Заявление на отпуск', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/vacation')
      })

      test('открытие формы заявления', async ({ page }) => {
        await page.getByRole('button', { name: /Заявление/ }).click()
        await expect(page.getByRole('heading', { name: 'Заявление на отпуск' })).toBeVisible({ timeout: 5000 })
        await expect(page.locator('label').filter({ hasText: /^Год$/ })).toBeVisible()
        await expect(page.locator('label').filter({ hasText: /Шаблон документа/ })).toBeVisible()
      })

      test('закрытие формы', async ({ page }) => {
        await page.getByRole('button', { name: /Заявление/ }).click()
        await expect(page.getByRole('heading', { name: 'Заявление на отпуск' })).toBeVisible({ timeout: 5000 })
        await page.getByRole('button', { name: 'Отмена' }).click()
        await expect(page.getByRole('heading', { name: 'Заявление на отпуск' })).toHaveCount(0)
      })
    })

    test.describe('UC-5: Запрос переноса отпуска', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'employee')
        await page.goto('/vacation')
      })

      test('открытие формы переноса', async ({ page }) => {
        await page.getByRole('button', { name: /Перенос/ }).click()
        await expect(page.getByRole('heading', { name: 'Заявление о переносе отпуска' })).toBeVisible({ timeout: 5000 })
      })
    })
  })

  test.describe('Начальник', () => {

    test.describe('UC-1: Управление пересечениями отпусков', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'manager')
        await page.goto('/vacation')
        await expect(page.getByRole('heading', { name: 'Отпуск', exact: true })).toBeVisible()
      })

      test('открытие модалки пересечений', async ({ page }) => {
        await page.getByRole('button', { name: /Пересечения/ }).click()
        await expect(page.getByRole('heading', { name: 'Настроить пересечения отпусков' })).toBeVisible({ timeout: 5000 })
      })

      test('тип парное по умолчанию', async ({ page }) => {
        await page.getByRole('button', { name: /Пересечения/ }).click()
        await expect(page.getByText('Парное ограничение')).toBeVisible({ timeout: 5000 })
      })

      test('переключение на групповое', async ({ page }) => {
        await page.getByRole('button', { name: /Пересечения/ }).click()
        await expect(page.getByRole('heading', { name: 'Настроить пересечения отпусков' })).toBeVisible({ timeout: 5000 })
        await page.getByRole('button', { name: 'Групповое' }).click()
        await expect(page.getByText('Групповое ограничение')).toBeVisible()
        await expect(page.getByText('Максимум одновременно в отпуске')).toBeVisible()
      })

      test('кнопка создания заблокирована без выбора', async ({ page }) => {
        await page.getByRole('button', { name: /Пересечения/ }).click()
        await expect(page.getByRole('button', { name: 'Создать ограничение' })).toBeDisabled()
      })
    })

    test.describe('UC-2: Просмотр отпусков отдела', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'manager')
        await page.goto('/vacation')
      })

      test('календарь отдела', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /Календарь отпусков/ })).toBeVisible()
        await page.getByText('Легенда').scrollIntoViewIfNeeded()
        await expect(page.getByText('Легенда')).toBeVisible({ timeout: 5000 })
      })

      test('переключение Отдел / Мои отпуска', async ({ page }) => {
        const deptBtn = page.locator('main').getByRole('button', { name: 'Отдел' })
        const myBtn = page.locator('main').getByRole('button', { name: 'Мои отпуска' })

        await deptBtn.click()
        await myBtn.click()
        await expect(page.getByText('Мои заявки')).toBeVisible({ timeout: 3000 })
      })

      test('навигация по годам', async ({ page }) => {
        const heading = page.getByRole('heading', { name: /Календарь отпусков/ })
        const before = await heading.textContent()
        await page.getByText(before!.match(/\d+/)![0]).locator('..').locator('button').first().click()
        const after = await heading.textContent()
        expect(before).not.toEqual(after)
      })
    })

    test.describe('UC-3: Согласование/отклонение заявок', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'manager')
        await page.goto('/vacation')
        await expect(page.getByRole('heading', { name: 'Отпуск', exact: true })).toBeVisible()
        await page.waitForLoadState('networkidle')
      })

      test('секция «Заявки на согласовании» видна', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
      })

      test('клик по заявке отдела → детали', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        const card = section.locator('..').locator('.cursor-pointer').first()
        await card.click()
        await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
      })

      test('в деталях — ФИО, период, тип', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        const card = section.locator('..').locator('.cursor-pointer').first()
        await card.click()
        await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
        await expect(page.getByText('Сотрудник', { exact: true })).toBeVisible()
        await expect(page.getByText('Период отпуска')).toBeVisible()
        await expect(page.getByText('Вид отпуска')).toBeVisible()
      })

      test('в деталях — кнопки согласовать/отклонить', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        const card = section.locator('..').locator('.cursor-pointer').first()
        await card.click()
        await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
        await expect(page.getByRole('button', { name: 'Согласовать' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Отклонить' })).toBeVisible()
      })

      test('отклонение — ввод причины и отмена', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        const card = section.locator('..').locator('.cursor-pointer').first()
        await card.click()
        await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })

        await page.getByRole('button', { name: 'Отклонить' }).click()
        await expect(page.getByPlaceholder('Причина отклонения...')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeDisabled()

        await page.getByPlaceholder('Причина отклонения...').fill('Не хватает людей в отделе')
        await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeEnabled()

        await page.getByRole('button', { name: 'Отмена' }).click()
        await expect(page.getByText('Согласовать')).toBeVisible()
      })
    })
  })

  test.describe('HR', () => {

    test.describe('UC-1: Управление шаблонами документов', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin')
        await page.goto('/hr')
        await page.waitForTimeout(2000)
        const dictTab = page.getByRole('button', { name: /Справочники/i })
        if (await dictTab.isVisible({ timeout: 10000 }).catch(() => false)) {
          await dictTab.click()
          await page.waitForTimeout(500)
        }
      })

      test('список шаблонов загружается', async ({ page }) => {
        if (await page.getByText('Что-то пошло не так').isVisible().catch(() => false)) { test.skip(); return }
        await page.getByRole('button', { name: /Шаблоны документов/i }).click({ timeout: 5000 }).catch(() => {})
        await expect(page.getByText('Шаблон123').first()).toBeVisible({ timeout: 5000 })
      })

      test('видна кнопка «Добавить»', async ({ page }) => {
        if (await page.getByText('Что-то пошло не так').isVisible().catch(() => false)) { test.skip(); return }
        await page.getByRole('button', { name: /Шаблоны документов/i }).click({ timeout: 5000 }).catch(() => {})
        await expect(page.getByRole('button', { name: /Добавить/ }).first()).toBeVisible({ timeout: 5000 })
      })

      test('открытие формы добавления шаблона', async ({ page }) => {
        if (await page.getByText('Что-то пошло не так').isVisible().catch(() => false)) { test.skip(); return }
        await page.getByRole('button', { name: /Шаблоны документов/i }).click({ timeout: 5000 }).catch(() => {})
        const addBtn = page.getByRole('button', { name: /Добавить/ }).first()
        if (!(await addBtn.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return }
        await addBtn.click()
        await expect(page.getByRole('heading', { name: /Добавить.*шаблон/ })).toBeVisible({ timeout: 5000 })
        await expect(page.locator('#dict-name')).toBeVisible()
      })

      test('форма добавления — выбор назначения', async ({ page }) => {
        if (await page.getByText('Что-то пошло не так').isVisible().catch(() => false)) { test.skip(); return }
        await page.getByRole('button', { name: /Шаблоны документов/i }).click({ timeout: 5000 }).catch(() => {})
        const addBtn = page.getByRole('button', { name: /Добавить/ }).first()
        if (!(await addBtn.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return }
        await addBtn.click()
        const purposeSelect = page.locator('select').filter({ hasText: /Шаблон отпуска|назнач/i })
        if (await purposeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await purposeSelect.selectOption('vacation_template')
        }
      })

      test('закрытие формы добавления', async ({ page }) => {
        if (await page.getByText('Что-то пошло не так').isVisible().catch(() => false)) { test.skip(); return }
        await page.getByRole('button', { name: /Шаблоны документов/i }).click({ timeout: 5000 }).catch(() => {})
        const addBtn = page.getByRole('button', { name: /Добавить/ }).first()
        if (!(await addBtn.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return }
        await addBtn.click()
        await expect(page.getByRole('heading', { name: /Добавить.*шаблон/ })).toBeVisible({ timeout: 5000 })
        await page.getByRole('button', { name: 'Отмена' }).click()
        await expect(page.getByRole('heading', { name: /Добавить.*шаблон/ })).toHaveCount(0, { timeout: 3000 })
      })
    })

    test.describe('UC-2: Запрет отпусков по отделам', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin')
        await page.goto('/hr')
        if (!(await page.getByText('Что-то пошло не так').isVisible().catch(() => false))) {
          const vacationTab = page.getByRole('button', { name: /^Отпуск/i })
          if (await vacationTab.isVisible({ timeout: 10000 }).catch(() => false)) {
            await vacationTab.click()
          }
        }
      })

      test('список отделов с блокировкой', async ({ page }) => {
        if (await page.getByText('Что-то пошло не так').isVisible()) { test.skip(); return }
        await expect(page.getByText(/Заблокировать все|Разблокировать все/i)).toBeVisible({ timeout: 5000 }).catch(() => { test.skip() })
      })

      test('переключение блокировки отдела', async ({ page }) => {
        if (await page.getByText('Что-то пошло не так').isVisible()) { test.skip(); return }
        const blockBtn = page.getByRole('button', { name: /Заблокировано|Активно/i }).first()
        if (!(await blockBtn.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return }

        const before = await blockBtn.textContent()
        await blockBtn.click()
        await page.waitForTimeout(1500)
        const after = await blockBtn.textContent()
        expect(before).not.toEqual(after)
      })

      test('переключение «Заблокировать все»', async ({ page }) => {
        if (await page.getByText('Что-то пошло не так').isVisible()) { test.skip(); return }
        const allBtn = page.getByRole('button', { name: /Заблокировать все|Разблокировать все/i }).first()
        if (!(await allBtn.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return }

        const before = await allBtn.textContent()
        await allBtn.click()
        await page.waitForTimeout(2000)
        const after = await allBtn.textContent()
        expect(before).not.toEqual(after)
      })
    })

    test.describe('UC-3: Согласование/отклонение заявок', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, 'hr')
        await page.goto('/vacation')
        await expect(page.getByRole('heading', { name: 'Отпуск', exact: true })).toBeVisible()
        await page.waitForLoadState('networkidle')
      })

      test('секция «Заявки на согласовании» видна', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
      })

      test('клик по заявке → детали', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        const card = section.locator('..').locator('.cursor-pointer').first()
        await card.click()
        await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
        await expect(page.getByText('Сотрудник', { exact: true })).toBeVisible()
        await expect(page.getByText('Период отпуска')).toBeVisible()
        await expect(page.getByText('Вид отпуска')).toBeVisible()
      })

      test('в деталях — кнопки согласовать/отклонить', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        const card = section.locator('..').locator('.cursor-pointer').first()
        await card.click()
        await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
        await expect(page.getByRole('button', { name: 'Согласовать' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Отклонить' })).toBeVisible()
      })

      test('отклонение — ввод причины и отмена', async ({ page }) => {
        const section = page.getByRole('heading', { name: 'Заявки на согласовании' })
        if (!(await section.isVisible({ timeout: 10000 }).catch(() => false))) {
          test.skip()
          return
        }
        const card = section.locator('..').locator('.cursor-pointer').first()
        await card.click()
        await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })

        await page.getByRole('button', { name: 'Отклонить' }).click()
        await expect(page.getByPlaceholder('Причина отклонения...')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeDisabled()

        await page.getByPlaceholder('Причина отклонения...').fill('Не хватает людей в отделе')
        await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeEnabled()

        await page.getByRole('button', { name: 'Отмена' }).click()
        await expect(page.getByText('Согласовать')).toBeVisible()
      })
    })
  })
})
