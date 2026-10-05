import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loginAs } from '../helpers'

test.describe.configure({ mode: 'serial' })

const API = 'http://localhost:5000/api'
const ORG = { 'x-organization-id': '1' }
const DOCX_PATH = join(process.cwd(), 'e2e', 'vacation', 'fixtures', 'e2e-template.docx')
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const TEMPLATE_NAME = 'e2e Заявление на отпуск'
const UI_TEMPLATE_NAME = 'e2e UI шаблон'
const RESTRICTION_DESC = 'e2e-vf ограничение'
const REJECT_REASON = 'e2e-vf: не хватает людей'
const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

const iso = (offsetDays: number) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ruDate = (isoStr: string) => isoStr.split('-').reverse().join('.')
const monthName = (isoStr: string) => RU_MONTHS[parseInt(isoStr.slice(5, 7), 10) - 1]
const dayOfMonth = (isoStr: string) => parseInt(isoStr.slice(8, 10), 10)
const rangeText = (s: string, e: string, days: number) => `${ruDate(s)} - ${ruDate(e)} (${days} дней)`

const A_S = iso(30), A_E = iso(34)
const B_S = iso(45), B_E = iso(49)
const C_S = iso(75), C_E = iso(79)
const OWN_DAY = iso(31)
const D_S = iso(60), D_E = iso(64)
const E_S = iso(70), E_E = iso(74)
const F_S = iso(80), F_E = iso(84)

let api: APIRequestContext
let empToken = ''
let mgrToken = ''
let admToken = ''
let petrovId = 0
let kuznetsovId = 0
let petrovTotalDays: number | null = null
let ivanovTotalDays: number | null = null

async function apiLogin(email: string) {
  const res = await api.post(`${API}/auth/login`, { data: { email, password: 'password123' } })
  const body = await res.json()
  if (!body.token) throw new Error(`api login failed for ${email}`)
  return body.token as string
}

async function loginAsEmail(page: Page, email: string) {
  const res = await api.post(`${API}/auth/login`, { data: { email, password: 'password123' } })
  const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
  const tokenMatch = setCookie.find((c) => c.startsWith('auth_token='))
  const csrfMatch = setCookie.find((c) => c.startsWith('csrf_token='))
  if (!tokenMatch) throw new Error(`login failed for ${email}: no auth_token`)
  await page.context().addCookies([
    { name: 'auth_token', value: tokenMatch.split('=')[1].split(';')[0], domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'csrf_token', value: csrfMatch ? csrfMatch.split('=')[1].split(';')[0] : '', domain: 'localhost', path: '/', sameSite: 'Lax' },
  ])
}

async function cancelUserVacations(token: string, userId: number) {
  const res = await api.get(`${API}/vacation/requests?userId=${userId}`, {
    headers: { ...ORG, Authorization: `Bearer ${token}` },
  })
  const list = (await res.json()) as Array<{ id: number; status: string; start_date: string; end_date: string }>
  const active = list.filter((r) => ['on_approval', 'approved'].includes(r.status) && r.end_date >= iso(0))
  for (const r of active) {
    await api.post(`${API}/vacation/requests/${r.id}/cancel`, {
      headers: { ...ORG, Authorization: `Bearer ${token}` },
      data: {},
    })
  }
}

async function cancelTestVacations() {
  const res = await api.get(`${API}/vacation/requests?userId=3`, {
    headers: { ...ORG, Authorization: `Bearer ${empToken}` },
  })
  const list = (await res.json()) as Array<{ id: number; status: string; start_date: string }>
  const active = list.filter((r) => ['on_approval', 'approved'].includes(r.status) && r.start_date >= iso(20))
  for (const r of active) {
    await api.post(`${API}/vacation/requests/${r.id}/cancel`, {
      headers: { ...ORG, Authorization: `Bearer ${empToken}` },
      data: {},
    })
  }
}

