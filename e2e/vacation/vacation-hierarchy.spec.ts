import { test, expect, type Page } from '@playwright/test'
import { World, iso, ruDate, workdayOffset, monthCard, monthName, dayOfMonth, openVacationPage, approvalCards, selectRange } from './fixtures'
import {
  addDepartment, addEmployee, connect, openEdgeSettings,
  openEditorFromSidebarHierarchy, saveCanvas, setVisibility, visibilitySwitch,
} from '../hierarchyCanvas'

test.describe.configure({ mode: 'serial' })

const ORG_SLUG = 'mindit'
const PARENT_DEPT = 'E2E ВХ Управление'
const CHILD_DEPT = 'E2E ВХ Отдел'
const APPROVES = 'Родитель согласовывает отпуска подчинённых'
const PARENT_SEES = 'Родитель видит отпуска подчинённых'
const BLOCKED_TEXT = 'Подача заявок на отпуск для вашего отдела временно заблокирована HR'

const world = new World('vh', ORG_SLUG)
let canvasSnapshot: Awaited<ReturnType<World['hierarchySnapshot']>> | null = null

const R1 = { s: iso(workdayOffset(40)), e: iso(workdayOffset(40) + 2) }
const R2 = { s: iso(workdayOffset(55)), e: iso(workdayOffset(55) + 2) }
const R3 = { s: iso(workdayOffset(70)), e: iso(workdayOffset(70) + 2) }
const R4 = { s: iso(workdayOffset(90)), e: iso(workdayOffset(90) + 2) }

test.beforeAll(async () => {
  await world.init()
  canvasSnapshot = await world.hierarchySnapshot()
  await world.putHierarchy({})
  await world.ensureDepartment('parent', PARENT_DEPT)
  await world.ensureDepartment('child', CHILD_DEPT)
  await world.ensureUser('pm', { lastName: 'Родителев', firstName: 'Павел', role: 'manager', department: 'parent', position: 'Начальник управления' })
  await world.ensureUser('cm', { lastName: 'Дочерний', firstName: 'Кирилл', role: 'manager', department: 'child', position: 'Начальник отдела' })
  await world.ensureUser('emp', { lastName: 'Подчинёнов', firstName: 'Егор', role: 'employee', department: 'child' })
  await world.ensureUser('cur', { lastName: 'Кураторов', firstName: 'Семён', role: 'employee', department: 'parent', position: 'Куратор' })
  await world.setDepartment('parent', { manager_id: world.users.pm.id })
  await world.setDepartment('child', { manager_id: world.users.cm.id })
  await world.cancelAllRequests()
})

test.afterAll(async () => {
  await world.putHierarchy(canvasSnapshot?.data ?? {}).catch(() => {})
  await world.teardown()
})

async function asAdminInEditor(page: Page, expectedNodes?: number) {
  await world.loginPage(page, 'admin@example.com')
  await openEditorFromSidebarHierarchy(page, expectedNodes)
}

async function buildParentChild(page: Page) {
  const parent = await addDepartment(page, PARENT_DEPT, 0.45, 0.2)
  const child = await addDepartment(page, CHILD_DEPT, 0.45, 0.7)
  const link = await connect(page, parent, child)
  await expect(visibilitySwitch(link.modal, APPROVES)).toHaveAttribute('aria-checked', 'true')
  await link.save()
}

async function openTeamCalendarOf(page: Page, departmentName: string) {
  await openVacationPage(page)
  await page.getByRole('button', { name: 'Вся команда', exact: true }).click()
  await page.getByRole('button', { name: PARENT_DEPT, exact: true }).click()
  await page.locator('label', { hasText: PARENT_DEPT }).locator('input[type="checkbox"]').uncheck()
  const loaded = page.waitForResponse((r) => r.url().includes('/vacation/requests') && r.url().includes(`departmentId=${world.departments.child}`), { timeout: 15000 })
  await page.locator('label', { hasText: departmentName }).locator('input[type="checkbox"]').check()
  await loaded
  await page.getByRole('heading', { name: 'Отпуска', exact: true }).click()
  await expect(page.getByRole('button', { name: departmentName, exact: true })).toBeVisible({ timeout: 5000 })
}

