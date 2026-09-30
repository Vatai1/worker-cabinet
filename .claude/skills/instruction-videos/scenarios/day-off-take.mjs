import { startRecording } from '../lib.mjs'

const DATE = process.env.DAY_OFF_DATE || '2026-10-09'

const r = await startRecording('day-off-take', 'ivanov@example.com')
const { page, pause, caption, moveTo, clickOn, typeInto, reveal, open } = r

await open('/vacation')
await page.waitForSelector('[data-testid="month-card"]')
await caption('Как взять отгул', 'Инструкция для сотрудника')
await pause(3400)

const card = page.getByTestId('day-offs-card')
await reveal(card, 'start')
await caption('Шаг 1. Найдите карточку «Отгулы» на вкладке «Отпуск»', 'Здесь видно, сколько отгулов доступно, сколько на согласовании и сколько использовано')
await moveTo(card.getByTestId('day-offs-available'))
await pause(3600)

await caption('Под цифрами — кто и за что начислил отгулы')
await moveTo(card.getByText('За работу в выходной 27.09').first())
await pause(3000)

await caption('Отгулы — не отпуск', 'Дни отпуска не расходуются, отгул можно взять даже когда подача заявок на отпуск закрыта')
await moveTo(card.getByLabel(/Отгулы — не отпуск/))
await pause(4200)

await caption('Шаг 2. Нажмите «Взять отгул»', 'Или выделите даты в календаре и выберите тип «Отгул»')
await clickOn(card.getByRole('button', { name: 'Взять отгул' }))
await page.getByRole('heading', { name: 'Оформить отгул' }).waitFor()
await pause(1500)

await caption('Шаг 3. Выберите дату отгула', 'Отгулы считаются в рабочих днях — выходные и праздники не списываются')
const start = page.locator('#startDate')
const end = page.locator('#endDate')
await clickOn(start)
await start.fill(DATE)
await pause(800)
await clickOn(end)
await end.fill(DATE)
await pause(1200)
await moveTo(page.getByText(/Выход на работу/))
await pause(2600)

await caption('Шаг 4. При необходимости добавьте комментарий и замещающего')
await typeInto(page.locator('#comment'), 'Семейные обстоятельства')
await pause(1500)

await caption('Шаг 5. Нажмите «Создать заявку»', 'Отгул уйдёт на согласование вашему руководителю — так же, как отпуск')
await clickOn(page.getByRole('button', { name: 'Создать заявку' }))
await page.getByText('Отгул отправлен на согласование').waitFor({ timeout: 10000 })
await pause(1500)

await reveal(card, 'start')
await caption('Готово! Отгул на согласовании', 'Когда руководитель согласует его, он появится в календаре')
await moveTo(card.getByText('На согласовании'))
await pause(4200)

console.log(JSON.stringify(await r.finish()))
