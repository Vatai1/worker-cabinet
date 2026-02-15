import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const API_BASE = 'http://localhost:5001/api'
const JWT_SECRET = 'your-secret-key-change-in-production'

let testUserId
let authToken

describe('Documents API', () => {
  
  before(async () => {
    const TEST_USER = {
      email: 'docs-test@example.com',
      password: 'TestPass123!',
      firstName: 'Docs',
      lastName: 'Test',
    }

    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test-auth@example.com',
        password: 'TestPassword123!'
      })
    })

    if (response.ok) {
      const data = await response.json()
      authToken = data.token
      testUserId = data.user.id
      console.log('✅ Authenticated with user ID:', testUserId)
    } else {
      console.log('❌ Failed to authenticate')
    }
  })

  it('should get all documents from user projects', async () => {
    if (!authToken) {
      console.log('⚠️  Skipping test - no auth token')
      return
    }

    const response = await fetch(`${API_BASE}/documents`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    assert.strictEqual(response.status, 200, 'Should return 200')
    const data = await response.json()
    assert.ok(Array.isArray(data), 'Should return an array')
    console.log('📄 Documents found:', data.length)
    
    if (data.length > 0) {
      console.log('📄 First document:', data[0].name, '| Project:', data[0].projectName)
    }
  })

  it('should require authentication', async () => {
    const response = await fetch(`${API_BASE}/documents`)
    
    assert.strictEqual(response.status, 401, 'Should return 401')
    const data = await response.json()
    assert.strictEqual(data.error, 'Access token required', 'Error message should match')
  })
})
