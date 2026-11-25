import { createRequire } from 'node:module'
import { test, expect, API, chooseOption } from './fixtures'

const { Workbook } = createRequire(new URL('../../backend/package.json', import.meta.url))('exceljs') as typeof import('../../backend/node_modules/exceljs')

test.describe.configure({ mode: 'default', timeout: 120_000 })

test('UC-01: руководитель отправляет день с отпуском, HR возвращает, руководитель исправляет и переотправляет, HR принимает', async ({ page, browser, scenario }) => {
  const { world, sheet, today, open } = scenario
  const vacation = await world.createRequest('leave', today, today)
  await world.approve(vacation.id)
  await open(page, 'mgr')
  const leaveRow = page.getByRole('row').filter({ hasText: 'Отпусков Пётр' })
  await expect(leaveRow.getByRole('cell').nth(Number(today.slice(-2)) - 1)).toHaveText('О')
  await expect(page.getByRole('combobox', { name: `Отметка за ${today} — Отпусков Пётр`, exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Отправить на проверку', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Заполните отметки')
  await page.getByRole('button', { name: 'Явка всем', exact: true }).click()
  const submitted = page.waitForResponse(response => response.url().endsWith(`/timesheet/${sheet.id}/days/${today}/submit`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Отправить на проверку', exact: true }).click()
  expect((await submitted).status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Отправить на проверку', exact: true })).toHaveCount(0)
  expect((await world.call('PUT', `/timesheet/${sheet.id}/entries`, [{ employee_id: world.users.worker.id, date: today, code: 'Б' }], world.users.mgr.token)).status).toBe(409)

  const hrPage = await browser.newPage()
  try {
    await open(hrPage, 'hr')
    await expect(hrPage.getByRole('button', { name: new RegExp(`${scenario.department}.*версия 1`) })).toBeVisible()
    await hrPage.getByRole('button', { name: 'Вернуть на доработку', exact: true }).click()
    await expect(hrPage.getByRole('button', { name: 'Вернуть табель', exact: true })).toBeDisabled()
    await hrPage.getByRole('textbox', { name: 'Причина возврата', exact: true }).fill('Уточните отсутствие Почасового')
    await hrPage.getByRole('button', { name: 'Вернуть табель', exact: true }).click()
    await expect(hrPage.getByText('Причина возврата. Уточните отсутствие Почасового', { exact: true })).toBeVisible()

    await page.goto('/notifications')
    await expect(page.getByText('Уточните отсутствие Почасового', { exact: false })).toBeVisible()
    await page.getByText('Табель возвращён на доработку', { exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`departmentId=${world.departments.dept}`))
    const mark = page.getByRole('combobox', { name: `Отметка за ${today} — Почасовой Иван`, exact: true })
    await mark.press('ArrowDown')
    await expect(page.getByRole('listbox', { name: `Отметка за ${today} — Почасовой Иван` })).toBeVisible()
    await mark.press('Escape')
    await expect(mark).toBeFocused()
    await expect(mark).toHaveAttribute('aria-expanded', 'false')
    await chooseOption(mark, /^НН — Неявки/)
    await page.getByRole('button', { name: 'Отправить на проверку', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Отправить на проверку', exact: true })).toHaveCount(0)

    await hrPage.getByRole('button', { name: 'Обновить', exact: true }).click()
    await hrPage.getByRole('button', { name: 'Принять табель', exact: true }).click()
    await expect(hrPage.getByRole('button', { name: 'Принять табель', exact: true })).toHaveCount(0)
    const accepted = await world.ok<{ entries: { employee_id: number; date: string; code: string }[]; days: { date: string; status: string; revision: number }[] }>('GET', `/timesheet/${sheet.id}`)
    expect(accepted.days.find(day => day.date === today)).toMatchObject({ status: 'approved', revision: 2 })
    expect(accepted.entries.find(entry => entry.employee_id === world.users.worker.id && entry.date === today)?.code).toBe('НН')
    expect(accepted.entries.find(entry => entry.employee_id === world.users.leave.id && entry.date === today)?.code).toBe('О')
  } finally {
    await hrPage.close()
  }
})

test('UC-02: HR массово меняет учёт и номера; руководитель вводит часы, отправляет день и скачивает Excel/PDF', async ({ page, scenario }) => {
  const { world, sheet, today, open } = scenario
  const firstNumber = `001-${world.ns}`
  const secondNumber = `002-${world.ns}`
  const additionalNumber = `003-${world.ns}`
  await open(page, 'hr')
  await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click()
  const panel = page.getByRole('tabpanel', { name: 'Сотрудники', exact: true })
  await chooseOption(panel.getByRole('combobox', { name: 'Отдел сотрудников', exact: true }), scenario.department)
  await panel.getByRole('textbox', { name: 'Табельный номер — Почасовой Иван', exact: true }).fill(firstNumber)
  await panel.getByRole('button', { name: 'Добавить табельный номер — Почасовой Иван', exact: true }).click()
  await panel.getByRole('textbox', { name: 'Табельный номер 2 — Почасовой Иван', exact: true }).fill(additionalNumber)
  await panel.getByRole('textbox', { name: 'Табельный номер — Табельников Антон', exact: true }).fill(secondNumber)
  await panel.getByRole('checkbox', { name: 'Выбрать всех показанных сотрудников', exact: true }).check()
  await panel.getByRole('button', { name: 'Включить почасовой учёт', exact: true }).click()
  await panel.getByRole('button', { name: 'Сохранить изменения (3)', exact: true }).click()
  await expect(panel.getByRole('status').filter({ hasText: 'Сохранено сотрудников: 3' })).toBeVisible()
  await panel.getByRole('textbox', { name: 'Табельный номер — Почасовой Иван', exact: true }).fill(secondNumber)
  await panel.getByRole('button', { name: 'Сохранить изменения (1)', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('уже занят')
  await panel.getByRole('button', { name: 'Отменить изменения', exact: true }).click()
  const rows = await world.ok<{ id: number; staff_number: string; staff_numbers: string[]; hourly: boolean }[]>('GET', '/timesheet/employees/settings')
  expect(rows.find(employee => employee.id === world.users.worker.id)).toMatchObject({ staff_number: firstNumber, staff_numbers: [firstNumber, additionalNumber], hourly: true })
  await panel.getByPlaceholder('Поиск по ФИО, должности или табельному номеру').fill('Отпусков')
  await panel.getByRole('checkbox', { name: 'Выбрать всех показанных сотрудников', exact: true }).check()
  await panel.getByRole('button', { name: 'Отключить почасовой учёт', exact: true }).click()
  await panel.getByRole('button', { name: 'Сохранить изменения (1)', exact: true }).click()
  await expect(panel.getByRole('status').filter({ hasText: 'Сохранено сотрудников: 1' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, 'mgr')
  await page.getByRole('button', { name: 'Явка всем с обычным учётом', exact: true }).click()
  const firstRow = `Почасовой Иван · ${firstNumber}`
  const hours = page.getByRole('spinbutton', { name: `Часы за ${today} — ${firstRow}`, exact: true })
  await expect(hours).toHaveCount(0)
  await page.getByRole('button', { name: `Указать часы — ${firstRow}`, exact: true }).click()
  await expect(hours).toBeFocused()
  const managerMark = page.getByRole('combobox', { name: `Отметка за ${today} — Табельников Антон`, exact: true })
  await chooseOption(managerMark, 'Указать часы работы')
  await expect(page.getByRole('spinbutton', { name: `Часы за ${today} — Табельников Антон`, exact: true })).toBeFocused()
  await chooseOption(managerMark, /^НН — Неявки/)
  await chooseOption(page.getByRole('combobox', { name: `Отметка за ${today} — Почасовой Иван · ${additionalNumber}`, exact: true }), /^НН — Неявки/)
  await page.getByRole('button', { name: 'Отправить на проверку', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Заполните часы явки')
  await hours.fill('8')
  await page.getByRole('spinbutton', { name: `Минуты за ${today} — ${firstRow}`, exact: true }).fill('5')
  await expect(page.getByRole('row').filter({ hasText: firstNumber })).toContainText('8:05')
  const submitted = page.waitForResponse(response => response.url().endsWith(`/timesheet/${sheet.id}/days/${today}/submit`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Отправить на проверку', exact: true }).click()
  expect((await submitted).status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Отправить на проверку', exact: true })).toHaveCount(0)
  for (const format of ['Excel', 'PDF']) {
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: format, exact: true }).click()
    const file = await downloaded
    expect(file.suggestedFilename()).toMatch(format === 'Excel' ? /\.xlsx$/ : /\.pdf$/)
    expect(await file.failure()).toBeNull()
    const stream = await file.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const bytes = Buffer.concat(chunks)
    if (format === 'Excel') {
      const book = new Workbook()
      await book.xlsx.load(bytes)
      const exported = book.worksheets[0].getRows(6, 4) ?? []
      expect(exported.some(row => row.getCell(1).text.endsWith(firstNumber) && row.values.includes('8:05'))).toBe(true)
      expect(exported.some(row => row.getCell(1).text.endsWith(additionalNumber) && row.values.includes('НН'))).toBe(true)
    } else {
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
      expect(bytes.toString('latin1')).toContain('/ToUnicode')
    }
  }
})

test('UC-03: HR импортирует только известных сотрудников; новые версии сохраняют историю и показываются в журнале', async ({ page, scenario }) => {
  const { world, sheet, open } = scenario
  const staffNumber = `001-${world.ns}`
  const book = new Workbook()
  const tab = book.addWorksheet('0504421')
  tab.getCell('T3').value = '24'; tab.getCell('AN6').value = '16.01.2020'; tab.getCell('AN9').value = 0
  tab.getCell('O6').value = 'за период с 1 по 15 января 2020 г.'
  tab.getCell('C15').value = 'Неизвестный Сотрудник'; tab.getCell('D15').value = staffNumber
  for (const column of ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V']) {
    tab.getCell(`${column}15`).value = 7.5; tab.getCell(`${column}16`).value = 'Я'
  }
  const upload = async () => ({ name: '0504421.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await book.xlsx.writeBuffer()) })
  await open(page, 'hr')
  await page.getByLabel('Импорт формы 0504421', { exact: true }).setInputFiles(await upload())
  await expect(page.getByRole('alert')).toContainText(`Не найдены работники учреждения с табельными номерами: ${staffNumber}`)
  await world.ok('PUT', '/timesheet/employees/settings', [{ employee_id: world.users.worker.id, hourly: true }])
  tab.getCell('C15').value = 'Почасовой Иван'
  await page.getByLabel('Импорт формы 0504421', { exact: true }).setInputFiles(await upload())
  await expect(page.getByText('Присвоено табельных номеров: 1', { exact: true })).toBeVisible()
  const staff = await world.ok<{ id: number; staff_number: string; hourly: boolean }[]>('GET', '/timesheet/employees/settings')
  expect(staff.find(item => item.id === world.users.worker.id)).toMatchObject({ staff_number: staffNumber, hourly: true })
  await expect(page.getByRole('combobox', { name: 'Год', exact: true })).toHaveText('2020')
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 390, height: 844 })
  const month = page.getByRole('combobox', { name: 'Месяц', exact: true })
  await month.evaluate(element => element.scrollIntoView({ block: 'end' }))
  await month.click()
  await expect(page.getByRole('listbox', { name: 'Месяц', exact: true })).toBeInViewport({ ratio: 0.99 })
  await month.press('Escape')
  if (viewport) await page.setViewportSize(viewport)
  const version = page.getByRole('combobox', { name: 'Версия табеля', exact: true })
  await expect(version).toContainText('Версия 1 · № 24 ·')
  const listPath = `/timesheet?departmentId=${world.departments.dept}&year=2020&month=1`
  const [imported] = await world.ok<{ id: number }[]>('GET', listPath)
  expect(imported.id).not.toBe(sheet.id)
  await page.getByText('Создать версию табеля', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Номер новой версии', exact: true }).fill('24-К')
  await page.getByRole('button', { name: 'Создать версию', exact: true }).click()
  await expect(version).toContainText('Версия 2 · № 24-К ·')
  const [created] = await world.ok<{ id: number }[]>('GET', listPath)
  expect(created.id).not.toBe(imported.id)
  await page.getByRole('tab', { name: 'Журнал', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Журнал табеля', exact: true })).toBeVisible()
  await expect(page.getByText(/Новая версия/).first()).toBeVisible()
  await chooseOption(version, /^Версия 1 · № 24 ·/)
  await expect(page.getByText('0504421.xlsx', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Табель', exact: true }).click()
  await expect(version).toContainText('Версия 1 · № 24 ·')
  const original = await world.ok<{ days: { status: string }[] }>('GET', `/timesheet/${imported.id}`)
  expect(original.days.every(day => day.status === 'submitted')).toBe(true)
  const correction = await world.ok<{ days: { status: string }[] }>('GET', `/timesheet/${created.id}`)
  expect(correction.days.every(day => day.status === 'returned')).toBe(true)
  await expect(page.getByRole('button', { name: 'Руководители табеля', exact: true })).toHaveCount(0)
})

test('UC-04: сотрудник не видит табель без назначения; замещение даёт временный доступ и отзывается при отмене отпуска', async ({ page, scenario }) => {
  const { world, today, sheet, open } = scenario
  expect((await world.call('GET', `/timesheet/${sheet.id}`, undefined, world.users.worker.token)).status).toBe(403)
  await world.ok('PUT', `/timesheet/departments/${world.departments.dept}/managers`, { user_ids: [world.users.worker.id] })
  await open(page, 'worker')
  await expect(page.getByRole('button', { name: 'Отправить на проверку', exact: true })).toBeVisible()
  await world.ok('PUT', `/timesheet/departments/${world.departments.dept}/managers`, { user_ids: [] })
  expect((await world.call('GET', `/timesheet/${sheet.id}`, undefined, world.users.worker.token)).status).toBe(403)
  const vacation = await world.createRequest('mgr', today, today, { substitute_ids: [world.users.worker.id] })
  expect((await world.call('GET', `/timesheet/${sheet.id}`, undefined, world.users.worker.token)).status).toBe(403)
  await world.approve(vacation.id)
  await open(page, 'worker')
  await expect(page.getByRole('button', { name: 'Отправить на проверку', exact: true })).toBeVisible()
  await world.ok('POST', `/vacation/requests/${vacation.id}/cancel`, {})
  expect((await world.call('GET', `/timesheet/${sheet.id}`, undefined, world.users.worker.token)).status).toBe(403)
  const response = await world.api.get(`${API}/timesheet/${sheet.id}/audit`, { headers: world.headers(world.users.worker.token) })
  expect(response.status()).toBe(403)
})
