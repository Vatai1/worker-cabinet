import { test, expect, type Page } from '@playwright/test'
import { World, iso, ruDate, workdayOffset, selectRange, openVacationPage, approvalCards } from './fixtures'

test.describe.configure({ mode: 'serial' })

const world = new World('vm', 1)
const DEPT = 'E2E ВР Отдел'
const SUB_DEPT = 'E2E ВР Группа'
const OTHER_DEPT = 'E2E ВР Посторонние'
const RESTRICTION = 'e2e-vm дежурство'
const RESTRICTION_EDITED = 'e2e-vm дежурство (изменено)'
const USED_HINT = 'Дни согласованных отпусков за год, включая ещё не наступившие'

const range = (from: number, len = 3) => {
  const s = workdayOffset(from)
  return { s: iso(s), e: iso(s + len - 1) }
}
const T_REJECT = range(30)
const T_COLLEAGUE = range(45)
const T_SUB = range(60)
const T_STRANGER = range(75)

test.beforeAll(async () => {
  await world.init()
  await world.ensureDepartment('dept', DEPT)
  await world.ensureDepartment('sub', SUB_DEPT)
  await world.ensureDepartment('other', OTHER_DEPT)
  await world.ensureUser('mgr', { lastName: 'Руководов', firstName: 'Антон', role: 'manager', department: 'dept', position: 'Руководитель отдела' })
  await world.ensureUser('emp', { lastName: 'Сотрудников', firstName: 'Денис', role: 'employee', department: 'dept' })
  await world.ensureUser('col', { lastName: 'Напарников', firstName: 'Глеб', role: 'employee', department: 'dept' })
  await world.ensureUser('sub', { lastName: 'Группин', firstName: 'Фёдор', role: 'employee', department: 'sub' })
  await world.ensureUser('stranger', { lastName: 'Постороннев', firstName: 'Лука', role: 'employee', department: 'other' })
  await world.setDepartment('dept', { manager_id: world.users.mgr.id })
  await world.setDepartment('sub', { parent_id: world.departments.dept })
  await world.cancelAllRequests()
  const restrictions = await world.ok<Array<{ id: number; description?: string | null }>>('GET', '/vacation/restrictions', undefined, world.users.mgr.token)
  for (const r of restrictions.filter((r) => (r.description || '').startsWith('e2e-vm'))) {
    await world.call('DELETE', `/vacation/restrictions/${r.id}`, undefined, world.users.mgr.token)
  }
})

test.afterAll(async () => {
  await world.teardown()
})

async function asManager(page: Page, path = '/vacation') {
  await world.loginPage(page, 'mgr')
  await openVacationPage(page, path)
}

const restrictionRow = (page: Page, text: string) => page.locator('div.rounded-xl.border').filter({ hasText: text }).first()