async function deleteTestRestrictions() {
  const res = await api.get(`${API}/vacation/restrictions`, {
    headers: { ...ORG, Authorization: `Bearer ${mgrToken}` },
  })
  const list = (await res.json()) as Array<{ id: number; description?: string | null }>
  for (const r of list.filter((r) => (r.description || '').startsWith('e2e'))) {
    await api.delete(`${API}/vacation/restrictions/${r.id}`, {
      headers: { ...ORG, Authorization: `Bearer ${mgrToken}` },
    })
  }
}

async function deleteTestTemplates() {
  const res = await api.get(`${API}/dictionaries/doc-templates`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
  })
  const list = (await res.json()) as Array<{ id: number; name: string }>
  for (const t of list.filter((t) => t.name.startsWith('e2e'))) {
    await api.delete(`${API}/dictionaries/doc-templates/${t.id}`, {
      headers: { ...ORG, Authorization: `Bearer ${admToken}` },
    })
  }
}

let displacedTemplate: { id: number; name: string; description?: string | null } | null = null

async function setTemplatePurpose(template: { id: number; name: string; description?: string | null }, purpose: string) {
  const res = await api.put(`${API}/dictionaries/doc-templates/${template.id}`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
    multipart: { name: template.name, description: template.description ?? '', purpose },
  })
  if (!res.ok()) throw new Error(`не удалось изменить назначение шаблона «${template.name}»: ${res.status()} ${await res.text()}`)
}

async function cleanupE2EData() {
  await cancelTestVacations()
  await deleteTestRestrictions()
  await deleteTestTemplates()
}

test.beforeAll(async () => {
  api = await pwRequest.newContext()
  empToken = await apiLogin('ivanov@example.com')
  mgrToken = await apiLogin('petrov@example.com')
  admToken = await apiLogin('admin@example.com')
  await cleanupE2EData()
  const existingTemplates = (await (await api.get(`${API}/dictionaries/doc-templates`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
  })).json()) as Array<{ id: number; name: string; description?: string | null; purpose?: string | null }>
  displacedTemplate = existingTemplates.find((t) => t.purpose === 'vacation_template') ?? null
  if (displacedTemplate) await setTemplatePurpose(displacedTemplate, '')
  const created = await api.post(`${API}/dictionaries/doc-templates`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
    multipart: {
      name: TEMPLATE_NAME,
      purpose: 'vacation_template',
      file: { name: 'e2e-template.docx', mimeType: DOCX_MIME, buffer: readFileSync(DOCX_PATH) },
    },
  })
  if (!created.ok()) throw new Error(`шаблон заявления не создан: ${created.status()} ${await created.text()}`)
  const usersRes = await api.get(`${API}/users`, { headers: { ...ORG, Authorization: `Bearer ${admToken}` } })
  const users = (await usersRes.json()) as Array<{ id: number; email: string }>
  petrovId = users.find((u) => u.email === 'petrov@example.com')?.id ?? 0
  kuznetsovId = users.find((u) => u.email === 'kuznetsov@crct.ru')?.id ?? 0
  if (!petrovId || !kuznetsovId) throw new Error('petrov/kuznetsov не найдены в /users')
  await cancelUserVacations(mgrToken, petrovId)
  const balanceRes = await api.get(`${API}/vacation/balance/${petrovId}?year=${new Date().getFullYear()}`, {
    headers: { ...ORG, Authorization: `Bearer ${mgrToken}` },
  })
  petrovTotalDays = ((await balanceRes.json()) as { total_days?: number }).total_days ?? null
  await api.patch(`${API}/vacation/balances/${petrovId}`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
    data: { year: new Date().getFullYear(), total_days: 40 },
  })
  const mgrVacation = await api.post(`${API}/vacation/requests`, {
    headers: { ...ORG, Authorization: `Bearer ${mgrToken}` },
    data: { startDate: iso(0), endDate: iso(7), vacationType: 'annual_paid', substitute_ids: [kuznetsovId] },
  })
  if (!mgrVacation.ok()) throw new Error(`отпуск руководителя не создан: ${mgrVacation.status()} ${await mgrVacation.text()}`)
  const mgrVacationBody = await mgrVacation.json()
  const mgrApproved = await api.post(`${API}/vacation/requests/${mgrVacationBody.id}/approve`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
    data: {},
  })
  if (!mgrApproved.ok()) throw new Error(`отпуск руководителя не согласован: ${mgrApproved.status()}`)
  const ivanovBalance = await api.get(`${API}/vacation/balance/3?year=${new Date().getFullYear()}`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
  })
  ivanovTotalDays = ((await ivanovBalance.json()) as { total_days?: number }).total_days ?? null
  await api.patch(`${API}/vacation/balances/3`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
    data: { year: new Date().getFullYear(), total_days: 80 },
  })
  await api.patch(`${API}/vacation/balances/3`, {
    headers: { ...ORG, Authorization: `Bearer ${admToken}` },
    data: { year: new Date().getFullYear() + 1, total_days: 28 },
  })
})

