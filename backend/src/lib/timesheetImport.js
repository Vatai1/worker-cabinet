import ExcelJS from 'exceljs'
import PizZip from 'pizzip'
import { ConflictError, ValidationError } from '../middleware/errors.js'
import { MINUTE_CODES, TIMESHEET_CODES } from './timesheetCodes.js'
import { timesheetDates } from './timesheetData.js'

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const COLUMNS = ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AO']
const CODES = new Set(TIMESHEET_CODES.map(item => item.code))

function normalizeEmployeeText(value) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU').replace(/ё/gu, 'е')
}

export async function resolveTimesheetImportEmployees(db, employees, { orgId, departmentId, includeTest }) {
  const { rows: roster } = await db.query(
    `SELECT u.id, CONCAT_WS(' ', u.last_name, u.first_name, u.middle_name) AS name, u.position,
            settings.staff_number, COALESCE(settings.hourly, false) AS hourly, d.id AS department_id
     FROM user_organizations uo JOIN users u ON u.id = uo.user_id
     LEFT JOIN timesheet_employee_settings settings ON settings.user_id = u.id AND settings.organization_id = uo.org_id
     LEFT JOIN departments d ON d.id = COALESCE(uo.department_id, u.department_id)
       AND d.organization_id = uo.org_id AND ($2 OR NOT d.is_test)
     WHERE uo.org_id = $1 AND uo.is_active AND u.status <> 'inactive' AND ($2 OR NOT u.is_test)
       AND ($3::int IS NULL OR d.id = $3)`,
    [orgId, includeTest, departmentId]
  )
  const byNumber = new Map(roster.filter(employee => employee.staff_number).map(employee => [employee.staff_number, employee]))
  const byName = Map.groupBy(roster, employee => normalizeEmployeeText(employee.name))
  const unmatchedNumbers = employees.filter(employee => !byNumber.has(employee.staffNumber)).map(employee => employee.staffNumber)
  if (unmatchedNumbers.length) {
    const { rows: [used] } = await db.query(
      'SELECT staff_number FROM timesheet_employee_settings WHERE organization_id = $1 AND staff_number = ANY($2::text[]) LIMIT 1',
      [orgId, unmatchedNumbers]
    )
    if (used) throw new ConflictError(`Табельный номер «${used.staff_number}» уже занят в учреждении`)
  }

  const matches = new Map()
  const assignments = []
  const unknown = []
  const employeeIds = new Set()
  for (const { staffNumber, name, position } of employees) {
    const sameName = byName.get(normalizeEmployeeText(name)) ?? []
    const numbered = byNumber.get(staffNumber)
    if (numbered && sameName.length && !sameName.some(employee => employee.id === numbered.id)) {
      throw new ConflictError(`Табельный номер «${staffNumber}» закреплён за другим сотрудником. Проверьте ФИО «${name}»`)
    }
    const job = normalizeEmployeeText(position)
    const samePosition = !numbered && sameName.length > 1 && job
      ? sameName.filter(employee => normalizeEmployeeText(employee.position ?? '') === job)
      : []
    const named = samePosition.length ? samePosition : sameName
    if (!numbered && named.length > 1) {
      throw new ConflictError(`Найдено несколько сотрудников с ФИО «${name}». Проверьте должность в файле или назначьте номер «${staffNumber}» на вкладке «Сотрудники»`)
    }
    const employee = numbered ?? named[0]
    if (!employee) {
      unknown.push(staffNumber)
      continue
    }
    if (employeeIds.has(employee.id)) throw new ConflictError(`Сотрудник «${name}» указан в файле с несколькими табельными номерами`)
    if (!numbered) {
      if (employee.staff_number) throw new ConflictError(`У сотрудника «${name}» уже указан другой табельный номер. Проверьте номер «${staffNumber}» в файле`)
      assignments.push({ employee_id: employee.id, staff_number: staffNumber })
    }
    matches.set(staffNumber, employee)
    employeeIds.add(employee.id)
  }
  if (unknown.length) throw new ValidationError(`Не найдены работники ${departmentId ? 'отдела' : 'учреждения'} с табельными номерами: ${unknown.join(', ')}`)
  const withoutDepartment = [...matches].filter(([, employee]) => !employee.department_id).map(([staffNumber]) => staffNumber)
  if (withoutDepartment.length) throw new ValidationError(`Не указан отдел для работников с табельными номерами: ${withoutDepartment.join(', ')}`)
  return { matches, assignments }
}

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
    const position = text(`F${row}`)
    const numberCell = sheet.getCell(`D${row}`)
    const staffNumber = Number.isSafeInteger(numberCell.value) && /^0+$/.test(numberCell.numFmt ?? '')
      ? String(numberCell.value).padStart(numberCell.numFmt.length, '0')
      : text(`D${row}`)
    if (!name && !staffNumber) continue
    if (!staffNumber) {
      if (name && position) throw new ValidationError(`Нет табельного номера в строке ${row}`)
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
    employees.push({ staffNumber, name, position, entries })
    row++
  }
  if (!employees.length) throw new ValidationError('В файле нет работников с табельными номерами (колонка D, начиная со строки 15)')
  return { ...metadata, employees }
}