test.describe('Отпуск: руководитель', () => {
  test('отклонение требует причину: без неё «Подтвердить» неактивна, с ней заявка отклоняется', async ({ page }) => {
    const req = await world.createRequest('emp', T_REJECT.s, T_REJECT.e)
    await asManager(page)
    const cards = await approvalCards(page)
    const card = cards.filter({ hasText: ruDate(T_REJECT.s) }).first()
    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card).toContainText('Сотрудников')
    await card.getByRole('button').first().click()
    const modal = page.getByTestId('vacation-detail-modal')
    await modal.getByRole('button', { name: 'Отклонить' }).click()
    const confirm = modal.getByRole('button', { name: 'Подтвердить' })
    await expect(confirm).toBeDisabled()
    await modal.getByPlaceholder('Причина отклонения...').fill('e2e-vm: пик нагрузки')
    await expect(confirm).toBeEnabled()
    const rejected = page.waitForResponse((r) => r.url().includes(`/vacation/requests/${req.id}/reject`))
    await confirm.click()
    expect((await rejected).status()).toBe(200)
    await expect(cards.filter({ hasText: ruDate(T_REJECT.s) })).toHaveCount(0, { timeout: 15000 })
  })

  test('«Вся команда»: таблица работников отдела с колонкой «Осталось» и подсказкой к «Использовано»', async ({ page }) => {
    await asManager(page)
    await page.getByRole('button', { name: 'Вся команда', exact: true }).click()
    await page.getByText('Работники отдела', { exact: true }).first().click()
    const table = page.locator('table').filter({ hasText: 'Всего дней' }).first()
    await expect(table).toBeVisible({ timeout: 10000 })
    for (const header of ['ФИО', 'Всего дней', 'Использовано', 'Осталось']) {
      await expect(table.locator('th', { hasText: header })).toBeVisible()
    }
    await expect(table.locator('th', { hasText: 'Запланировано' })).toHaveCount(0)
    for (const name of ['Руководов Антон', 'Сотрудников Денис', 'Напарников Глеб']) {
      await expect(table.getByText(name)).toBeVisible()
    }
    await table.getByLabel(USED_HINT).hover()
    await expect(table.getByRole('tooltip')).toBeVisible()
    await expect(table.getByRole('tooltip')).toHaveText(USED_HINT)
  })

  test('пересечения: руководитель создаёт ограничение из двух работников с лимитом 1', async ({ page }) => {
    await asManager(page)
    await page.getByRole('button', { name: 'Пересечения', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Пересечения отпусков' })).toBeVisible({ timeout: 10000 })
    const search = page.getByPlaceholder('Поиск по ФИО или должности…')
    for (const surname of ['Сотрудников', 'Напарников']) {
      await search.fill(surname)
      const row = page.locator('div.max-h-60 button', { hasText: surname }).first()
      await row.waitFor({ state: 'visible', timeout: 10000 })
      await row.click()
    }
    await page.getByPlaceholder('Напр. для обеспечения непрерывной работы…').fill(RESTRICTION)
    await page.getByRole('button', { name: 'Создать ограничение' }).click()
    const row = restrictionRow(page, RESTRICTION)
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row).toContainText('Сотрудников')
    await expect(row).toContainText('Напарников')
  })

  test('предупреждение при подаче заявки: коллега по ограничению уже в отпуске в эти даты', async ({ page }) => {
    const col = await world.createRequest('col', T_COLLEAGUE.s, T_COLLEAGUE.e)
    await world.ok('POST', `/vacation/requests/${col.id}/approve`, {}, world.users.mgr.token)

    await world.loginPage(page, 'emp')
    await openVacationPage(page)
    await selectRange(page, T_COLLEAGUE.s, T_COLLEAGUE.e)
    await expect(page.getByText('Создать заявку на отпуск')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('В эти даты в отпуске:').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Напарников/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  })

  test('пересечения: ограничение редактируется и удаляется', async ({ page }) => {
    await asManager(page)
    await page.getByRole('button', { name: 'Пересечения', exact: true }).click()
    const row = restrictionRow(page, RESTRICTION)
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.getByTitle('Изменить').click()
    await expect(page.getByText('Вы редактируете ограничение')).toBeVisible({ timeout: 5000 })
    await page.getByPlaceholder('Напр. для обеспечения непрерывной работы…').fill(RESTRICTION_EDITED)
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    const edited = restrictionRow(page, RESTRICTION_EDITED)
    await expect(edited).toBeVisible({ timeout: 10000 })

    await edited.getByTitle('Удалить').click()
    await expect(page.locator('div.rounded-xl.border').filter({ hasText: RESTRICTION_EDITED })).toHaveCount(0, { timeout: 10000 })
  })

  test('история руководителя: свой и нижестоящий отдел видны, посторонний — нет', async ({ page }) => {
    const sub = await world.createRequest('sub', T_SUB.s, T_SUB.e)
    await world.approve(sub.id)
    const stranger = await world.createRequest('stranger', T_STRANGER.s, T_STRANGER.e)
    await world.approve(stranger.id)

    await asManager(page, '/vacation?tab=history')
    await expect(page.getByText('История заявок')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Напарников Глеб').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Группин Фёдор').first()).toBeVisible()
    await expect(page.getByText('Постороннев Лука')).toHaveCount(0)
  })
})
