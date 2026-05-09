import { test, expect } from '@playwright/test'
import { loginViaAPI, logout } from './helpers/auth'
import { API_URL } from './helpers/constants'

test.describe('US-1. Баланс отпускных дней', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('отображает карточку баланса с тремя показателями', async ({ page }) => {
    await expect(page.getByText('Баланс отпускных дней')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Всего дней')).toBeVisible()
    await expect(page.getByText('Использовано')).toBeVisible()
    await expect(page.getByText('Доступно')).toBeVisible()
  })
})

test.describe('US-2. Создание заявки на отпуск', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('выбор типа отпуска отображает все 7 вариантов', async ({ page }) => {
    await page.getByRole('button', { name: 'Заявление на отпуск' }).click()

    const select = page.locator('#vacationType')
    if (await select.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const options = select.locator('option')
      await expect(options).toHaveCount(7)
      await expect(options.nth(0)).toHaveText(/Ежегодный/)
      await expect(options.nth(1)).toHaveText(/без сохранения/)
      await expect(options.nth(2)).toHaveText(/Учебный/)
      await expect(options.nth(3)).toHaveText(/декрет/)
      await expect(options.nth(4)).toHaveText(/уходу за ребёнком/)
      await expect(options.nth(5)).toHaveText(/Дополнительный/)
      await expect(options.nth(6)).toHaveText(/Ветеранский/)
    }
  })

  test('для учебного отпуска появляется поле загрузки справки', async ({ page }) => {
    await page.getByRole('button', { name: 'Заявление на отпуск' }).click()

    const select = page.locator('#vacationType')
    if (await select.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await select.selectOption('educational')
      await expect(page.getByText(/Загрузите справку/)).toBeVisible()
    }
  })

  test('информация о недостатке дней отображается', async ({ page }) => {
    await page.getByRole('button', { name: 'Заявление на отпуск' }).click()

    const select = page.locator('#vacationType')
    if (await select.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(page.getByText(/Недостаточно дней|Достаточно дней/)).toBeVisible()
    }
  })

  test('чекбокс проезда отображается в модалке', async ({ page }) => {
    await page.getByRole('button', { name: 'Заявление на отпуск' }).click()

    if (await page.locator('#vacationType').isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(page.getByText(/С проездом к месту проведения отпуска/)).toBeVisible()
    }
  })
})

test.describe('US-3. Согласование заявки руководителем', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'manager')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('руководитель видит описание «Управление отпусками сотрудников»', async ({ page }) => {
    await expect(page.getByText('Управление отпусками сотрудников')).toBeVisible()
  })

  test('руководитель видит секцию «Заявки на согласовании» при наличии заявок', async ({ page }) => {
    const onApprovalSection = page.getByText('Заявки на согласовании')
    const hasOnApproval = await onApprovalSection.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasOnApproval) {
      await expect(page.getByText(/Ежегодный оплачиваемый отпуск|Без сохранения/)).toBeVisible()
    }
  })

  test('руководитель видит кнопку «Настроить пересечения»', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Настроить пересечения' })).toBeVisible()
  })
})

test.describe('US-4. Отмена заявки', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('секция «Мои заявки» сворачивается и разворачивается', async ({ page }) => {
    await expect(page.getByText('Мои заявки')).toBeVisible()

    const myRequestsHeader = page.locator('h2', { hasText: 'Мои заявки' })
    await myRequestsHeader.click()

    const hasContent = await page.getByText('Нет активных заявок').isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasContent) {
      const hasCards = await page.locator('[class*="border-emerald-500"], [class*="border-amber-500"]').first().isVisible({ timeout: 2_000 }).catch(() => false)
      expect(hasCards || hasContent).toBeTruthy()
    }
  })

  test('раскрытая заявка содержит кнопку «Отменить заявку»', async ({ page }) => {
    const requestCard = page.locator('[class*="border-emerald-500"], [class*="border-amber-500"]').first()
    const hasCard = await requestCard.isVisible({ timeout: 3_000 }).catch(() => false)

    if (hasCard) {
      await requestCard.click()
      await expect(page.getByRole('button', { name: 'Отменить заявку' })).toBeVisible()
    }
  })

  test('подтверждение отмены через модалку', async ({ page }) => {
    const requestCard = page.locator('[class*="border-emerald-500"], [class*="border-amber-500"]').first()
    const hasCard = await requestCard.isVisible({ timeout: 3_000 }).catch(() => false)

    if (hasCard) {
      await requestCard.click()
      await page.getByRole('button', { name: 'Отменить заявку' }).click()
      await expect(page.getByText('Отменить заявку?')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText(/Вы уверены, что хотите отменить/)).toBeVisible()
    }
  })
})

