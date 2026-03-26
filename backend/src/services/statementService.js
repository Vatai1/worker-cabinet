import PizZip from 'pizzip'
import { getFromS3 } from '../config/s3.js'
import { query } from '../config/database.js'

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderTemplate(xmlContent, data) {
  return xmlContent.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in data ? escapeXml(data[key]) : match
  })
}

const VACATION_TYPE_NAMES = {
  annual_paid: 'Ежегодный оплачиваемый',
  unpaid: 'Без сохранения зарплаты',
  educational: 'Учебный',
  maternity: 'Декретный',
  child_care: 'По уходу за ребёнком',
  additional: 'Дополнительный',
  veteran: 'Ветеранский'
}

function getInitials(firstName, middleName) {
  const first = firstName ? firstName.charAt(0).toUpperCase() : ''
  const middle = middleName ? middleName.charAt(0).toUpperCase() : ''
  return first && middle ? `${first}.${middle}.` : first ? `${first}.` : ''
}

function formatDateRu(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function getVacationRequestData(requestId) {
  const requestResult = await query(`
    SELECT 
      vr.*,
      u.first_name,
      u.last_name,
      u.middle_name,
      u.position,
      u.department_id,
      d.name as department_name,
      dm.first_name as manager_first_name,
      dm.last_name as manager_last_name,
      dm.middle_name as manager_middle_name
    FROM vacation_requests vr
    JOIN users u ON vr.user_id = u.id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN users dm ON d.manager_id = dm.id
    WHERE vr.id = $1
  `, [requestId])

  if (requestResult.rows.length === 0) {
    throw new Error('Заявка не найдена')
  }

  return requestResult.rows[0]
}

async function getDirector() {
  const result = await query(`
    SELECT first_name, last_name, middle_name
    FROM users 
    WHERE active_director = true
    LIMIT 1
  `)
  return result.rows[0] || null
}

export async function generateVacationStatement(requestId) {
  const requestData = await getVacationRequestData(requestId)
  const director = await getDirector()

  const tmpl = await query(
    'SELECT file_key FROM document_templates WHERE purpose = $1',
    ['vacation_statement']
  )
  if (tmpl.rows.length === 0) {
    throw new Error('Шаблон заявления не установлен. Обратитесь к кадровому сотруднику')
  }
  const response = await getFromS3(tmpl.rows[0].file_key)
  const buf = await response.Body.transformToByteArray()
  const templateBuffer = Buffer.from(buf)

  console.log('[DIAG] Buffer size:', templateBuffer.length)
  const zip = new PizZip(templateBuffer)
  console.log('[DIAG] ZIP files:', Object.keys(zip.files).filter(n => n.endsWith('.xml')).join(', '))

  const rawXml = zip.file('word/document.xml')?.asText() || ''
  console.log('[DIAG] Full raw XML:\n', rawXml)

  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })

  const templateData = {
    lastName: requestData.last_name || '',
    firstName: requestData.first_name || '',
    middleName: requestData.middle_name || '',
    initials: getInitials(requestData.first_name, requestData.middle_name),
    position: requestData.position || '',
    department: requestData.department_name || '',
    managerLastName: requestData.manager_last_name || '',
    managerInitials: getInitials(requestData.manager_first_name, requestData.manager_middle_name),
    directorLastName: director?.last_name || '',
    directorInitials: getInitials(director?.first_name, director?.middle_name),
    vacationType: VACATION_TYPE_NAMES[requestData.vacation_type] || requestData.vacation_type,
    startDate: formatDateRu(requestData.start_date),
    endDate: formatDateRu(requestData.end_date),
    duration: requestData.duration?.toString() || '',
    today: formatDateRu(new Date()),
  }

  doc.render(templateData)

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}
