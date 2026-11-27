import { expect, test, type Page } from '@playwright/test'
import { DEPARTMENT, EMPLOYEE_SETTINGS, makeTimesheet, TIMESHEET_DATE } from '../../../modules/timesheet/tests/fixtures'

const VISUAL_PAGE = '/e2e/timesheet/visual/index.html'

interface ScreenOptions {
  role?: 'manager' | 'hr'
  theme?: 'light' | 'dark'
}

async function openTimesheet(page: Page, { role = 'manager', theme = 'light' }: ScreenOptions = {}) {
  const sheet = makeTimesheet()
  sheet.entries.push(
    { employee_id: 1, staff_number: '0012', date: TIMESHEET_DATE, code: 'Я', minutes: 485 },
    { employee_id: 1, staff_number: '0047', date: TIMESHEET_DATE, code: 'НН' },
    { employee_id: 3, staff_number: '0054', date: TIMESHEET_DATE, code: 'Я' },
  )
  if (role === 'hr') {
    sheet.days.push({
      date: TIMESHEET_DATE,
      status: 'submitted',
      revision: 1,
      employee_ids: sheet.currentEmployeeIds,
      staff_rows: sheet.current_staff_rows,
      reason: null,
    })
  }

  const responses = new Map<string, unknown>([
    ['/api/departments', [DEPARTMENT]],
    ['/api/timesheet/my-departments', [DEPARTMENT]],
    ['/api/timesheet/employees/settings', EMPLOYEE_SETTINGS],
    ['/api/timesheet/days/submitted', [{ ...sheet, timesheet_id: sheet.id, date: TIMESHEET_DATE }]],
    ['/api/timesheet', [sheet]],
    [`/api/timesheet/${sheet.id}`, sheet],
  ])

  await page.clock.setFixedTime(new Date(`${TIMESHEET_DATE}T09:00:00+11:00`))
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort())
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url())
    if (route.request().method() !== 'GET' || !responses.has(pathname)) {
      await route.abort()
      return
    }
    await route.fulfill({ json: responses.get(pathname) })
  })
  await page.goto(`${VISUAL_PAGE}?role=${role}&theme=${theme}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('region', { name: 'Табель за месяц' })).toBeVisible()
}

test.skip(process.platform !== 'darwin' && process.platform !== 'linux', 'Эталоны Chromium доступны для macOS и Linux')

test('табель руководителя с двумя номерами, часами и отпуском', async ({ page }) => {
  await openTimesheet(page)
  await expect(page.getByRole('spinbutton', { name: `Часы за ${TIMESHEET_DATE} — Иванов Алексей · 0012` })).toHaveValue('8')
  await expect(page.getByRole('combobox', { name: `Отметка за ${TIMESHEET_DATE} — Иванов Алексей · 0047` })).toHaveText('НН')
  await expect(page).toHaveScreenshot('manager-grid.png', { fullPage: true })
})

test('форма возврата табеля у HR', async ({ page }) => {
  await openTimesheet(page, { role: 'hr' })
  await page.getByRole('button', { name: 'Вернуть на доработку' }).click()
  await page.getByRole('textbox', { name: 'Причина возврата' }).fill('Уточните часы работы за 10 ноября')
  await expect(page.getByRole('button', { name: 'Вернуть табель' })).toBeEnabled()
  await expect(page).toHaveScreenshot('hr-return.png', { fullPage: true })
})

test('таблица сотрудников с двумя номерами в тёмной теме', async ({ page }) => {
  await openTimesheet(page, { role: 'hr', theme: 'dark' })
  await page.getByRole('tab', { name: 'Сотрудники' }).click()
  const employees = page.getByRole('tabpanel', { name: 'Сотрудники' })
  await expect(employees.getByRole('textbox', { name: 'Табельный номер 2 — Иванов Алексей' })).toHaveValue('0047')
  await employees.getByRole('checkbox', { name: 'Выбрать — Иванов Алексей' }).check()
  await expect(employees.getByRole('button', { name: 'Отключить почасовой учёт' })).toBeEnabled()
  await expect(page).toHaveScreenshot('hr-employees-dark.png', { fullPage: true })
})

test('селектор месяца у HR на мобильном экране', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openTimesheet(page, { role: 'hr' })
  await page.getByRole('combobox', { name: 'Месяц', exact: true }).click()
  const list = page.getByRole('listbox', { name: 'Месяц' })
  await expect(list).toBeInViewport({ ratio: 0.99 })
  await expect(list.getByRole('option', { name: 'Ноябрь', selected: true })).toBeInViewport({ ratio: 0.99 })
  await expect(page).toHaveScreenshot('hr-mobile-month.png')
})