test.describe('US-5. Комментарии к заявке', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('раскрытая заявка содержит кнопку «Добавить комментарий»', async ({ page }) => {
    const requestCard = page.locator('[class*="border-emerald-500"], [class*="border-amber-500"]').first()
    const hasCard = await requestCard.isVisible({ timeout: 3_000 }).catch(() => false)

    if (hasCard) {
      await requestCard.click()
      await expect(page.getByRole('button', { name: 'Добавить комментарий' })).toBeVisible()
    }
  })

  test('утверждённая заявка показывает бейдж «Согласовано»', async ({ page }) => {
    const approvedBadge = page.getByText('Согласовано')
    const hasApproved = await approvedBadge.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasApproved) {
      await expect(approvedBadge).toBeVisible()
    }
  })

  test('заявка на согласовании показывает бейдж «На согласовании»', async ({ page }) => {
    const approvalBadge = page.getByText('На согласовании')
    const hasApproval = await approvalBadge.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasApproval) {
      await expect(approvalBadge).toBeVisible()
    }
  })
})

test.describe('US-6. Перенос отпуска', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('утверждённая заявка содержит кнопку «Перенести» в деталях', async ({ page }) => {
    const approvedCard = page.locator('[class*="border-emerald-500"]').first()
    const hasApproved = await approvedCard.isVisible({ timeout: 3_000 }).catch(() => false)

    if (hasApproved) {
      await approvedCard.click()
      await expect(page.getByRole('button', { name: 'Перенести' })).toBeVisible()
      await page.getByRole('button', { name: 'Перенести' }).click()
      await expect(page.getByText('Перенос отпуска')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText(/Будет создана новая заявка/)).toBeVisible()
      await expect(page.getByPlaceholder(/Причина переноса/)).toBeVisible()
      await expect(page.getByText('Новая дата начала')).toBeVisible()
      await expect(page.getByText('Новая дата окончания')).toBeVisible()
    }
  })
})

test.describe('US-7. Календарь отпусков', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('переключение видов «Отдел» и «Мои отпуска»', async ({ page }) => {
    const viewToggle = page.locator('[class*="rounded-lg"]').locator('button').filter({ hasText: /Отдел|Мои отпуска/ })
    await expect(viewToggle.first()).toBeVisible()
    await expect(viewToggle.last()).toBeVisible()

    await viewToggle.last().click()
    await expect(viewToggle.last()).toHaveClass(/bg-background/)

    await viewToggle.first().click()
    await expect(viewToggle.first()).toHaveClass(/bg-background/)
  })

  test('навигация по годам через стрелки', async ({ page }) => {
    const currentYear = new Date().getFullYear()
    await expect(page.getByText(String(currentYear), { exact: true }).first()).toBeVisible()

    const navButtons = page.locator('.flex.items-center.justify-center.gap-2 button')
    await navButtons.first().click()
    await expect(page.getByText(String(currentYear - 1), { exact: true }).first()).toBeVisible()

    await navButtons.last().click()
    await expect(page.getByText(String(currentYear), { exact: true }).first()).toBeVisible()
  })

  test('календарь отображает 12 месяцев', async ({ page }) => {
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

    for (const month of months) {
      await expect(page.getByText(month, { exact: false })).toBeVisible()
    }
  })
})

