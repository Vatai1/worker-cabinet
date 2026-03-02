#!/usr/bin/env node

import fetch from 'node-fetch'

const API_BASE = 'http://localhost:5001/api'
const FRONTEND_URL = 'http://localhost:3000'

async function checkBackend() {
  console.log('🔍 Checking backend...')
  
  const response = await fetch(`${API_BASE}/health`)
  if (response.ok) {
    const data = await response.json()
    console.log('✅ Backend is running')
    console.log('   Status:', data.status)
    console.log('   Timestamp:', data.timestamp)
    return true
  }
  console.log('❌ Backend is not running')
  return false
}

async function checkFrontend() {
  console.log('\n🔍 Checking frontend...')
  
  const response = await fetch(FRONTEND_URL)
  if (response.ok) {
    console.log('✅ Frontend is running')
    return true
  }
  console.log('❌ Frontend is not running')
  return false
}

async function checkOnlyOffice() {
  console.log('\n🔍 Checking OnlyOffice...')
  
  const response = await fetch('http://localhost:8080/healthcheck')
  if (response.ok) {
    console.log('✅ OnlyOffice is running')
    return true
  }
  console.log('❌ OnlyOffice is not running')
  return false
}

async function checkDocumentsAPI() {
  console.log('\n🔍 Checking Documents API...')
  
  const loginResponse = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'docs-test@example.com',
      password: 'TestPassword123!'
    })
  })
  
  if (!loginResponse.ok) {
    console.log('❌ Failed to login')
    return false
  }
  
  const { token } = await loginResponse.json()
  
  const docsResponse = await fetch(`${API_BASE}/documents`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  
  if (docsResponse.ok) {
    const documents = await docsResponse.json()
    console.log('✅ Documents API is working')
    console.log(`   Found ${documents.length} documents`)
    return true
  }
  
  console.log('❌ Documents API is not working')
  return false
}

async function checkOnlyOfficeAPI() {
  console.log('\n🔍 Checking OnlyOffice API...')
  
  const response = await fetch('http://localhost:8080/web-apps/apps/api/documents/api.js')
  
  if (response.ok) {
    console.log('✅ OnlyOffice API is accessible')
    return true
  }
  console.log('❌ OnlyOffice API is not accessible')
  return false
}

async function main() {
  console.log('🚀 System Health Check')
  console.log('=' .repeat(50))
  
  const results = await Promise.all([
    checkBackend(),
    checkFrontend(),
    checkOnlyOffice(),
    checkDocumentsAPI(),
    checkOnlyOfficeAPI(),
  ])
  
  console.log('\n' + '='.repeat(50))
  const passed = results.filter(r => r).length
  const total = results.length
  console.log(`📊 Results: ${passed}/${total} checks passed`)
  
  if (passed === total) {
    console.log('✅ All systems are operational!')
  } else {
    console.log('❌ Some systems are not working')
  }
}

main()
