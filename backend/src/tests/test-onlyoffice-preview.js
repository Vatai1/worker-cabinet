#!/usr/bin/env node

import fetch from 'node-fetch'

const API_BASE = 'http://localhost:5001/api'

async function login() {
  console.log('🔐 Logging in...')
  
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'docs-test@example.com',
      password: 'TestPassword123!'
    })
  })
  
  if (response.ok) {
    const data = await response.json()
    console.log('✅ Login successful')
    return data.token
  }
  return null
}

async function testPreviewToken(token, documentId, projectId) {
  console.log(`\n🔑 Getting preview token for document ${documentId}...`)
  
  const response = await fetch(`${API_BASE}/projects/${projectId}/documents/${documentId}/preview-token`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  
  if (response.ok) {
    const data = await response.json()
    console.log('✅ Preview token generated:', data.token.substring(0, 20) + '...')
    return data.token
  }
  
  console.log('❌ Failed to get preview token')
  return null
}

async function testPublicUrl(token, documentId, projectId) {
  console.log('\n🔗 Testing public URL...')
  
  const previewToken = await testPreviewToken(token, documentId, projectId)
  if (!previewToken) return
  
  const publicUrl = `${API_BASE}/projects/${projectId}/documents/${documentId}/public/${previewToken}`
  console.log('Public URL:', publicUrl)
  
  const response = await fetch(publicUrl)
  
  console.log('Status:', response.status)
  console.log('Content-Type:', response.headers.get('content-type'))
  console.log('Content-Length:', response.headers.get('content-length'))
  
  if (response.ok) {
    console.log('✅ Public URL works!')
  } else {
    console.log('❌ Public URL failed')
  }
}

async function main() {
  const token = await login()
  if (!token) {
    console.log('❌ Login failed')
    return
  }
  
  await testPublicUrl(token, 14, 2)
}

main()
