#!/usr/bin/env node

import fetch from 'node-fetch'

const API_BASE = 'http://localhost:5001/api'

async function login() {
  console.log('🔐 Logging in...')
  
  try {
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
      console.log('User:', data.user.firstName, data.user.lastName)
      return data.token
    } else {
      const error = await response.json()
      console.log('❌ Login failed:', error.error)
      return null
    }
  } catch (error) {
    console.error('❌ Login error:', error.message)
    return null
  }
}

async function testDocumentsAPI(token) {
  console.log('\n🔍 Testing /api/documents endpoint...')
  
  try {
    const response = await fetch(`${API_BASE}/documents`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    
    console.log('Status:', response.status)
    
    if (response.ok) {
      const data = await response.json()
      console.log('\n✅ API Response:')
      console.log('Documents count:', data.length)
      
      if (data.length > 0) {
        console.log('\n📄 Sample documents:')
        data.slice(0, 5).forEach((doc, index) => {
          console.log(`\n${index + 1}. ${doc.name}`)
          console.log(`   Project: ${doc.projectName}`)
          console.log(`   Size: ${doc.size} bytes`)
          console.log(`   Type: ${doc.mimeType}`)
          console.log(`   Uploader: ${doc.uploader}`)
        })
      } else {
        console.log('\n📭 No documents found')
      }
    } else {
      const error = await response.json()
      console.log('\n❌ API Error:')
      console.log(error)
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message)
  }
}

async function main() {
  const token = await login()
  
  if (token) {
    await testDocumentsAPI(token)
  } else {
    console.log('\n❌ Cannot test API - no token available')
  }
}

main()