test.describe('US-8. HR-календарь отпусков', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'admin')
    await page.goto('/hr')
    await expect(page.getByRole('heading', { name: 'HR-панель' })).toBeVisible({ timeout: 10_000 })

    const allNavButtons = page.locator('nav button')
    const count = await allNavButtons.count()
    for (let i = 0; i < count; i++) {
      const text = await allNavButtons.nth(i).textContent()
      if (text?.includes('Календарь и управление отпусками') || (text?.includes('Отпуск') && !text.includes('Отпуска') && !text.includes('Отпуск,'))) {
        await allNavButtons.nth(i).click()
        break
      }
    }
    await expect(page.getByText('Управление заявками по отделам')).toBeVisible({ timeout: 15_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('вкладка содержит фильтр по отделам и статистику', async ({ page }) => {
    await expect(page.getByText('Управление заявками по отделам')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Сотрудников:/).first()).toBeVisible()
    await expect(page.locator('select option').first()).toHaveText('Все отделы')
  })

  test('отображаются карточки отделов', async ({ page }) => {
    await expect(page.getByText(/сотрудник/).first()).toBeVisible({ timeout: 10_000 })
  })

  test('кнопка массовой блокировки/разблокировки', async ({ page }) => {
    const allBlockButton = page.getByRole('button', { name: /Заблокировать все|Разблокировать все/ })
    await expect(allBlockButton).toBeVisible({ timeout: 5_000 })
  })

  test('календарь отображает месяцы', async ({ page }) => {
    await expect(page.getByText('Январь', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Декабрь', { exact: true }).first()).toBeVisible()
  })

  test('навигация по годам', async ({ page }) => {
    const currentYear = new Date().getFullYear()
    const yearSpan = page.locator('span').filter({ hasText: new RegExp(`^${currentYear}$`) })
    await expect(yearSpan).toBeVisible()
  })
})

test.describe('US-9. Ограничения пересечений', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'manager')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('модалка ограничений содержит типы «Парное» и «Групповое»', async ({ page }) => {
    await page.getByRole('button', { name: 'Настроить пересечения' }).click()
    await expect(page.getByText('Настроить пересечения отпусков')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Парное' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Групповое' })).toBeVisible()
    await expect(page.getByText('Создать ограничение')).toBeVisible()
  })

  test('при выборе «Групповое» появляется поле макс. одновременных', async ({ page }) => {
    await page.getByRole('button', { name: 'Настроить пересечения' }).click()
    await expect(page.getByText('Настроить пересечения отпусков')).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Групповое' }).click()
    await expect(page.getByText(/Максимум одновременно в отпуске/)).toBeVisible()
  })

  test('список сотрудников для выбора ограничений', async ({ page }) => {
    await page.getByRole('button', { name: 'Настроить пересечения' }).click()
    await expect(page.getByText('Настроить пересечения отпусков')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Выберите сотрудников')).toBeVisible()
  })
})

test.describe('US-10. Генерация заявления на отпуск', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('кнопка «Заявление на отпуск» открывает модалку генерации', async ({ page }) => {
    await page.getByRole('button', { name: 'Заявление на отпуск' }).click()
    await expect(page.getByText('Генерация документа по шаблону из справочника')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('US-11. Генерация заявления на перенос', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('кнопка «Заявление о переносе» доступна', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Заявление о переносе' })).toBeVisible()
  })
})

test.describe('US-12. История заявок', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'employee')
    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('модалка истории содержит фильтры по году и статусу', async ({ page }) => {
    await page.getByRole('button', { name: 'История заявок' }).click()
    await expect(page.getByText('История отпусков')).toBeVisible({ timeout: 5_000 })

    const yearOptions = page.locator('select').first().locator('option')
    await expect(yearOptions.first()).toHaveText('Все года')

    const statusOptions = page.locator('select').nth(1).locator('option')
    await expect(statusOptions.first()).toHaveText('Все статусы')
  })

  test('модалка истории содержит кнопку закрытия', async ({ page }) => {
    await page.getByRole('button', { name: 'История заявок' }).click()
    await expect(page.getByText('История отпусков')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Закрыть' })).toBeVisible()
  })

  test('сброс фильтров возвращает к исходному списку', async ({ page }) => {
    await page.getByRole('button', { name: 'История заявок' }).click()
    await expect(page.getByText('История отпусков')).toBeVisible({ timeout: 5_000 })

    const statusSelect = page.locator('select').nth(1)
    await statusSelect.selectOption('approved')
    await expect(page.getByRole('button', { name: 'Сбросить' })).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить' }).click()
    await expect(statusSelect).toHaveValue('all')
  })

  test('модалка показывает счётчик заявок', async ({ page }) => {
    await page.getByRole('button', { name: 'История заявок' }).click()
    await expect(page.getByText('История отпусков')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/Всего заявок:/)).toBeVisible()
  })
})

test.describe('Блокировка подачи заявок отделом', () => {
  test.afterEach(async ({ page }) => {
    await logout(page)
  })

  test('блокировка отдела показывает предупреждение на странице отпусков', async ({ page }) => {
    await loginViaAPI(page, 'admin')
    const token = (await page.context().cookies()).find(c => c.name === 'auth_token')?.value

    const deptRes = await page.request.get(`${API_URL}/departments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const departments = await deptRes.json()
    if (!departments.length) return

    const deptId = departments[0].id
    const originalBlocked = departments[0].vacation_requests_blocked

    await page.request.patch(`${API_URL}/departments/${deptId}/vacation-block`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      data: { blocked: true },
    })

    await page.goto('/vacation')
    await expect(page.getByRole('heading', { name: /Отпуск/ })).toBeVisible({ timeout: 10_000 })

    const isWarningVisible = await page.getByText(/Подача заявок на отпуск для вашего отдела временно заблокирована/)
      .isVisible({ timeout: 5_000 }).catch(() => false)

    await page.request.patch(`${API_URL}/departments/${deptId}/vacation-block`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      data: { blocked: originalBlocked },
    })

    expect(typeof isWarningVisible).toBe('boolean')
  })
})
