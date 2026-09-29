import { test, expect, type Page } from '@playwright/test'
import { World, iso, ruDate, workdayOffset, selectRange, openVacationPage, THIS_YEAR, monthCard, monthName, dayOfMonth } from './fixtures'

test.describe.configure({ mode: 'serial' })

const world = new World('ve', 1)
const DEPT = 'E2E ВС Отдел'
const OTHER_DEPT = 'E2E ВС Соседи'
const COMMENT = 'e2e-ve: нужен отпуск для поездки'

const range = (from: number, len = 3) => {
  const s = workdayOffset(from)
  return { s: iso(s), e: iso(s + len - 1) }
}
const T_TRAVEL = range(25)
const T_EDU = range(35)
const T_SHORT = range(45)
const T_EDIT = range(55)
const T_EDITED = range(62)
const T_APPROVED = range(70)
const T_REJECTED = range(80)
const T_COLLEAGUE = range(90)
const T_OTHER = range(100)

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const titleRe = (r: { s: string; e: string }) => new RegExp(`^${escapeRe(ruDate(r.s))} - ${escapeRe(ruDate(r.e))} \\(`)

function card(page: Page, r: { s: string; e: string }) {
  return page.getByTestId('my-request-card').filter({ has: page.getByText(titleRe(r)) }).first()
}

async function expand(page: Page, r: { s: string; e: string }) {
  const c = card(page, r)
  await c.waitFor({ state: 'visible', timeout: 15000 })
  await expect(page.locator('[data-testid="my-request-card"][data-expanded="true"]')).toHaveCount(1, { timeout: 10000 })
  if ((await c.getAttribute('data-expanded')) !== 'true') {
    await c.getByText(titleRe(r)).click()
    await expect(c).toHaveAttribute('data-expanded', 'true', { timeout: 5000 })
  }
  await page.waitForTimeout(350)
  return c
}

test.beforeAll(async () => {
  await world.init()
  await world.ensureDepartment('dept', DEPT)
  await world.ensureDepartment('other', OTHER_DEPT)
  await world.ensureUser('emp', { lastName: 'Отпускников', firstName: 'Тимур', role: 'employee', department: 'dept' })
  await world.ensureUser('col', { lastName: 'Коллегин', firstName: 'Роман', role: 'employee', department: 'dept' })
  await world.ensureUser('mgr', { lastName: 'Начальников', firstName: 'Олег', role: 'manager', department: 'dept', position: 'Руководитель отдела' })
  await world.ensureUser('stranger', { lastName: 'Чужаков', firstName: 'Игорь', role: 'employee', department: 'other' })
  await world.setDepartment('dept', { manager_id: world.users.mgr.id })
  await world.cancelAllRequests()
})

test.afterAll(async () => {
  await world.teardown()
})

