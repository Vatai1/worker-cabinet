import { test, expect, type Page } from '@playwright/test'
import { World, iso, workdayOffset, monthCard, monthName, dayOfMonth, openVacationPage, THIS_YEAR } from './fixtures'

test.describe.configure({ mode: 'serial' })

const world = new World('vhr', 1)
const DEPT = 'E2E ВК Отдел'
const POSITION = 'E2E Специалист ВК'
const RULE = 'e2e-vhr правило HR'

const T_CAL = { s: iso(workdayOffset(40)), e: iso(workdayOffset(40) + 4) }
const T_BLOCK = iso(workdayOffset(60))

test.beforeAll(async () => {
  await world.init()
  await world.ensureDepartment('dept', DEPT)
  await world.ensureUser('hr', { lastName: 'Кадровикова', firstName: 'Вера', role: 'hr', department: 'dept', position: 'HR-специалист' })
  await world.ensureUser('pos', { lastName: 'Должностнов', firstName: 'Павел', role: 'employee', department: 'dept', position: POSITION })
  await world.ensureUser('rule', { lastName: 'Правилов', firstName: 'Руслан', role: 'employee', department: 'dept' })
  await world.ensureUser('cal', { lastName: 'Календарёв', firstName: 'Кирилл', role: 'employee', department: 'dept' })
  await cleanupRules()
  await world.cancelAllRequests()
})

test.afterAll(async () => {
  await cleanupRules().catch(() => {})
  await world.teardown()
})

async function cleanupRules() {
  const rules = await world.ok<{ positionRules: Array<{ id: number; position: string }>; userRules: Array<{ id: number; userId: string }> }>('GET', '/vacation/day-rules')
  const userIds = Object.values(world.users).map((u) => String(u.id))
  for (const r of rules.positionRules.filter((r) => r.position === POSITION)) await world.call('DELETE', `/vacation/day-rules/${r.id}`)
  for (const r of rules.userRules.filter((r) => userIds.includes(r.userId))) await world.call('DELETE', `/vacation/day-rules/${r.id}`)
  const restrictions = await world.ok<Array<{ id: number; description?: string | null }>>('GET', '/vacation/restrictions')
  for (const r of restrictions.filter((r) => (r.description || '').startsWith('e2e-vhr'))) await world.call('DELETE', `/vacation/restrictions/${r.id}`)
}

async function totalDays(userKey: string, year = THIS_YEAR) {
  const b = await world.ok<{ total_days: number }>('GET', `/vacation/balance/${world.users[userKey].id}?year=${year}`)
  return b.total_days
}

async function openHrVacation(page: Page, sub?: string) {
  await world.loginPage(page, 'hr')
  await page.goto('/hr?tab=vacation')
  if (sub) await page.getByRole('button', { name: sub, exact: true }).click()
}

const ruleRow = (page: Page, text: string) => page.locator('div.rounded-lg.border').filter({ hasText: text }).first()

