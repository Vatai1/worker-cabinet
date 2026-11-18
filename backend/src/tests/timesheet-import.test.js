import { it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { parseTimesheetImport } from '../lib/timesheetImport.js'

export async function importFixture() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('0504421')
  sheet.getCell('T3').value = '24'
  sheet.getCell('O6').value = 'за период с 1 по 15 января 2026 г.'
  sheet.getCell('AN6').value = '16.01.2026'
  sheet.getCell('AN9').value = 0
  sheet.getCell('C15').value = 'Иванов Иван'
  sheet.getCell('D15').value = '001'
  for (const column of ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V']) {
    sheet.getCell(`${column}15`).value = 7.5
    sheet.getCell(`${column}16`).value = 'Я'
  }
  return { workbook, sheet }
}

it('форма 0504421: читает первую половину, включая 15 число, часы в минуты, номер без потери нулей', async () => {
  const { workbook } = await importFixture()
  const parsed = await parseTimesheetImport(await workbook.xlsx.writeBuffer())
  assert.equal(parsed.period, 'half')
  assert.equal(parsed.kind, 'original')
  assert.equal(parsed.document_date, '2026-01-16')
  assert.equal(parsed.employees[0].staffNumber, '001')
  assert.equal(parsed.employees[0].entries.length, 15)
  assert.deepEqual(parsed.employees[0].entries.at(-1), { date: '2026-01-15', code: 'Я', minutes: 450 })
})

it('форма 0504421: отклоняет неизвестные коды, отрицательные часы и повторные номера', async () => {
  const { workbook, sheet } = await importFixture()
  sheet.getCell('H16').value = 'ZZ'
  await assert.rejects(parseTimesheetImport(await workbook.xlsx.writeBuffer()), /Некорректная отметка/)
  sheet.getCell('H16').value = 'Я'; sheet.getCell('H15').value = -1
  await assert.rejects(parseTimesheetImport(await workbook.xlsx.writeBuffer()), /Некорректная отметка/)
  sheet.getCell('H15').value = 8
  sheet.getCell('C17').value = 'Другой работник'; sheet.getCell('D17').value = '001'
  await assert.rejects(parseTimesheetImport(await workbook.xlsx.writeBuffer()), /повторный/)
})