async function hoverDay(page: Page, dateIso: string) {
  await monthCard(page, monthName(dateIso)).locator('[data-date-cell]').nth(dayOfMonth(dateIso) - 1).hover()
}

test.describe('Настройки отпусков через иерархию', () => {
  test('связь «Управление → Отдел» на холсте: заявка руководителя отдела уходит начальнику управления, он согласует', async ({ page }) => {
    await asAdminInEditor(page, 0)
    await buildParentChild(page)
    await saveCanvas(page)

    const child = await world.departmentRow('child')
    expect(child?.parent_id).toBe(world.departments.parent)
    expect(child?.vac_parent_approves).toBe(true)

    const req = await world.createRequest('cm', R1.s, R1.e)
    expect(req.approver_id).toBe(world.users.pm.id)

    await page.context().clearCookies()
    await world.loginPage(page, 'pm')
    await openVacationPage(page)
    const cards = await approvalCards(page)
    const card = cards.filter({ hasText: ruDate(R1.s) }).first()
    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card).toContainText('Дочерний')
    await card.getByRole('button').first().click()
    await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
    const approved = page.waitForResponse((r) => r.url().includes(`/vacation/requests/${req.id}/approve`), { timeout: 15000 })
    await page.getByTestId('vacation-detail-modal').getByRole('button', { name: 'Согласовать' }).click()
    const res = await approved
    expect(res.status(), await res.text()).toBe(200)
    await expect(cards.filter({ hasText: ruDate(R1.s) })).toHaveCount(0, { timeout: 15000 })
    expect((await world.requestRow(req.id))?.status).toBe('approved')
  })

  test('выключение «Родитель согласовывает» на связи: заявка мимо начальника управления, её согласует администратор', async ({ page }) => {
    await asAdminInEditor(page, 2)
    const modal = await openEdgeSettings(page)
    await setVisibility(modal, APPROVES, false)
    await modal.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(modal).toBeHidden({ timeout: 5000 })
    await saveCanvas(page)
    expect((await world.departmentRow('child'))?.vac_parent_approves).toBe(false)

    const req = await world.createRequest('cm', R2.s, R2.e)
    expect(req.approver_id).not.toBe(world.users.pm.id)

    await page.context().clearCookies()
    await world.loginPage(page, 'pm')
    await openVacationPage(page)
    const pmCards = await approvalCards(page)
    await expect(pmCards.filter({ hasText: ruDate(R2.s) })).toHaveCount(0, { timeout: 5000 })

    await page.context().clearCookies()
    await world.loginPage(page, 'admin@example.com')
    await openVacationPage(page)
    const adminCards = await approvalCards(page)
    const card = adminCards.filter({ hasText: ruDate(R2.s) }).filter({ hasText: 'Дочерний' }).first()
    await expect(card).toBeVisible({ timeout: 15000 })
    await card.getByRole('button').first().click()
    await page.getByTestId('vacation-detail-modal').getByRole('button', { name: 'Согласовать' }).click()
    await expect(adminCards.filter({ hasText: ruDate(R2.s) }).filter({ hasText: 'Дочерний' })).toHaveCount(0, { timeout: 15000 })
  })

  test('настройки отдела и схема синхронизированы: флаг, выключенный на схеме, виден в настройках отдела и возвращается оттуда на схему', async ({ page }) => {
    await world.loginPage(page, 'admin@example.com')
    await page.goto('/hr?tab=hr_departments')
    await page.getByRole('heading', { name: CHILD_DEPT, exact: true }).first().click()
    const panel = page.getByRole('dialog', { name: `Настройки отдела ${CHILD_DEPT}` })
    await expect(panel).toBeVisible({ timeout: 10000 })
    await expect(panel.getByText('на схеме «Иерархия»', { exact: false })).toBeVisible()
    await panel.getByRole('button', { name: 'Отпуска и видимость' }).click()
    const sw = panel.locator('.rounded-lg.border', { hasText: 'Родитель согласовывает отпуска отдела' }).first().getByRole('switch')
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await sw.click()
    await panel.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(panel).toBeHidden({ timeout: 10000 })
    expect((await world.departmentRow('child'))?.vac_parent_approves).toBe(true)

    await openEditorFromSidebarHierarchy(page, 2)
    const modal = await openEdgeSettings(page)
    await expect(visibilitySwitch(modal, APPROVES)).toHaveAttribute('aria-checked', 'true')
    await modal.getByRole('button', { name: 'Отмена', exact: true }).click()
  })

  test('куратор отдела на схеме: «Родитель видит отпуска подчинённых» показывает ему заявки отдела на согласовании, выключение — скрывает', async ({ page }) => {
    await world.putHierarchy({})
    await world.setDepartment('child', { parent_id: null, vac_parent_sees_child: true, vac_parent_approves: true })

    await asAdminInEditor(page, 0)
    const curator = await addEmployee(page, 'Кураторов', 0.45, 0.2)
    const child = await addDepartment(page, CHILD_DEPT, 0.45, 0.7)
    const link = await connect(page, curator, child)
    await expect(visibilitySwitch(link.modal, PARENT_SEES)).toHaveAttribute('aria-checked', 'true')
    await link.save()
    await saveCanvas(page)
    expect((await world.departmentRow('child'))?.parent_user_id).toBe(world.users.cur.id)

    const pending = await world.createRequest('emp', R3.s, R3.e)
    const seenByCurator = await world.ok<Array<{ id: number }>>('GET', '/vacation/requests', undefined, world.users.cur.token)
    expect(seenByCurator.map((r) => r.id)).toContain(pending.id)

    await page.context().clearCookies()
    await world.loginPage(page, 'cur')
    await openTeamCalendarOf(page, CHILD_DEPT)
    await expect(async () => {
      await page.mouse.move(0, 0)
      await hoverDay(page, R3.s)
      await expect(page.getByText('Подчинёнов Егор').first()).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15000 })

    await page.context().clearCookies()
    await asAdminInEditor(page, 2)
    const modal = await openEdgeSettings(page)
    await setVisibility(modal, PARENT_SEES, false)
    await modal.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await saveCanvas(page)
    expect((await world.departmentRow('child'))?.vac_parent_sees_child).toBe(false)

    await page.context().clearCookies()
    await world.loginPage(page, 'cur')
    await openTeamCalendarOf(page, CHILD_DEPT)
    await hoverDay(page, R3.s)
    await page.waitForTimeout(500)
    await expect(page.getByText('Подчинёнов Егор')).toHaveCount(0)
  })

  test('запрет подачи заявок в настройках отдела: сотрудник не может оформить отпуск, после снятия — может', async ({ page }) => {
    await world.setDepartment('child', { vacation_requests_blocked: true })
    await world.loginPage(page, 'emp')
    await openVacationPage(page)
    await expect(page.getByText(BLOCKED_TEXT).first()).toBeVisible({ timeout: 15000 })
    await monthCard(page, monthName(R4.s)).locator('[data-date-cell]').nth(dayOfMonth(R4.s) - 1).click()
    await expect(page.getByRole('heading', { name: 'Не удалось оформить заявку' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Понятно', exact: true }).click()
    await expect(page.getByText('Создать заявку на отпуск')).toHaveCount(0)

    await world.setDepartment('child', { vacation_requests_blocked: false })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Отпуска', exact: true })).toBeVisible({ timeout: 15000 })
    await selectRange(page, R4.s, R4.e)
    await page.getByRole('button', { name: 'Создать заявку' }).click()
    await expect(page.getByText('Создать заявку на отпуск')).toHaveCount(0, { timeout: 15000 })
  })
})