test.describe('Отпуск: работник', () => {
  test('заявка с проездом: город обязателен, ребёнок добавляется, в карточке — отметка проезда', async ({ page }) => {
    await world.loginPage(page, 'emp')
    await openVacationPage(page)
    await selectRange(page, T_TRAVEL.s, T_TRAVEL.e)
    await expect(page.getByText('Создать заявку на отпуск')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Проезд доступен/)).toBeVisible({ timeout: 10000 })
    await page.locator('#hasTravel').check()
    await page.getByRole('button', { name: 'Создать заявку' }).click()
    await expect(page.getByText('Укажите город проезда').first()).toBeVisible({ timeout: 5000 })

    await page.locator('#travelDestination').fill('Сочи')
    await page.getByRole('button', { name: 'Добавить ребёнка' }).click()
    await page.getByPlaceholder('ФИО ребёнка').fill('Отпускников Лев Тимурович')
    await page.locator('input[type="date"]').last().fill(`${THIS_YEAR - 8}-03-15`)
    await page.getByRole('button', { name: 'Создать заявку' }).click()
    await expect(page.getByText('Создать заявку на отпуск')).toHaveCount(0, { timeout: 15000 })

    const c = await expand(page, T_TRAVEL)
    await expect(c.getByText('На согласовании')).toBeVisible()
    await expect(c.getByText('✈️ Проезд → Сочи')).toBeVisible()
  })

  test('учебный отпуск без справки: кнопка «Создать заявку» неактивна', async ({ page }) => {
    await world.loginPage(page, 'emp')
    await openVacationPage(page)
    await selectRange(page, T_EDU.s, T_EDU.e)
    await page.locator('#vacationType').selectOption('educational')
    await expect(page.getByRole('button', { name: 'Создать заявку' })).toBeDisabled()
    await page.getByRole('button', { name: 'Отмена', exact: true }).click()
    await expect(page.getByText('Создать заявку на отпуск')).toHaveCount(0)
  })

  test('не хватает дней: предупреждение и неактивная кнопка', async ({ page }) => {
    const year = Number(T_SHORT.s.slice(0, 4))
    await world.ok('PATCH', `/vacation/balances/${world.users.emp.id}`, { year, total_days: 1 })
    try {
      await world.loginPage(page, 'emp')
      await openVacationPage(page)
      await selectRange(page, T_SHORT.s, T_SHORT.e)
      await expect(page.getByText('⚠️ Недостаточно дней')).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole('button', { name: 'Создать заявку' })).toBeDisabled()
    } finally {
      await world.ok('PATCH', `/vacation/balances/${world.users.emp.id}`, { year, total_days: 40 })
    }
  })

  test('редактирование заявки на согласовании: новые даты сохраняются, старые пропадают', async ({ page }) => {
    await world.createRequest('emp', T_EDIT.s, T_EDIT.e, { comment: 'e2e-ve исходная' })
    await world.loginPage(page, 'emp')
    await openVacationPage(page)
    const c = await expand(page, T_EDIT)
    await c.getByRole('button', { name: 'Изменить', exact: true }).click()
    const form = page.locator('div.fixed.inset-0').filter({ hasText: 'Изменить заявку на отпуск' }).last()
    await expect(form).toBeVisible({ timeout: 5000 })
    await expect(form.locator('#startDate')).toHaveValue(T_EDIT.s)
    await form.locator('#startDate').fill(T_EDITED.s)
    await form.locator('#endDate').fill(T_EDITED.e)
    await form.getByRole('button', { name: 'Сохранить изменения' }).click()
    await expect(page.getByText('Заявка изменена')).toBeVisible({ timeout: 15000 })
    await expect(card(page, T_EDITED)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(titleRe(T_EDIT))).toHaveCount(0)
  })

  test('подписи в «Мои заявки»: на согласовании нет «Согласовал», у согласованной — руководитель, у отклонённой — «Отклонил»', async ({ page }) => {
    const approved = await world.createRequest('emp', T_APPROVED.s, T_APPROVED.e)
    await world.ok('POST', `/vacation/requests/${approved.id}/approve`, {}, world.users.mgr.token)
    const rejected = await world.createRequest('emp', T_REJECTED.s, T_REJECTED.e)
    await world.ok('POST', `/vacation/requests/${rejected.id}/reject`, { reason: 'e2e-ve: аврал' }, world.users.mgr.token)

    await world.loginPage(page, 'emp')
    await openVacationPage(page)
    const pending = await expand(page, T_EDITED)
    await expect(pending.getByText(/Согласовал:|Отклонил:/)).toHaveCount(0)
    await expect(pending.getByRole('button', { name: 'Изменить', exact: true })).toBeVisible()

    const ok = await expand(page, T_APPROVED)
    await expect(ok.getByText('Согласовал:')).toBeVisible()
    await expect(ok.getByText(/Начальников Олег/)).toBeVisible()
    await expect(ok.getByRole('button', { name: 'Изменить', exact: true })).toHaveCount(0)

    const no = await expand(page, T_REJECTED)
    await expect(no.getByText('Отклонил:')).toBeVisible()
    await expect(no.getByText('Причина отказа: e2e-ve: аврал')).toBeVisible()
  })

  test('комментарий к заявке сохраняется и виден в карточке', async ({ page }) => {
    await world.loginPage(page, 'emp')
    await openVacationPage(page)
    const c = await expand(page, T_EDITED)
    await c.getByRole('button', { name: 'Добавить комментарий' }).click()
    await c.getByPlaceholder('Введите комментарий...').fill(COMMENT)
    await c.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByText(COMMENT).first()).toBeVisible({ timeout: 10000 })
  })

  test('история заявок: заявки своего отдела видны, чужого отдела — нет', async ({ page }) => {
    const col = await world.createRequest('col', T_COLLEAGUE.s, T_COLLEAGUE.e)
    await world.ok('POST', `/vacation/requests/${col.id}/approve`, {}, world.users.mgr.token)
    const other = await world.createRequest('stranger', T_OTHER.s, T_OTHER.e)
    await world.approve(other.id)

    await world.loginPage(page, 'emp')
    await openVacationPage(page, '/vacation?tab=history')
    await expect(page.getByText('История заявок')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Коллегин Роман').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Отпускников Тимур').first()).toBeVisible()
    await expect(page.getByText('Чужаков Игорь')).toHaveCount(0)
  })

  test('производственный календарь: перенесённый выходной отмечен нерабочим, рабочая суббота — рабочим днём', async ({ page }) => {
    const year = THIS_YEAR + 1
    const cal = await world.ok<{ days: Array<{ day: string; kind: string }> }>('GET', `/vacation/production-calendar?year=${year}`)
    const transfer = cal.days.find((d) => d.kind === 'transfer')
    const workingSaturday = cal.days.find((d) => d.kind === 'shortened' && new Date(`${d.day}T12:00:00Z`).getUTCDay() === 6)
    test.skip(!transfer || !workingSaturday, `производственный календарь ${year} не загружен`)

    await world.loginPage(page, 'emp')
    await openVacationPage(page, `/vacation?year=${year}`)
    const cell = (d: string) => monthCard(page, monthName(d)).locator('[data-date-cell]').nth(dayOfMonth(d) - 1)
    await expect(cell(transfer!.day)).toHaveClass(/bg-muted/, { timeout: 10000 })
    await expect(cell(workingSaturday!.day)).not.toHaveClass(/bg-muted/)
    await expect(cell(workingSaturday!.day)).not.toHaveClass(/text-muted-foreground/)
  })

  test('год в адресе: переключение года меняет URL, ссылка с годом открывает нужный год', async ({ page }) => {
    await world.loginPage(page, 'emp')
    await openVacationPage(page)
    await page.getByRole('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first().click()
    await expect(page.getByText(`${THIS_YEAR + 1} год`, { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL(new RegExp(`year=${THIS_YEAR + 1}`))

    await page.goto(`/vacation?year=${THIS_YEAR + 1}`)
    await expect(page.getByText(`${THIS_YEAR + 1} год`, { exact: true })).toBeVisible({ timeout: 10000 })
    await page.goto('/vacation')
    await expect(page.getByText(`${THIS_YEAR} год`, { exact: true })).toBeVisible({ timeout: 10000 })
  })
})
