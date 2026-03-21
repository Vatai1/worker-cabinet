import { query } from '../config/database.js'
import { uploadToS3, deleteFromS3, getS3FileUrl } from '../config/s3.js'
import https from 'https'
import http from 'http'

export async function uploadTemplate(file, { name, description, category }, userId) {
  const safeName = file.originalname.replace(/\s+/g, '_')
  const fileKey = `templates/${Date.now()}-${safeName}`
  await uploadToS3(file, fileKey)
  const result = await query(
    `INSERT INTO document_templates (name, description, category, file_key, mime_type, size, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, description || null, category, fileKey, file.mimetype, file.size, userId]
  )
  return result.rows[0]
}

export async function deleteTemplate(id) {
  const tmpl = await query('SELECT file_key FROM document_templates WHERE id = $1', [id])
  if (!tmpl.rows.length) throw new Error('Шаблон не найден')
  await deleteFromS3(tmpl.rows[0].file_key)
  await query('DELETE FROM document_templates WHERE id = $1', [id])
}

export function getTemplateUrl(fileKey) {
  return getS3FileUrl(fileKey)
}

export async function handleOnlyOfficeCallback(id, body) {
  if (body.status !== 2) return
  const tmpl = await query('SELECT file_key FROM document_templates WHERE id = $1', [id])
  if (!tmpl.rows.length) throw new Error('Шаблон не найден')
  const fileBuffer = await downloadUrl(body.url)
  const fakeFile = {
    buffer: fileBuffer,
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  await uploadToS3(fakeFile, tmpl.rows[0].file_key)
}

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadUrl(res.headers.location))
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}