test.describe('Отпуск: HR', () => {
  test('дни отпуска по должности: правило меняет баланс работника на этот и следующий год, удаление убирает правило', async ({ page }) => {
    await openHrVacation(page, 'Дни отпуска')
    await page.getByRole('button', { name: 'Выберите должности' }).click()
    await page.getByPlaceholder('Поиск по должности…').fill(POSITION)
    await page.locator('label', { hasText: POSITION }).locator('input[type="checkbox"]').check()
    await page.getByRole('heading', { name: /Дни отпуска/ }).first().click().catch(() => page.mouse.click(5, 5))
    const addRow = page.locator('div.border-dashed').filter({ has: page.getByRole('button', { name: /Добавить \(1\)/ }) }).first()
    await addRow.locator('input[type="number"]').fill('33')
    await addRow.getByRole('button', { name: /Добавить/ }).click()
    const row = ruleRow(page, POSITION)
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row).toContainText('33 дн.')
    await expect.poll(() => totalDays('pos'), { timeout: 10000 }).toBe(33)
    await expect.poll(() => totalDays('pos', THIS_YEAR + 1), { timeout: 10000 }).toBe(33)

    await row.getByTitle('Удалить').click()
    await expect(page.locator('div.rounded-lg.border').filter({ hasText: POSITION }).filter({ hasText: 'дн.' })).toHaveCount(0, { timeout: 10000 })
  })

  test('дни отпуска по работнику: выбор в окне, правило видно в списке и в балансе', async ({ page }) => {
    await openHrVacation(page, 'Дни отпуска')
    await page.getByRole('button', { name: 'Выберите работников' }).click()
    await page.getByPlaceholder('Поиск по имени, должности…').fill('Правилов')
    await page.locator('label', { hasText: 'Правилов Руслан' }).locator('input[type="checkbox"]').check()
    await page.getByRole('button', { name: 'Выбрать (1)', exact: true }).click()
    const addRow = page.locator('div.border-dashed').filter({ hasText: 'Правилов Руслан' }).first()
    await addRow.locator('input[type="number"]').fill('35')
    await addRow.getByRole('button', { name: /Добавить/ }).click()
    const row = ruleRow(page, 'Правилов Руслан')
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row).toContainText('35 дн.')
    await expect.poll(() => totalDays('rule'), { timeout: 10000 }).toBe(35)
  })

  test('календарь HR: поиск находит отпуск работника с отделом и числом дней', async ({ page }) => {
    const req = await world.createRequest('cal', T_CAL.s, T_CAL.e)
    await world.approve(req.id)
    await openHrVacation(page)
    await page.getByPlaceholder('Поиск по имени, должности, отделу…').fill('Календарёв')
    const row = page.locator('tr', { hasText: 'Календарёв' }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row).toContainText(DEPT)
    await expect(row).toContainText(String(req.duration))
  })

  test('доступ к подаче: HR закрывает отдел — работник видит запрет; открывает — запрета нет', async ({ page, browser }) => {
    await openHrVacation(page, 'Доступ')
    const sw = page.getByRole('switch', { name: `Доступ: ${DEPT}` })
    await expect(sw).toHaveAttribute('aria-checked', 'true', { timeout: 10000 })
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false', { timeout: 10000 })

    const emp = await browser.newPage()
    try {
      await world.loginPage(emp, 'cal')
      await openVacationPage(emp)
      await expect(emp.getByText('Подача заявок на отпуск для вашего отдела временно заблокирована HR').first()).toBeVisible({ timeout: 15000 })
      await monthCard(emp, monthName(T_BLOCK)).locator('[data-date-cell]').nth(dayOfMonth(T_BLOCK) - 1).click()
      await expect(emp.getByRole('heading', { name: 'Не удалось оформить заявку' })).toBeVisible({ timeout: 15000 })
    } finally {
      await emp.close()
    }

    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true', { timeout: 10000 })
    expect((await world.departmentRow('dept'))?.vacation_requests_blocked).toBe(false)
  })

  test('пересечения HR: правило создаётся из работников отдела и удаляется с подтверждением', async ({ page }) => {
    await openHrVacation(page, 'Пересечения')
    await page.getByRole('button', { name: 'Создать правило' }).first().click()
    const form = page.locator('div.fixed.inset-0').filter({ has: page.getByPlaceholder('Напр. для обеспечения непрерывной работы…') }).last()
    await expect(form).toBeVisible({ timeout: 5000 })
    await form.getByPlaceholder('Напр. для обеспечения непрерывной работы…').fill(RULE)
    const search = form.getByPlaceholder('Поиск по ФИО или должности…')
    for (const surname of ['Правилов', 'Календарёв']) {
      await search.fill(surname)
      const item = form.locator('div.max-h-60 button', { hasText: surname }).first()
      await item.waitFor({ state: 'visible', timeout: 10000 })
      await item.click()
    }
    await form.getByRole('button', { name: 'Создать правило' }).click()
    const row = page.locator('div.rounded-xl, tr, div.rounded-lg').filter({ hasText: RULE }).first()
    await expect(row).toBeVisible({ timeout: 10000 })

    await row.getByTitle('Удалить').click()
    await expect(page.getByRole('heading', { name: 'Удалить правило' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Удалить', exact: true }).last().click()
    await expect(page.getByText(RULE, { exact: true })).toHaveCount(0, { timeout: 10000 })
  })

  test('справочник типов отпусков доступен HR', async ({ page }) => {
    await world.loginPage(page, 'hr')
    await page.goto('/hr?tab=hr_vacation_types')
    await expect(page.getByRole('heading', { name: 'Типы отпусков' }).first()).toBeVisible({ timeout: 15000 })
    await page.getByPlaceholder('Поиск по названию или коду…').fill('annual_paid')
    await expect(page.getByText('annual_paid', { exact: true }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('unpaid', { exact: true })).toHaveCount(0)
  })
})
