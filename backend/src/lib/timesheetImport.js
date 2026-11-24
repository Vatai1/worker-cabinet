import ExcelJS from 'exceljs'
import PizZip from 'pizzip'
import { ValidationError } from '../middleware/errors.js'
import { MINUTE_CODES, TIMESHEET_CODES } from './timesheetCodes.js'
import { timesheetDates } from './timesheetData.js'

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const COLUMNS = ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AO']
const CODES = new Set(TIMESHEET_CODES.map(item => item.code))

function removeWorksheetDrawings(zip) {
  const graphics = /^(?:xl\/drawings\/|xl\/media\/)/
  for (const part of Object.values(zip.files)) {
    if (graphics.test(part.name)) {
      zip.remove(part.name)
    } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(part.name)) {
      zip.file(part.name, part.asText().replace(/<(?:\w+:)?(?:drawing|legacyDrawing|legacyDrawingHF)\b[^>]*\/\s*>/g, ''))
    } else if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(part.name)) {
      const drawingRelationship = /<(?:\w+:)?Relationship\b(?=[^>]*\bType\s*=\s*["'][^"']*\/(?:drawing|vmlDrawing)["'])[^>]*\/\s*>/g
      zip.file(part.name, part.asText().replace(drawingRelationship, ''))
    }
  }
}

export async function parseTimesheetImport(buffer) {
  const workbook = new ExcelJS.Workbook()
  let zip
  try {
    zip = new PizZip(buffer)
  } catch {
    throw new ValidationError('Не удалось прочитать XLSX-файл')
  }
  const parts = Object.values(zip.files)
  const expandedSize = parts.reduce((sum, file) => sum + (file._data?.uncompressedSize ?? 0), 0)
  if (expandedSize > 30 * 1024 * 1024 || parts.length > 500) throw new ValidationError('Распакованный XLSX-файл больше 30 МБ или содержит слишком много частей')
  try {
    removeWorksheetDrawings(zip)
    await workbook.xlsx.load(zip.generate({ type: 'nodebuffer' }))
  } catch {
    throw new ValidationError('Не удалось прочитать данные листа XLSX')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet || sheet.rowCount > 10000 || sheet.columnCount > 100) throw new ValidationError('Некорректная форма 0504421 или слишком большой файл')
  const text = address => sheet.getCell(address).text.trim().replace(/\s+/g, ' ')
  const match = text('O6').toLowerCase().match(/^за период с (\d+) по (\d+) ([а-яё]+) (\d{4}) г\.?$/u)
  if (!match) throw new ValidationError('В O6 ожидается период формы 0504421: за период с 1 по 15 ноября 2026 г.')
  const month = MONTHS.indexOf(match[3]) + 1
  const year = Number(match[4])
  const end = Number(match[2])
  if (Number(match[1]) !== 1 || !month || year < 2000 || year > 2100 || ![15, new Date(year, month, 0).getDate()].includes(end)) {
    throw new ValidationError('Поддерживается первая половина месяца или полный месяц')
  }
  const metadata = { year, month, period: end === 15 ? 'half' : 'month', kind: Number(text('AN9')) === 0 ? 'original' : 'correction', number: text('T3') }
  if (!metadata.number || metadata.number.length > 64 || !/^\d+$/.test(text('AN9'))) throw new ValidationError('Проверьте номер T3 и тип AN9 табеля')
  const rawDate = sheet.getCell('AN6').value
  const dateText = text('AN6')
  const dateParts = dateText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  metadata.document_date = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10)
    : typeof rawDate === 'number' && Number.isFinite(rawDate) && rawDate > 36525 && rawDate < 73416 ? new Date(Math.round((rawDate - 25569) * 86400000)).toISOString().slice(0, 10)
    : dateParts ? `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}` : dateText
  const date = new Date(metadata.document_date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.document_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== metadata.document_date || metadata.document_date < '2000-01-01' || metadata.document_date > '2100-12-31') {
    throw new ValidationError('В AN6 ожидается дата документа')
  }
  const employees = []
  const numbers = new Set()
  const dates = timesheetDates(metadata)
  for (let row = 15; row <= sheet.rowCount; row++) {
    const label = text(`A${row}`)
    if (/^(?:Ответственный|Исполнитель)$/iu.test(label)) break
    if (/^Фамилия, имя, отчество$/iu.test(label) || /^(?:уч[её]тный|табельный) номер$/iu.test(text(`D${row}`))) {
      row += 2
      continue
    }
    const nameCell = sheet.getCell(`C${row}`)
    if (nameCell.type === ExcelJS.ValueType.Merge) continue
    const name = text(`C${row}`)
    const numberCell = sheet.getCell(`D${row}`)
    const staffNumber = Number.isSafeInteger(numberCell.value) && /^0+$/.test(numberCell.numFmt ?? '')
      ? String(numberCell.value).padStart(numberCell.numFmt.length, '0')
      : text(`D${row}`)
    if (!name && !staffNumber) continue
    if (!staffNumber) {
      if (name && text(`F${row}`)) throw new ValidationError(`Нет табельного номера в строке ${row}`)
      continue
    }
    if (!name || staffNumber.length > 64 || numbers.has(staffNumber)) throw new ValidationError(`Некорректный или повторный табельный номер в строке ${row}`)
    numbers.add(staffNumber)
    const entries = dates.map((day, index) => {
      const code = text(`${COLUMNS[index]}${row + 1}`).toUpperCase() || null
      const value = text(`${COLUMNS[index]}${row}`)
      const hours = value ? Number(value.replace(',', '.')) : null
      const minutes = hours === null ? null : Math.round(hours * 60)
      if ((code && !CODES.has(code)) || (value && (!Number.isFinite(hours) || hours < 0 || hours > 24))) {
        throw new ValidationError(`Некорректная отметка или часы в ${COLUMNS[index]}${row}: ${staffNumber}`)
      }
      if (minutes > 0 && !MINUTE_CODES.includes(code)) throw new ValidationError(`Часы не допускаются для отметки ${code ?? 'без кода'} в строке ${row}: ${staffNumber}`)
      return { date: day, code, minutes: MINUTE_CODES.includes(code) ? minutes : null }
    })
    employees.push({ staffNumber, name, entries })
    row++
  }
  if (!employees.length) throw new ValidationError('В файле нет работников с табельными номерами (колонка D, начиная со строки 15)')
  return { ...metadata, employees }
}
