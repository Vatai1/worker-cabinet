#!/usr/bin/env node

import fetch from 'node-fetch'

const API_BASE = 'http://localhost:5001/api'

async function testDocumentsAPI() {
  console.log('🔍 Testing /api/documents endpoint...')
  
  try {
    const response = await fetch(`${API_BASE}/documents`)
    
    console.log('Status:', response.status)
    console.log('Status Text:', response.statusText)
    
    if (response.ok) {
      const data = await response.json()
      console.log('\n✅ API Response:')
      console.log('Documents count:', data.length)
      
      if (data.length > 0) {
        console.log('\n📄 Sample documents:')
        data.slice(0, 3).forEach((doc, index) => {
          console.log(`\n${index + 1}. ${doc.name}`)
          console.log(`   Project: ${doc.projectName}`)
          console.log(`   Size: ${doc.size} bytes`)
          console.log(`   Type: ${doc.mimeType}`)
          console.log(`   Uploader: ${doc.uploader}`)
        })
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

testDocumentsAPI()
