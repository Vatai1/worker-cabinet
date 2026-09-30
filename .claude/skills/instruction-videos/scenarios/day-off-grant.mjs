import { startRecording } from '../lib.mjs'

const r = await startRecording('day-off-grant', 'petrov@example.com')
const { page, pause, caption, moveTo, clickOn, typeInto, reveal, open } = r

await open('/vacation')
await page.waitForSelector('[data-testid="month-card"]')
await caption('Как начислить отгулы подчинённым', 'Инструкция для руководителя подразделения')
await pause(3400)

await caption('Шаг 1. Откройте вкладку «Отгулы»', 'Она есть на странице «Отпуск» у руководителей, HR и администраторов')
await clickOn(page.getByRole('button', { name: 'Отгулы', exact: true }))
const form = page.getByTestId('adjust-form')
await form.waitFor()
await pause(2600)

await caption('Шаг 2. Найдите сотрудника и отметьте его', 'Руководителю доступны только его подчинённые; можно выбрать сразу нескольких')
await typeInto(form.getByPlaceholder('Найти сотрудника…'), 'Иванов Иван')
await pause(500)
await clickOn(form.locator('label', { hasText: 'Иванов Иван Иванович' }).first())
await pause(1600)

await caption('Шаг 3. Укажите количество отгулов', 'Отрицательное число списывает отгулы')
const amount = form.getByLabel('Количество отгулов')
await clickOn(amount)
await amount.fill('')
await amount.pressSequentially('1', { delay: 150 })
await pause(2000)

await caption('Шаг 4. Напишите, за что начисляете', 'Комментарий увидит сотрудник в своей карточке «Отгулы»')
await typeInto(form.getByLabel('Комментарий к начислению'), 'За работу в выходной 27.09')
await pause(1500)

await caption('Шаг 5. Нажмите «Начислить»')
await clickOn(form.getByRole('button', { name: 'Начислить (1)' }))
await page.getByText(/Отгулы начислены/).waitFor({ timeout: 10000 })
await pause(1500)

const row = page.getByTestId('adjusted-employees').getByText('Иванов Иван Иванович').first()
await reveal(row)
await caption('Остатки — в таблице «Сотрудники с отгулами»', 'Доступно, на согласовании, использовано и сколько начислено всего')
await moveTo(row)
await pause(3800)

const entry = page.getByTestId('adjust-history').getByText('За работу в выходной 27.09').first()
await reveal(entry)
await caption('Все начисления — в «Истории отгулов»', 'С фильтрами по сотруднику, отделу, автору и периоду')
await moveTo(entry)
await pause(3800)

await caption('Готово! Отгул начислен', 'Сотрудник сможет взять его в любое время — согласование как у отпуска')
await pause(4000)

console.log(JSON.stringify(await r.finish()))
