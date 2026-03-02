import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { pool, query, getClient } from '../src/config/database.js'
import { authenticateToken, authorizeRoles } from '../src/middleware/auth.js'

describe('Authentication System', () => {

  let testUserId
  const TEST_USER = {
    email: 'test-auth@example.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    position: 'Developer',
    role: 'employee',
    departmentId: 1
  }

  beforeEach(async () => {
    try {
      const passwordHash = await bcrypt.hash(TEST_USER.password, 10)
      const result = await query(
        `INSERT INTO users 
         (email, password_hash, first_name, last_name, position, department_id, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [TEST_USER.email, passwordHash, TEST_USER.firstName, TEST_USER.lastName, TEST_USER.position, TEST_USER.departmentId, TEST_USER.role]
      )
      testUserId = result.rows[0].id
    } catch (error) {
      console.error('Setup error:', error.message)
    }
  })

  afterEach(async () => {
    try {
      if (testUserId) {
        await query('DELETE FROM vacation_balances WHERE user_id = $1', [testUserId])
        await query('DELETE FROM users WHERE id = $1', [testUserId])
      }
    } catch (error) {
      console.error('Cleanup error:', error.message)
    }
  })

  describe('JWT Token Generation', () => {
    it('should generate valid JWT token', () => {
      const token = jwt.sign(
        { id: testUserId, email: TEST_USER.email, role: TEST_USER.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )
      
      assert.ok(token, 'Token should be generated')
      assert.strictEqual(typeof token, 'string', 'Token should be a string')
    })

    it('should verify valid JWT token', () => {
      const token = jwt.sign(
        { id: testUserId, email: TEST_USER.email, role: TEST_USER.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      
      assert.strictEqual(decoded.id, testUserId, 'User ID should match')
      assert.strictEqual(decoded.email, TEST_USER.email, 'Email should match')
      assert.strictEqual(decoded.role, TEST_USER.role, 'Role should match')
    })

    it('should reject invalid JWT token', () => {
      const invalidToken = 'invalid.token.here'
      
      assert.throws(
        () => jwt.verify(invalidToken, process.env.JWT_SECRET),
        { name: 'JsonWebTokenError' }
      )
    })

    it('should reject expired JWT token', () => {
      const expiredToken = jwt.sign(
        { id: testUserId, email: TEST_USER.email, role: TEST_USER.role },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      )
      
      assert.throws(
        () => jwt.verify(expiredToken, process.env.JWT_SECRET),
        { name: 'TokenExpiredError' }
      )
    })
  })

  describe('Password Hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'TestPassword123!'
      const hash = await bcrypt.hash(password, 10)
      
      assert.ok(hash, 'Hash should be generated')
      assert.strictEqual(typeof hash, 'string', 'Hash should be a string')
      assert.notStrictEqual(hash, password, 'Hash should not equal password')
    })

    it('should verify correct password', async () => {
      const password = 'TestPassword123!'
      const hash = await bcrypt.hash(password, 10)
      
      const isValid = await bcrypt.compare(password, hash)
      assert.strictEqual(isValid, true, 'Password should be valid')
    })

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!'
      const wrongPassword = 'WrongPassword123!'
      const hash = await bcrypt.hash(password, 10)
      
      const isValid = await bcrypt.compare(wrongPassword, hash)
      assert.strictEqual(isValid, false, 'Password should be invalid')
    })

    it('should hash same password differently', async () => {
      const password = 'TestPassword123!'
      const hash1 = await bcrypt.hash(password, 10)
      const hash2 = await bcrypt.hash(password, 10)
      
      assert.notStrictEqual(hash1, hash2, 'Same password should produce different hashes')
    })
  })

  describe('Authentication Middleware', () => {
    it('should authenticate valid token', (t, done) => {
      const token = jwt.sign(
        { id: testUserId, email: TEST_USER.email, role: TEST_USER.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )
      
      const req = {
        headers: { authorization: `Bearer ${token}` }
      }
      const res = {
        status: () => ({ json: () => {} })
      }
      
      authenticateToken(req, res, () => {
        assert.strictEqual(req.user.id, testUserId, 'User should be authenticated')
        assert.strictEqual(req.user.email, TEST_USER.email, 'Email should match')
        done()
      })
    })

    it('should reject request without token', (t, done) => {
      const req = { headers: {} }
      const res = {
        status: (code) => {
          assert.strictEqual(code, 401, 'Should return 401')
          return { json: (data) => {
            assert.strictEqual(data.error, 'Access token required', 'Error message should match')
            done()
          }}
        }
      }
      
      authenticateToken(req, res, () => {
        assert.fail('Should not call next()')
      })
    })

    it('should reject invalid token', (t, done) => {
      const req = {
        headers: { authorization: 'Bearer invalid.token' }
      }
      const res = {
        status: (code) => {
          assert.strictEqual(code, 403, 'Should return 403')
          return { json: (data) => {
            assert.strictEqual(data.error, 'Invalid or expired token', 'Error message should match')
            done()
          }}
        }
      }
      
      authenticateToken(req, res, () => {
        assert.fail('Should not call next()')
      })
    })
  })

  describe('Authorization Middleware', () => {
    it('should authorize user with correct role', (t, done) => {
      const req = {
        user: { id: testUserId, email: TEST_USER.email, role: 'manager' }
      }
      const res = {
        status: () => ({ json: () => {} })
      }
      
      const middleware = authorizeRoles('manager', 'hr', 'admin')
      middleware(req, res, () => {
        done()
      })
    })

    it('should reject user without correct role', (t, done) => {
      const req = {
        user: { id: testUserId, email: TEST_USER.email, role: 'employee' }
      }
      const res = {
        status: (code) => {
          assert.strictEqual(code, 403, 'Should return 403')
          return { json: (data) => {
            assert.strictEqual(data.error, 'Forbidden: Insufficient permissions', 'Error message should match')
            done()
          }}
        }
      }
      
      const middleware = authorizeRoles('manager', 'hr', 'admin')
      middleware(req, res, () => {
        assert.fail('Should not call next()')
      })
    })

    it('should reject request without user', (t, done) => {
      const req = {}
      const res = {
        status: (code) => {
          assert.strictEqual(code, 401, 'Should return 401')
          return { json: (data) => {
            assert.strictEqual(data.error, 'Unauthorized', 'Error message should match')
            done()
          }}
        }
      }
      
      const middleware = authorizeRoles('manager', 'hr', 'admin')
      middleware(req, res, () => {
        assert.fail('Should not call next()')
      })
    })
  })

  describe('User Authentication Flow', () => {
    it('should login with correct credentials', async () => {
      const response = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_USER.email,
          password: TEST_USER.password
        })
      })
      
      const data = await response.json()
      
      assert.strictEqual(response.status, 200, 'Should return 200')
      assert.ok(data.token, 'Token should be present')
      assert.ok(data.user, 'User data should be present')
      assert.strictEqual(data.user.email, TEST_USER.email, 'Email should match')
    })

    it('should reject login with wrong password', async () => {
      const response = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_USER.email,
          password: 'WrongPassword123!'
        })
      })
      
      const data = await response.json()
      
      assert.strictEqual(response.status, 401, 'Should return 401')
      assert.strictEqual(data.error, 'Invalid email or password', 'Error message should match')
    })

    it('should reject login with non-existent email', async () => {
      const response = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: TEST_USER.password
        })
      })
      
      const data = await response.json()
      
      assert.strictEqual(response.status, 401, 'Should return 401')
      assert.strictEqual(data.error, 'Invalid email or password', 'Error message should match')
    })
  })

  describe('Protected Routes', () => {
    let authToken

    beforeEach(async () => {
      const loginResponse = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_USER.email,
          password: TEST_USER.password
        })
      })
      const loginData = await loginResponse.json()
      authToken = loginData.token
    })

    it('should access protected route with valid token', async () => {
      const response = await fetch(`http://localhost:5001/api/users/${testUserId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      const data = await response.json()
      
      assert.strictEqual(response.status, 200, 'Should return 200')
      assert.strictEqual(data.id, testUserId, 'User ID should match')
    })

    it('should reject protected route without token', async () => {
      const response = await fetch(`http://localhost:5001/api/users/${testUserId}`)
      
      const data = await response.json()
      
      assert.strictEqual(response.status, 401, 'Should return 401')
      assert.strictEqual(data.error, 'Access token required', 'Error message should match')
    })

    it('should reject protected route with invalid token', async () => {
      const response = await fetch(`http://localhost:5001/api/users/${testUserId}`, {
        headers: { 'Authorization': 'Bearer invalid.token' }
      })
      
      const data = await response.json()
      
      assert.strictEqual(response.status, 403, 'Should return 403')
      assert.strictEqual(data.error, 'Invalid or expired token', 'Error message should match')
    })
  })

  describe('Role-Based Access Control', () => {
    let managerToken
    let employeeToken
    let managerUserId

    beforeEach(async () => {
      const passwordHash = await bcrypt.hash('ManagerPass123!', 10)
      const result = await query(
        `INSERT INTO users 
         (email, password_hash, first_name, last_name, position, department_id, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        ['manager-auth@example.com', passwordHash, 'Manager', 'User', 'Manager', TEST_USER.departmentId, 'manager']
      )
      managerUserId = result.rows[0].id
      
      const managerLogin = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'manager-auth@example.com',
          password: 'ManagerPass123!'
        })
      })
      const managerData = await managerLogin.json()
      managerToken = managerData.token
      
      const employeeLogin = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_USER.email,
          password: TEST_USER.password
        })
      })
      const employeeData = await employeeLogin.json()
      employeeToken = employeeData.token
    })

    afterEach(async () => {
      if (managerUserId) {
        await query('DELETE FROM vacation_balances WHERE user_id = $1', [managerUserId])
        await query('DELETE FROM users WHERE id = $1', [managerUserId])
      }
    })

    it('should allow manager to access all users', async () => {
      const response = await fetch('http://localhost:5001/api/users', {
        headers: { 'Authorization': `Bearer ${managerToken}` }
      })
      
      const data = await response.json()
      
      assert.strictEqual(response.status, 200, 'Should return 200')
      assert.ok(Array.isArray(data), 'Response should be an array')
    })

    it('should deny employee access to all users', async () => {
      const response = await fetch('http://localhost:5001/api/users', {
        headers: { 'Authorization': `Bearer ${employeeToken}` }
      })
      
      assert.strictEqual(response.status, 403, 'Should return 403')
    })

    it('should allow employee to access own profile', async () => {
      const response = await fetch(`http://localhost:5001/api/users/${testUserId}`, {
        headers: { 'Authorization': `Bearer ${employeeToken}` }
      })
      
      const data = await response.json()
      
      assert.strictEqual(response.status, 200, 'Should return 200')
      assert.strictEqual(data.id, testUserId, 'User ID should match')
    })

    it('should deny employee access to other users profile', async () => {
      const response = await fetch(`http://localhost:5001/api/users/${managerUserId}`, {
        headers: { 'Authorization': `Bearer ${employeeToken}` }
      })
      
      assert.strictEqual(response.status, 403, 'Should return 403')
    })
  })
})