test.afterAll(async () => {
  await cleanupE2EData()
  if (displacedTemplate) await setTemplatePurpose(displacedTemplate, 'vacation_template')
  await cancelUserVacations(mgrToken, petrovId)
  if (ivanovTotalDays !== null) {
    await api.patch(`${API}/vacation/balances/3`, {
      headers: { ...ORG, Authorization: `Bearer ${admToken}` },
      data: { year: new Date().getFullYear(), total_days: ivanovTotalDays },
    })
  }
  if (petrovTotalDays !== null) {
    await api.patch(`${API}/vacation/balances/${petrovId}`, {
      headers: { ...ORG, Authorization: `Bearer ${admToken}` },
      data: { year: new Date().getFullYear(), total_days: petrovTotalDays },
    })
  }
  await api.dispose()
})

async function openVacation(page: Page, role: 'employee' | 'manager' | 'hr' | 'admin') {
  await loginAs(page, role)
  await page.context().addCookies([
    { name: 'active_org_id', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
    { name: 'vacation_intro_seen', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
  ])
  await page.goto('/vacation')
  await expect(page.getByRole('heading', { name: 'Отпуска', exact: true })).toBeVisible()
}

const monthCard = (page: Page, name: string) => page.getByTestId('month-card').filter({ hasText: name }).first()

async function selectRange(page: Page, startIso: string, endIso: string) {
  await monthCard(page, monthName(startIso)).locator('[data-date-cell]').nth(dayOfMonth(startIso) - 1).click()
  await expect(page.getByText(/Выбрана дата:/)).toBeVisible({ timeout: 5000 })
  await monthCard(page, monthName(endIso)).locator('[data-date-cell]').nth(dayOfMonth(endIso) - 1).click()
  await expect(page.getByText(/Период:/)).toBeVisible({ timeout: 5000 })
}

async function submitRequest(page: Page, comment: string) {
  await expect(page.getByText('Создать заявку на отпуск')).toBeVisible({ timeout: 5000 })
  await page.locator('#vacationType').selectOption('annual_paid')
  await page.getByPlaceholder('Укажите причину или дополнительные сведения...').fill(comment)
  const submit = page.getByRole('button', { name: 'Создать заявку' })
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page.getByText('Создать заявку на отпуск')).toHaveCount(0, { timeout: 15000 })
}

const myCard = (page: Page, text: string) => page.getByText(text, { exact: true }).locator('xpath=../..').first()

async function ensureCardExpanded(page: Page, text: string) {
  const card = page.getByText(text, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]').first()
  await card.waitFor({ state: 'visible', timeout: 10000 })
  const probe = card.getByText('Тип: ')
  if (!(await probe.isVisible().catch(() => false))) {
    await page.getByText(text, { exact: true }).locator('xpath=../..').click()
    await expect(probe).toBeVisible({ timeout: 5000 })
  }
  return card
}

test.describe('Модуль Отпуск — user stories (E2E)', () => {
  test.describe('US-1/US-2. Работник подаёт и отслеживает заявки', () => {
    test('создаёт заявку A через календарь', async ({ page }) => {
      await openVacation(page, 'employee')
      await selectRange(page, A_S, A_E)
      await submitRequest(page, 'e2e-vf A')
      const card = myCard(page, rangeText(A_S, A_E, 5))
      await expect(card).toBeVisible({ timeout: 10000 })
      await expect(card.getByText('На согласовании')).toBeVisible()
    })

    test('создаёт заявку B', async ({ page }) => {
      await openVacation(page, 'employee')
      await selectRange(page, B_S, B_E)
      await submitRequest(page, 'e2e-vf B')
      await expect(myCard(page, rangeText(B_S, B_E, 5))).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('US-4. Руководитель согласовывает и отклоняет', () => {
    test('согласовывает заявку A работника', async ({ page }) => {
      await openVacation(page, 'manager')
      await page.getByRole('button', { name: /Согласование/ }).click()
      const card = page.getByTestId('approval-card').filter({ hasText: ruDate(A_S) }).first()
      await card.waitFor({ state: 'visible', timeout: 15000 })
      await card.getByRole('button').first().click()
      await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: 'Согласовать' }).click()
      await expect(page.getByTestId('approval-card').filter({ hasText: ruDate(A_S) })).toHaveCount(0, { timeout: 15000 })
    })

    test('отклоняет заявку B с причиной', async ({ page }) => {
      await openVacation(page, 'manager')
      await page.getByRole('button', { name: /Согласование/ }).click()
      const card = page.getByTestId('approval-card').filter({ hasText: ruDate(B_S) }).first()
      await card.waitFor({ state: 'visible', timeout: 15000 })
      await card.getByRole('button').first().click()
      const modal = page.getByTestId('vacation-detail-modal')
      await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
      await modal.getByRole('button', { name: 'Отклонить' }).click()
      await modal.getByPlaceholder('Причина отклонения...').fill(REJECT_REASON)
      await modal.getByRole('button', { name: 'Подтвердить' }).click()
      await expect(page.getByTestId('approval-card').filter({ hasText: ruDate(B_S) })).toHaveCount(0, { timeout: 15000 })
    })
  })

  test.describe('US-2. Работник видит статусы и баланс', () => {
    test('A — Согласовано, B — Отклонено с причиной, баланс виден', async ({ page }) => {
      await openVacation(page, 'employee')
      const cardA = myCard(page, rangeText(A_S, A_E, 5))
      await expect(cardA.getByText('Согласовано', { exact: true })).toBeVisible({ timeout: 10000 })
      await expect(myCard(page, rangeText(B_S, B_E, 5)).getByText('Отклонено', { exact: true })).toBeVisible({ timeout: 10000 })
      const cardB = await ensureCardExpanded(page, rangeText(B_S, B_E, 5))
      await expect(cardB.getByText(`Причина отказа: ${REJECT_REASON}`).first()).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('Доступно к запросу').first()).toBeVisible()
    })
  })

  test.describe('US-6/US-7. Перенос отпуска', () => {
    test('работник запрашивает перенос A на новые даты', async ({ page }) => {
      await openVacation(page, 'employee')
      const dayCell = monthCard(page, monthName(OWN_DAY)).locator('[data-date-cell]').nth(dayOfMonth(OWN_DAY) - 1)
      await dayCell.click({ button: 'right' })
      const contextMenu = page.locator('div.fixed.z-50').filter({ hasText: 'Перенести' }).first()
      await expect(contextMenu).toBeVisible({ timeout: 5000 })
      await contextMenu.getByRole('button', { name: /Перенести/ }).click({ force: true })
      await expect(page.getByPlaceholder('Укажите причину переноса отпуска...')).toBeVisible({ timeout: 5000 })
      await page.locator('input[type="date"]').first().fill(C_S)
      await page.locator('input[type="date"]').nth(1).fill(C_E)
      await page.getByPlaceholder('Укажите причину переноса отпуска...').fill('e2e-vf: перенос по семейным обстоятельствам')
      await page.getByRole('button', { name: 'Запросить перенос' }).click()
      await expect(page.getByPlaceholder('Укажите причину переноса отпуска...')).toHaveCount(0, { timeout: 10000 })
      await expect(myCard(page, rangeText(C_S, C_E, 5)).getByText('На согласовании')).toBeVisible({ timeout: 15000 })
    })

    test('руководитель согласовывает перенос', async ({ page }) => {
      await openVacation(page, 'manager')
      await page.getByRole('button', { name: /Согласование/ }).click()
      const card = page.getByTestId('approval-card').filter({ hasText: ruDate(C_S) }).first()
      await card.waitFor({ state: 'visible', timeout: 15000 })
      await card.getByRole('button').first().click()
      await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: 'Согласовать' }).click()
      await expect(page.getByTestId('approval-card').filter({ hasText: ruDate(C_S) })).toHaveCount(0, { timeout: 15000 })
    })

    test('работник видит результат: новые даты согласованы, прежние закрыты', async ({ page }) => {
      await openVacation(page, 'employee')
      await expect(myCard(page, rangeText(C_S, C_E, 5)).getByText('Согласовано', { exact: true })).toBeVisible({ timeout: 15000 })
      await expect(page.getByText(rangeText(A_S, A_E, 5), { exact: true })).toHaveCount(0, { timeout: 10000 })
    })
  })

  test.describe('US-3. Работник отменяет свою заявку', () => {
    test('отмена согласованной заявки C через подтверждение', async ({ page }) => {
      await openVacation(page, 'employee')
      const cardC = await ensureCardExpanded(page, rangeText(C_S, C_E, 5))
      const cancelButton = cardC.getByRole('button', { name: 'Отменить заявку' })
      await cancelButton.scrollIntoViewIfNeeded()
      await cancelButton.click()
      await expect(page.getByRole('heading', { name: 'Отменить заявку?' })).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: 'Отменить', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Отменить заявку?' })).toHaveCount(0, { timeout: 10000 })
      await expect(myCard(page, rangeText(C_S, C_E, 5)).getByText('Согласовано', { exact: true })).toHaveCount(0, { timeout: 10000 })
    })
  })

  test.describe('US-9. Руководитель управляет пересечениями', () => {
    test('создаёт парное ограничение через UI', async ({ page }) => {
      await openVacation(page, 'manager')
      await page.getByRole('button', { name: 'Пересечения', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Пересечения отпусков' })).toBeVisible({ timeout: 5000 })

      const search = page.getByPlaceholder('Поиск по ФИО или должности…')
      for (const surname of ['Иванов', 'Кузнецов']) {
        await search.fill(surname)
        const row = page.locator('div.max-h-60 button', { hasText: surname }).first()
        await row.waitFor({ state: 'visible', timeout: 5000 })
        await row.click()
      }
      await page.getByPlaceholder('Напр. для обеспечения непрерывной работы…').fill(RESTRICTION_DESC)
      await page.getByRole('button', { name: 'Создать ограничение' }).click()
      await expect(page.getByText(RESTRICTION_DESC, { exact: true })).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('US-10. Управление шаблонами документов', () => {
    test('admin создаёт шаблон через UI и удаляет его', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.context().addCookies([
        { name: 'active_org_id', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
        { name: 'hr_panel_intro_seen', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
      ])
      await page.goto('/hr/doc-templates/new')
      await page.locator('#tmpl-name').fill(UI_TEMPLATE_NAME)
      await page.locator('input[type="file"]').setInputFiles(DOCX_PATH)
      await page.getByRole('button', { name: 'Создать шаблон' }).click()
      await expect(page.getByText(UI_TEMPLATE_NAME, { exact: true })).toBeVisible({ timeout: 15000 })

      const trash = page.getByText(UI_TEMPLATE_NAME, { exact: true }).locator('xpath=following::button[@title="Удалить"][1]')
      await trash.scrollIntoViewIfNeeded()
      await trash.click()
      await expect(page.getByRole('heading', { name: 'Удаление шаблона' })).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: 'Удалить', exact: true }).last().click()
      await expect(page.getByText(UI_TEMPLATE_NAME, { exact: true })).toHaveCount(0, { timeout: 15000 })
    })
  })

  test.describe('US-11. Работник генерирует заявление', () => {
    test('скачивает заявление .docx по шаблону', async ({ page }) => {
      await openVacation(page, 'employee')
      await page.getByRole('button', { name: 'Заявления', exact: true }).click()
      await page.getByRole('button', { name: /Заявление на отпуск/ }).click()
      await expect(page.getByRole('heading', { name: 'Заявление на отпуск' })).toBeVisible({ timeout: 5000 })
      const templateCard = page.locator('button', { hasText: TEMPLATE_NAME }).first()
      await templateCard.waitFor({ state: 'visible', timeout: 10000 })
      await templateCard.click()
      const download = page.getByRole('button', { name: 'Скачать .docx' })
      await expect(download).toBeEnabled()
      await download.click()
      const nameDialog = page.getByRole('dialog', { name: 'Как склоняется ваше ФИО?' })
      const done = page.getByText('Заявление сформировано')
      await expect(nameDialog.or(done)).toBeVisible({ timeout: 15000 })
      if (await nameDialog.isVisible()) {
        await expect(nameDialog.getByTestId('name-genitive-preview')).toContainText('От')
        await nameDialog.getByRole('button', { name: 'Сохранить и продолжить' }).click()
      }
      await expect(done).toBeVisible({ timeout: 15000 })
    })
  })

  test.describe('US-5. Замещающий согласовывает заявку', () => {
    test('заместитель видит заявку в очереди; кнопки согласования в модалке ему не показываются (известная проблема)', async ({ page }) => {
      const created = await api.post(`${API}/vacation/requests`, {
        headers: { ...ORG, Authorization: `Bearer ${empToken}` },
        data: { startDate: D_S, endDate: D_E, vacationType: 'annual_paid', comment: 'e2e-vf D' },
      })
      if (!created.ok()) throw new Error(`создание заявки D упало: ${created.status()}`)

      await loginAsEmail(page, 'kuznetsov@crct.ru')
      await page.context().addCookies([
        { name: 'active_org_id', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
        { name: 'vacation_intro_seen', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
      ])
      await page.goto('/vacation')
      await expect(page.getByRole('heading', { name: 'Отпуска', exact: true })).toBeVisible()
      await page.getByRole('button', { name: /Согласование/ }).click()
      const card = page.getByTestId('approval-card').filter({ hasText: ruDate(D_S) }).first()
      await card.waitFor({ state: 'visible', timeout: 15000 })
      await card.getByRole('button').first().click()
      await expect(page.getByRole('heading', { name: 'Детали отпуска' })).toBeVisible({ timeout: 5000 })
      const modal = page.getByTestId('vacation-detail-modal')
      await expect(modal.getByRole('button', { name: 'Согласовать' })).toHaveCount(0)
      await expect(modal.getByRole('button', { name: 'Отклонить', exact: true })).toHaveCount(0)

      const approved = await api.post(`${API}/vacation/requests/${(await created.json()).id}/approve`, {
        headers: { ...ORG, Authorization: `Bearer ${admToken}` },
        data: {},
      })
      if (!approved.ok()) throw new Error(`approve заявки D через API упал: ${approved.status()}`)
    })
  })

  test.describe('US-8. Назначение и удаление замещающих в карточке', () => {
    test('работник назначает и удаляет замещающего у согласованной заявки', async ({ page }) => {
      const created = await api.post(`${API}/vacation/requests`, {
        headers: { ...ORG, Authorization: `Bearer ${empToken}` },
        data: { startDate: E_S, endDate: E_E, vacationType: 'annual_paid', comment: 'e2e-vf E' },
      })
      const body = await created.json()
      if (!created.ok()) throw new Error(`создание заявки E упало: ${created.status()}`)
      const approved = await api.post(`${API}/vacation/requests/${body.id}/approve`, {
        headers: { ...ORG, Authorization: `Bearer ${admToken}` },
        data: {},
      })
      if (!approved.ok()) throw new Error(`approve заявки E упал: ${approved.status()}`)

      await openVacation(page, 'employee')
      const card = await ensureCardExpanded(page, rangeText(E_S, E_E, 5))
      const addBtn = card.getByRole('button', { name: 'Добавить замещающего' })
      await addBtn.scrollIntoViewIfNeeded()
      await addBtn.click()
      const pickerRow = page.locator('div.max-h-40 button', { hasText: 'Кузнецов' }).first()
      await pickerRow.waitFor({ state: 'visible', timeout: 5000 })
      await pickerRow.click()
      await expect(page.getByText('Замещающий назначен')).toBeVisible({ timeout: 10000 })
      await expect(card.getByText('Кузнецов', { exact: false })).toBeVisible({ timeout: 5000 })

      await card.locator('span', { hasText: 'Кузнецов' }).getByRole('button').first().click()
      await expect(page.getByText('Замещающий удалён')).toBeVisible({ timeout: 10000 })
      await expect(card.getByText('Кузнецов', { exact: false })).toHaveCount(0, { timeout: 5000 })
    })
  })

  test.describe('US-12. Календарь: сегмент команды и фильтры', () => {
    test('«Вся команда» показывает раздел «Работники отдела», «Мои отпуска» возвращает личный вид', async ({ page }) => {
      await openVacation(page, 'employee')
      await expect(page.getByText('Работники отдела')).toHaveCount(0)
      await page.getByRole('button', { name: 'Вся команда', exact: true }).click()
      await expect(page.getByText('Работники отдела').first()).toBeVisible({ timeout: 10000 })
      await expect(page.getByPlaceholder('Поиск по ФИО')).toBeVisible()
      await page.getByRole('button', { name: 'Мои отпуска', exact: true }).click()
      await expect(page.getByText('Работники отдела')).toHaveCount(0, { timeout: 5000 })
    })
  })

  test.describe('US-14. HR: панель дней отпуска', () => {
    test('HR открывает «Дни отпуска» в панели отпусков', async ({ page }) => {
      await loginAs(page, 'hr')
      await page.context().addCookies([
        { name: 'active_org_id', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
        { name: 'hr_panel_intro_seen', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
      ])
      await page.goto('/hr?tab=vacation')
      await page.getByRole('button', { name: 'Дни отпуска', exact: true }).click()
      await expect(page.getByText('Сколько дней отпуска доступно по умолчанию, по должностям и по работникам')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('US-15. Праздники 2027: заявка через UI со сдвигом длительности', () => {
    test('диапазон 05–20 января 2027 создаёт заявку на 12 дней', async ({ page }) => {
      await openVacation(page, 'employee')
      await page.locator('button:has(svg.lucide-chevron-right), button[disabled]').first().waitFor({ state: 'detached' }).catch(() => {})
      const nextYear = page.getByRole('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first()
      await nextYear.click()
      await expect(page.getByText(`${new Date().getFullYear() + 1} год`, { exact: true })).toBeVisible({ timeout: 5000 })
      await selectRange(page, '2027-01-05', '2027-01-20')
      await submitRequest(page, 'e2e-vf праздники 2027')
      await expect(myCard(page, rangeText('2027-01-05', '2027-01-20', 12))).toBeVisible({ timeout: 15000 })
    })
  })

  test.describe('400-валидация в UI', () => {
    test('пересечение с существующей заявкой показывает сообщение сервера', async ({ page }) => {
      const created = await api.post(`${API}/vacation/requests`, {
        headers: { ...ORG, Authorization: `Bearer ${empToken}` },
        data: { startDate: F_S, endDate: F_E, vacationType: 'annual_paid', comment: 'e2e-vf F' },
      })
      if (!created.ok()) throw new Error(`создание заявки F упало: ${created.status()}`)

      await openVacation(page, 'employee')
      await selectRange(page, F_S, F_E)
      await expect(page.getByText('Создать заявку на отпуск')).toBeVisible({ timeout: 5000 })
      await page.locator('#vacationType').selectOption('annual_paid')
      const submit = page.getByRole('button', { name: 'Создать заявку' })
      await expect(submit).toBeEnabled({ timeout: 15000 })
      await submit.click()
      await expect(page.getByText('Пересечение с существующей заявкой').first()).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Создать заявку на отпуск')).toBeVisible()
    })
  })
})
