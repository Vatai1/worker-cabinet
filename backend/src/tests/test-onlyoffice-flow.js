#!/usr/bin/env node

import jwt from 'jsonwebtoken'
import fetch from 'node-fetch'

const API_BASE = 'http://localhost:5000/api'

async function testOnlyOfficeFlow() {
  console.log('🧪 Testing OnlyOffice flow with host.docker.internal')
  console.log('=' .repeat(60))
  
  // Step 1: Login
  console.log('\n1️⃣ Logging in...')
  const loginResponse = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'docs-test@example.com',
      password: 'TestPassword123!'
    })
  })
  
  if (!loginResponse.ok) {
    console.log('❌ Login failed')
    return
  }
  
  const { token } = await loginResponse.json()
  console.log('✅ Login successful')
  
  // Step 2: Get documents
  console.log('\n2️⃣ Getting documents...')
  const docsResponse = await fetch(`${API_BASE}/documents`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  
  if (!docsResponse.ok) {
    console.log('❌ Failed to get documents')
    return
  }
  
  const documents = await docsResponse.json()
  console.log(`✅ Got ${documents.length} documents`)
  
  // Step 3: Find DOCX document
  console.log('\n3️⃣ Finding DOCX document...')
  const doc = documents.find(d => d.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  
  if (!doc) {
    console.log('❌ No DOCX document found')
    return
  }
  
  console.log(`✅ Found DOCX document: ${doc.name}`)
  
  // Step 4: Get preview token
  console.log('\n4️⃣ Getting preview token...')
  const tokenResponse = await fetch(
    `${API_BASE}/projects/${doc.projectId}/documents/${doc.id}/preview-token`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )
  
  if (!tokenResponse.ok) {
    console.log('❌ Failed to get preview token')
    return
  }
  
  const tokenData = await tokenResponse.json()
  console.log('✅ Got preview token')
  console.log(`   Public URL: ${tokenData.publicUrl.substring(0, 80)}...`)
  
  // Step 5: Test if OnlyOffice can access the URL
  console.log('\n5️⃣ Testing if OnlyOffice can access the URL...')
  
  const { execSync } = await import('child_process')
  
  try {
    const stdout = execSync(
      `docker exec onlyoffice-documentserver curl -s -I "${tokenData.publicUrl}"`,
      { encoding: 'utf-8' }
    )
    
    if (stdout.includes('200 OK')) {
      console.log('✅ OnlyOffice CAN access the document!')
      console.log('\n' + '='.repeat(60))
      console.log('✅ ALL TESTS PASSED')
      console.log('=' .repeat(60))
    } else {
      console.log('❌ OnlyOffice CANNOT access the document')
      console.log('   Response:', stdout.substring(0, 200))
    }
  } catch (error) {
    console.log('❌ Failed to test OnlyOffice access')
    console.log('   Error:', error.message)
  }
}

testOnlyOfficeFlow()
