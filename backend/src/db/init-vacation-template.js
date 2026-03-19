import { S3Client, PutObjectCommand, HeadObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import PizZip from 'pizzip'
import dotenv from 'dotenv'

dotenv.config()

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
const templateKey = 'templateDocuments/vacation_statement.docx'

async function ensureBucketExists() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }))
    console.log('✓ Bucket exists:', bucketName)
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log('Creating bucket:', bucketName)
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }))
      console.log('✓ Bucket created:', bucketName)
    } else {
      throw error
    }
  }
}

function createMinimalDocxTemplate() {
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

async function createTemplate() {
  try {
    await ensureBucketExists()

    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: templateKey
      }))
      console.log('✓ Template already exists:', templateKey)
      return
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound') {
        throw error
      }
    }

    console.log('Creating vacation statement template...')
    const buffer = createMinimalDocxTemplate()

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: templateKey,
      Body: buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }))

    console.log('✓ Template created:', templateKey)
  } catch (error) {
    console.error('❌ Error creating template:', error)
    throw error
  }
}

createTemplate()
  .then(() => {
    console.log('✅ Vacation template setup completed')
    process.exit(0)
  })
  .catch(() => {
    console.error('❌ Failed to setup vacation template')
    process.exit(1)
  })
