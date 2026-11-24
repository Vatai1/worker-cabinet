import { it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import PizZip from 'pizzip'
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

it('форма 0504421 принимает обозначения из нового классификатора и часы за работу в выходной', async () => {
  const { workbook, sheet } = await importFixture()
  for (const [column, code] of [['H', 'О'], ['I', 'ОУ'], ['J', 'Г'], ['K', 'Р'], ['L', 'Б']]) {
    sheet.getCell(`${column}15`).value = null
    sheet.getCell(`${column}16`).value = code
  }
  sheet.getCell('M16').value = 'РП'
  const { employees: [{ entries }] } = await parseTimesheetImport(await workbook.xlsx.writeBuffer())
  assert.deepEqual(entries.slice(0, 6).map(({ code, minutes }) => [code, minutes]), [
    ['О', null], ['ОУ', null], ['Г', null], ['Р', null], ['Б', null], ['РП', 450],
  ])
})

it('форма 0504421 с рисунками, повторной шапкой и объединёнными строками сохраняет номера и пустые отметки', async () => {
  const { workbook, sheet } = await importFixture()
  sheet.getCell('D15').value = 1
  sheet.getCell('D15').numFmt = '000'
  sheet.mergeCells('C15:C16')
  sheet.mergeCells('D15:D16')
  sheet.getCell('A17').value = 'Фамилия, имя, отчество'
  sheet.getCell('D17').value = 'Учетный номер'
  sheet.getCell('D19').value = '4'
  sheet.getCell('C20').value = 'Второй работник'
  sheet.getCell('D20').value = '002'
  sheet.getCell('H20').value = '6,12'
  sheet.getCell('H21').value = 'Я'
  sheet.getCell('A22').value = 'Ответственный'
  sheet.getCell('D22').value = 'Подпись'

  const zip = new PizZip(await workbook.xlsx.writeBuffer())
  const sheetPath = 'xl/worksheets/sheet1.xml'
  zip.file(sheetPath, zip.file(sheetPath).asText().replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>'))
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>')
  const input = zip.generate({ type: 'nodebuffer' })
  const { employees } = await parseTimesheetImport(input)
  assert.deepEqual(employees.map(e => e.staffNumber), ['001', '002'])
  assert.deepEqual(employees[1].entries.slice(0, 2), [
    { date: '2026-01-01', code: 'Я', minutes: 367 },
    { date: '2026-01-02', code: null, minutes: null },
  ])
})
