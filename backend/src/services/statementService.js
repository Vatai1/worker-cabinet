import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { getFromS3, uploadToS3 } from '../config/s3.js'
import { query } from '../config/database.js'
import { S3Client, HeadBucketCommand, CreateBucketCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import 'dotenv/config'

function sanitizeXmlForDocxtemplater(xmlContent) {
  let result = xmlContent
  
  let previous
  let iterations = 0
  const maxIterations = 100
  
  do {
    previous = result
    iterations++
    
    // Pattern 1: Merge any text split by XML tags between {{ and }}
    // This handles multiple splits like {{a</w:t>...<w:t>b</w:t>...<w:t>c}}
    result = result.replace(
      /\{\{([\s\S]*?)\}\}/g,
      (match, inner) => {
        // Remove all XML tags from the content between {{ and }}
        const cleaned = inner.replace(/<[^>]+>/g, '')
        return '{{' + cleaned + '}}'
      }
    )
    
    // Pattern 2: Split closing delimiter }}
    result = result.replace(/\}<\/w:t>\s*<\/w:r>\s*<w:r[^>]*>\s*<w:t[^>]*>\}/g, '}}')
    
    // Pattern 3: Split opening delimiter {{
    result = result.replace(/\{<\/w:t>\s*<\/w:r>\s*<w:r[^>]*>\s*<w:t[^>]*>\{/g, '{{')
    
    // Pattern 4: More flexible split closing
    result = result.replace(/\}<\/w:t>(?:[^<]*<[^>]+>)*[^<]*<w:t[^>]*>\}/g, '}}')
    
    // Pattern 5: More flexible split opening
    result = result.replace(/\{<\/w:t>(?:[^<]*<[^>]+>)*[^<]*<w:t[^>]*>\{/g, '{{')
    
    // Pattern 6: Fix triple braces
    result = result.replace(/\}\}\}/g, '}}')
    result = result.replace(/\{\{\{/g, '{{')
  } while (result !== previous && iterations < maxIterations)
  
  return result
}

function fixTemplateTags(zip) {
  const documentPath = 'word/document.xml'
  const documentXml = zip.file(documentPath)
  
  if (!documentXml) return zip
  
  let content = documentXml.asText()
  const originalContent = content
  
  // Debug: find all potential template tags
  const tagMatches = content.match(/\{\{[^}]*\}\}?|\{\{[^}]*/g) || []
  if (tagMatches.length > 0) {
    console.log('[Template Debug] Found potential tags:', tagMatches.slice(0, 10).join(', '))
  }
  
  content = sanitizeXmlForDocxtemplater(content)
  
  if (content !== originalContent) {
    console.log('[Template Fix] Sanitization applied to word/document.xml')
    const newTagMatches = content.match(/\{\{[^}]+\}\}/g) || []
    console.log('[Template Debug] After sanitization:', newTagMatches.join(', '))
  }
  
  zip.file(documentPath, content)
  
  return zip
}

const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin123',
  },
  forcePathStyle: true,
})

const bucketName = process.env.S3_BUCKET || 'worker-cabinet-docs'

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

async function ensureBucketExists() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }))
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }))
    } else {
      throw error
    }
  }
}

function createDefaultTemplate() {
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r><w:t>Руководителю организации</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r><w:t>{{directorLastName}} {{directorInitials}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r><w:t>от {{position}}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r><w:t>{{lastName}} {{firstName}} {{middleName}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>ЗАЯВЛЕНИЕ</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:r><w:t>Прошу предоставить мне {{vacationType}} отпуск</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>на {{duration}} календарных дней</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>с {{startDate}} по {{endDate}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:r><w:t>Дата: {{today}}</w:t></w:r>
      <w:r><w:t xml:space="preserve">                                        </w:t></w:r>
      <w:r><w:t>_________________ / {{initials}}</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="ru-RU"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`

  const zip = new PizZip()
  zip.file('[Content_Types].xml', contentTypesXml)
  zip.file('_rels/.rels', relsXml)
  zip.file('word/document.xml', documentXml)
  zip.file('word/_rels/document.xml.rels', documentRelsXml)
  zip.file('word/styles.xml', stylesXml)

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function loadTemplate() {
  const templateKey = 'templateDocuments/vacation_statement.docx'
  
  await ensureBucketExists()
  
  try {
    const response = await getFromS3(templateKey)
    const buffer = await response.Body.transformToByteArray()
    return Buffer.from(buffer)
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      const defaultTemplate = createDefaultTemplate()
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: templateKey,
        Body: defaultTemplate,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }))
      return defaultTemplate
    }
    throw error
  }
}

async function saveStatement(userId, requestId, buffer, startDate, endDate) {
  const formattedStart = startDate.replace(/-/g, '.')
  const formattedEnd = endDate.replace(/-/g, '.')
  const fileName = `${requestId}-Заявление на отпуск с ${formattedStart} по ${formattedEnd}.docx`
  const key = `documents/${userId}/vacations/${fileName}`
  
  await uploadToS3(
    { buffer, mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    key
  )
  
  return key
}

export async function generateVacationStatement(requestId) {
  const requestData = await getVacationRequestData(requestId)
  const director = await getDirector()
  const templateBuffer = await loadTemplate()

  const zip = new PizZip(templateBuffer)
  fixTemplateTags(zip)
  
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  })

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

  const buffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  })

  await saveStatement(
    requestData.user_id,
    requestId,
    buffer,
    requestData.start_date,
    requestData.end_date
  )

  return buffer
}
