import multer from 'multer'

const MAGIC_BYTES = {
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
  'application/zip': [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
  'application/x-rar-compressed': [{ offset: 0, bytes: [0x52, 0x61, 0x72, 0x21] }],
  'application/x-7z-compressed': [{ offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf] }],
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/gif': [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
  'image/webp': [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }],
  'application/msword': [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
  'application/vnd.ms-excel': [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
}

function verifyMagicBytes(buf, mimetype) {
  const checks = MAGIC_BYTES[mimetype]
  if (!checks) return true
  return checks.every(({ offset, bytes }) =>
    bytes.every((b, i) => buf[offset + i] === b)
  )
}

const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'image/jpeg',
      'image/png',
      'image/gif',
    ]

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Недопустимый тип файла'))
    }
  },
})

export function uploadWithMagicBytes(fieldName, maxCount = 10) {
  return (req, res, next) => {
    const allFiles = []
    if (Array.isArray(req.files)) allFiles.push(...req.files)
    else if (req.files) Object.values(req.files).forEach(arr => allFiles.push(...arr))
    if (req.file) allFiles.push(req.file)
    for (const f of allFiles) {
      if (!verifyMagicBytes(f.buffer, f.mimetype)) {
        return res.status(400).json({ error: 'Содержимое файла не соответствует объявленному типу' })
      }
    }
    next()
  }
}

export { upload, verifyMagicBytes }

export const uploadAvatar = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Допустимы только изображения JPEG, PNG, WEBP'))
    }
  },
})

export const uploadTemplate = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Допустимы только .pdf и .docx файлы'))
    }
  },
})
