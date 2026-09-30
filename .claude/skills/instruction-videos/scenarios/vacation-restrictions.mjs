import { startRecording } from '../lib.mjs'

const r = await startRecording('vacation-restrictions', 'petrov@example.com')
const { page, pause, caption, moveTo, clickOn, typeInto, reveal, open } = r

await open('/vacation')
await page.waitForLoadState('networkidle')
await caption('Пересечения отпусков', 'Инструкция для руководителя: кто не может уходить в отпуск одновременно')
await pause(3400)

await caption('Шаг 1. Откройте вкладку «Пересечения»')
await clickOn(page.getByRole('button', { name: 'Пересечения', exact: true }))
await page.getByText('Новое ограничение').waitFor()
await page.waitForLoadState('networkidle')
await pause(1500)
await caption('Слева — новое ограничение, справа — уже действующие', 'Ограничение задаёт, сколько человек из группы могут отдыхать одновременно')
await pause(3800)

await caption('Шаг 2. Дайте ограничению название', 'Например, по направлению работы')
await typeInto(page.getByPlaceholder('Напр. для обеспечения непрерывной работы…'), 'Frontend: непрерывная поддержка')
await pause(1200)

await caption('Шаг 3. Найдите сотрудников — например, по тегу', 'Тег только фильтрует список ваших сотрудников')
await clickOn(page.getByRole('button', { name: 'Все теги' }))
await pause(900)
await clickOn(page.locator('label', { hasText: /^TypeScript$/ }).first())
await pause(900)
await clickOn(page.getByText('Работники', { exact: true }).first())
await pause(1500)

const rows = page.locator('div.max-h-60 button')
await caption('Шаг 4. Отметьте сотрудников, которые не должны отдыхать одновременно', 'Можно выбрать от одного человека')
await clickOn(rows.nth(0))
await pause(800)
await clickOn(rows.nth(1))
await pause(1500)

await caption('Шаг 5. Укажите, сколько человек из группы могут быть в отпуске одновременно')
await moveTo(page.locator('input[type="number"]').first())
await pause(3000)

await caption('Шаг 6. Нажмите «Создать ограничение»')
await clickOn(page.getByRole('button', { name: 'Создать ограничение' }))
await page.getByText('Ограничение создано').waitFor({ timeout: 10000 })
await page.waitForLoadState('networkidle')
await pause(1500)

const mine = page.getByText('Frontend: непрерывная поддержка').first()
await reveal(mine)
await caption('Ограничение появилось в списке, у каждого подписан владелец', 'Изменить или удалить ограничение может только его владелец или HR')
await moveTo(mine)
await pause(3800)
const hrRule = page.getByText('Разработка: не больше одного в отпуске').first()
await caption('Здесь же видны ограничения HR, в которых есть ваши сотрудники')
await moveTo(hrRule)
await pause(3500)

const conflicts = page.getByText(/Текущие пересечения/).first()
await reveal(conflicts, 'start')
await caption('Ниже — текущие пересечения', 'Показаны только ваши сотрудники, прошедшие отпуска не учитываются')
await moveTo(conflicts)
await pause(1200)
await moveTo(page.getByText('Морозова', { exact: false }).last())
await pause(4200)

console.log(JSON.stringify(await r.finish()))
