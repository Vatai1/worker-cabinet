#!/usr/bin/env node

import crypto from 'crypto'

const ONLYOFFICE_SECRET = 'your-secret-key-change-this'

function generateOnlyOfficeToken(payload) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  }

  const now = Math.floor(Date.now() / 1000)
  const tokenPayload = {
    ...payload,
    exp: now + 3600 // 1 hour expiration
  }

  const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadBase64 = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')
  
  const data = `${headerBase64}.${payloadBase64}`
  const signature = crypto
    .createHmac('sha256', ONLYOFFICE_SECRET)
    .update(data)
    .digest('base64url')

  return `${headerBase64}.${payloadBase64}.${signature}`
}

// Test token generation
const testPayload = {
  document: {
    fileType: 'docx',
    key: 'test-key',
    title: 'Test.docx',
    url: 'http://localhost:5000/api/projects/2/documents/14/public/test-token',
    permissions: {
      edit: false,
      download: true,
      print: true,
    },
  },
  editorConfig: {
    lang: 'ru',
    mode: 'view',
    user: {
      id: 'preview-user',
      name: 'Preview User',
    },
  },
}

const token = generateOnlyOfficeToken(testPayload)

console.log('🔑 Test Token Generation')
console.log('='.repeat(50))
console.log('Header:', Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'))
console.log('Payload:', Buffer.from(JSON.stringify({ ...testPayload, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'))
console.log('\nFull Token:', token)
console.log('\nToken length:', token.length, 'characters')
