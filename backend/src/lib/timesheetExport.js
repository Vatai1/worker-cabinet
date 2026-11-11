import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { getTimesheetData, timesheetDates } from './timesheetData.js'
import { VACATION_TIMESHEET_CODES } from './vacationTypes.js'

const PDF_FONT = fileURLToPath(new URL('../assets/fonts/LiberationSans-Regular.ttf', import.meta.url))
const PERIOD_FORMAT = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const INK = '172B46'
const MARK_COLORS = {
  'Я': { background: 'E2F3EC', text: '145744' },
  'Б': { background: 'FFF1D8', text: '794709' },
  'К': { background: 'EEE8F8', text: '51337E' },
  'В': { background: 'EBEFF5', text: '485872' },
}
const VACATION_COLOR = { background: 'DFEBFA', text: '1D4B82' }

export async function getTimesheetExportData(db, timesheet, includeTest) {
  const { entries, employees, nonWorkingDays } = await getTimesheetData(timesheet, includeTest, db)
  const dates = timesheetDates(timesheet)
  const marks = new Map(entries.map(e => [`${e.employee_id}:${e.date}`, e.code]))
  return {
    filename: `${timesheet.year}-${timesheet.month}`,
    department: timesheet.department_name,
    period: PERIOD_FORMAT.format(new Date(Date.UTC(timesheet.year, timesheet.month - 1, 1))),
    dates,
    nonWorkingDays: new Set(nonWorkingDays),
    employees: employees.map(e => ({
      name: [e.last_name, e.first_name, e.middle_name].filter(Boolean).join(' '),
      marks: dates.map(date => marks.get(`${e.id}:${date}`) ?? ''),
    })),
  }
}

const excelColor = rgb => ({ argb: `FF${rgb}` })
const excelFill = rgb => ({ type: 'pattern', pattern: 'solid', fgColor: excelColor(rgb) })

export function createTimesheetWorkbook({ department, period, dates, nonWorkingDays, employees }) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Табель', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '4:5',
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
    },
  })
  sheet.columns = [{ width: 42 }, ...dates.map(() => ({ width: 4.5 }))]
  sheet.properties.defaultRowHeight = 21

  const title = sheet.addRow(['Табель посещаемости'])
  title.font = { name: 'Arial', size: 16, bold: true, color: excelColor(INK) }
  title.height = 28
  const subtitle = sheet.addRow([department, period])
  subtitle.font = { name: 'Arial', size: 10, color: excelColor('485872') }
  subtitle.getCell(1).alignment = { vertical: 'middle', wrapText: true }
  subtitle.height = Math.max(21, 13 * Math.ceil(department.length / 40) + 5)
  sheet.mergeCells(2, 2, 2, 8)
  sheet.getCell('B2').alignment = { vertical: 'middle', horizontal: 'left' }
  sheet.addRow([]).height = 8

  const dayRow = sheet.addRow(['Работник', ...dates.map(date => Number(date.slice(-2)))])
  const weekdayRow = sheet.addRow(['', ...dates.map(date => WEEKDAYS[new Date(date).getUTCDay()])])
  sheet.mergeCells(dayRow.number, 1, weekdayRow.number, 1)
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: weekdayRow.number, showGridLines: false }]
  dayRow.height = 22
  weekdayRow.height = 18
  for (const row of [dayRow, weekdayRow]) {
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      cell.font = { name: 'Arial', size: row === dayRow ? 10 : 9, bold: row === dayRow, color: excelColor('FFFFFF') }
      cell.alignment = { vertical: 'middle', horizontal: index === 1 ? 'left' : 'center', indent: index === 1 ? 1 : 0 }
      cell.fill = excelFill(nonWorkingDays.has(dates[index - 2]) ? '465976' : INK)
    })
  }

  employees.forEach(({ name, marks }, index) => {
    const row = sheet.addRow([name, ...marks])
    row.height = Math.max(21, 13 * Math.ceil(name.length / 40) + 5)
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const mark = marks[column - 2]
      const color = MARK_COLORS[mark] ?? (VACATION_TIMESHEET_CODES.includes(mark) ? VACATION_COLOR : undefined)
      const background = nonWorkingDays.has(dates[column - 2]) ? 'F0F3F7' : index % 2 ? 'F7F9FC' : 'FFFFFF'
      cell.fill = excelFill(color?.background ?? background)
      cell.font = { name: 'Arial', size: 10, color: excelColor(color?.text ?? INK), bold: Boolean(color) }
      cell.alignment = column === 1
        ? { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
        : { vertical: 'middle', horizontal: 'center' }
    })
  })

  sheet.addRow([]).height = 8
  const legend = sheet.addRow(['Я — явка   Б — больничный   К — командировка   В — нерабочий день   ОТ — основной отпуск'])
  sheet.mergeCells(legend.number, 1, legend.number, dates.length + 1)
  legend.font = { name: 'Arial', size: 9, color: excelColor('485872') }
  legend.alignment = { vertical: 'middle', horizontal: 'left' }
  return workbook
}

export function writeTimesheetPdf(stream, { department, period, dates, employees }) {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', font: PDF_FONT })
  doc.pipe(stream)
  const left = doc.page.margins.left
  const tableWidth = doc.page.width - left - doc.page.margins.right
  const nameWidth = 174
  const dayWidth = (tableWidth - nameWidth) / dates.length
  const nameOptions = { width: nameWidth - 12, lineGap: 2 }

  function drawHeader() {
    doc.fillColor(`#${INK}`).fontSize(16).text('Табель учёта рабочего времени')
    doc.fontSize(10).text(`${department}, ${period}`)
    doc.moveDown(0.8)
    const y = doc.y
    doc.rect(left, y, tableWidth, 22).fill(`#${INK}`)
    doc.fillColor('#FFFFFF').fontSize(8)
    doc.text('Работник', left + 6, y + 6, nameOptions)
    dates.forEach((date, index) => {
      doc.text(String(Number(date.slice(-2))), left + nameWidth + index * dayWidth, y + 6, { width: dayWidth, align: 'center' })
    })
    return y + 22
  }

  let y = drawHeader()
  employees.forEach(({ name, marks }, index) => {
    doc.fontSize(8)
    const rowHeight = Math.max(18, doc.heightOfString(name, nameOptions) + 8)
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = drawHeader()
    }
    if (index % 2) doc.rect(left, y, tableWidth, rowHeight).fill('#F0F3F7')
    doc.fillColor(`#${INK}`).text(name, left + 6, y + 4, nameOptions)
    marks.forEach((mark, day) => {
      if (mark) doc.text(mark, left + nameWidth + day * dayWidth, y + 4, { width: dayWidth, align: 'center' })
    })
    y += rowHeight
  })
  doc.end()
}
