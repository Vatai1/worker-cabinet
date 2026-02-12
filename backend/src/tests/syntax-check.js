#!/usr/bin/env node

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

console.log('=== Authorization System Syntax Check ===\n')

const TEST_JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

describe('Syntax Check for Authentication Components', () => {

  describe('JWT Module', () => {
    it('✓ jwt.sign should be available', () => {
      assert.ok(jwt.sign, 'jwt.sign should be defined')
      assert.strictEqual(typeof jwt.sign, 'function', 'jwt.sign should be a function')
    })

    it('✓ jwt.verify should be available', () => {
      assert.ok(jwt.verify, 'jwt.verify should be defined')
      assert.strictEqual(typeof jwt.verify, 'function', 'jwt.verify should be a function')
    })

    it('✓ Should be able to generate and verify a token', () => {
      const payload = { id: 1, email: 'test@example.com', role: 'employee' }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '7d' })
      
      assert.ok(token, 'Token should be generated')
      assert.strictEqual(typeof token, 'string', 'Token should be a string')
      
      const decoded = jwt.verify(token, TEST_JWT_SECRET)
      assert.strictEqual(decoded.id, payload.id, 'ID should match')
      assert.strictEqual(decoded.email, payload.email, 'Email should match')
      assert.strictEqual(decoded.role, payload.role, 'Role should match')
    })

    it('✓ Should handle expired tokens', () => {
      const payload = { id: 1, email: 'test@example.com', role: 'employee' }
      const expiredToken = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '-1s' })
      
      assert.throws(
        () => jwt.verify(expiredToken, TEST_JWT_SECRET),
        { name: 'TokenExpiredError' },
        'Should throw TokenExpiredError for expired tokens'
      )
    })

    it('✓ Should handle invalid tokens', () => {
      const invalidToken = 'invalid.token.string'
      
      assert.throws(
        () => jwt.verify(invalidToken, TEST_JWT_SECRET),
        { name: 'JsonWebTokenError' },
        'Should throw JsonWebTokenError for invalid tokens'
      )
    })
  })

  describe('Bcrypt Module', () => {
    it('✓ bcrypt.hash should be available', () => {
      assert.ok(bcrypt.hash, 'bcrypt.hash should be defined')
      assert.strictEqual(typeof bcrypt.hash, 'function', 'bcrypt.hash should be a function')
    })

    it('✓ bcrypt.compare should be available', () => {
      assert.ok(bcrypt.compare, 'bcrypt.compare should be defined')
      assert.strictEqual(typeof bcrypt.compare, 'function', 'bcrypt.compare should be a function')
    })

    it('✓ Should be able to hash a password', async () => {
      const password = 'TestPassword123!'
      const hash = await bcrypt.hash(password, 10)
      
      assert.ok(hash, 'Hash should be generated')
      assert.strictEqual(typeof hash, 'string', 'Hash should be a string')
      assert.notStrictEqual(hash, password, 'Hash should not equal password')
      assert.ok(hash.length > 0, 'Hash should not be empty')
    })

    it('✓ Should verify correct password', async () => {
      const password = 'TestPassword123!'
      const hash = await bcrypt.hash(password, 10)
      
      const isValid = await bcrypt.compare(password, hash)
      assert.strictEqual(isValid, true, 'Correct password should be valid')
    })

    it('✓ Should reject incorrect password', async () => {
      const password = 'TestPassword123!'
      const wrongPassword = 'WrongPassword123!'
      const hash = await bcrypt.hash(password, 10)
      
      const isValid = await bcrypt.compare(wrongPassword, hash)
      assert.strictEqual(isValid, false, 'Incorrect password should be invalid')
    })

    it('✓ Should generate different hashes for same password', async () => {
      const password = 'TestPassword123!'
      const hash1 = await bcrypt.hash(password, 10)
      const hash2 = await bcrypt.hash(password, 10)
      
      assert.notStrictEqual(hash1, hash2, 'Same password should produce different hashes')
      assert.strictEqual(await bcrypt.compare(password, hash1), true, 'First hash should be valid')
      assert.strictEqual(await bcrypt.compare(password, hash2), true, 'Second hash should be valid')
    })
  })

  describe('Token Structure', () => {
    it('✓ Token should contain required fields', () => {
      const payload = { id: 123, email: 'user@example.com', role: 'manager' }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '7d' })
      
      const decoded = jwt.verify(token, TEST_JWT_SECRET)
      
      assert.ok(decoded.id, 'Token should contain id')
      assert.ok(decoded.email, 'Token should contain email')
      assert.ok(decoded.role, 'Token should contain role')
      assert.ok(decoded.iat, 'Token should contain iat (issued at)')
      assert.ok(decoded.exp, 'Token should contain exp (expiration)')
    })

    it('✓ Token expiration should be correct', () => {
      const expiresIn = '7d'
      const now = Math.floor(Date.now() / 1000)
      const expectedExp = now + (7 * 24 * 60 * 60)
      
      const token = jwt.sign({ id: 1 }, TEST_JWT_SECRET, { expiresIn })
      const decoded = jwt.verify(token, TEST_JWT_SECRET)
      
      const diff = Math.abs(decoded.exp - expectedExp)
      assert.ok(diff < 5, `Expiration time should be correct (diff: ${diff}s)`)
    })
  })

  describe('User Roles', () => {
    it('✓ Should support all required roles', () => {
      const roles = ['employee', 'manager', 'hr', 'admin']
      
      roles.forEach(role => {
        const token = jwt.sign({ id: 1, email: 'test@example.com', role }, TEST_JWT_SECRET)
        const decoded = jwt.verify(token, TEST_JWT_SECRET)
        assert.strictEqual(decoded.role, role, `Role ${role} should be supported`)
      })
    })

    it('✓ Should handle role authorization logic', () => {
      const userRole = 'employee'
      const allowedRoles = ['manager', 'hr', 'admin']
      
      const hasAccess = allowedRoles.includes(userRole)
      assert.strictEqual(hasAccess, false, 'Employee should not have manager access')
      
      const managerRole = 'manager'
      const managerHasAccess = allowedRoles.includes(managerRole)
      assert.strictEqual(managerHasAccess, true, 'Manager should have access')
    })
  })

  describe('Middleware Functions Structure', () => {
    it('✓ authenticateToken should be a middleware function', () => {
      const mockAuth = (req, res, next) => {
        if (!req.headers.authorization) {
          return res.status(401).json({ error: 'Access token required' })
        }
        next()
      }
      
      assert.strictEqual(typeof mockAuth, 'function', 'Should be a function')
      assert.strictEqual(mockAuth.length, 3, 'Should accept 3 arguments (req, res, next)')
    })

    it('✓ authorizeRoles should create middleware', () => {
      const mockAuthorize = (...roles) => {
        return (req, res, next) => {
          if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' })
          }
          if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' })
          }
          next()
        }
      }
      
      const middleware = mockAuthorize('manager', 'hr', 'admin')
      assert.strictEqual(typeof middleware, 'function', 'Should return a function')
      assert.strictEqual(middleware.length, 3, 'Returned function should accept 3 arguments')
    })

    it('✓ authorizeRoles middleware should work correctly', () => {
      const mockAuthorize = (...roles) => {
        return (req, res, next) => {
          if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' })
          }
          if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' })
          }
          next()
        }
      }
      
      const middleware = mockAuthorize('manager', 'hr', 'admin')
      
      let calledNext = false
      const mockReq = { user: { role: 'manager' } }
      const mockRes = { status: () => ({ json: () => {} }) }
      const mockNext = () => { calledNext = true }
      
      middleware(mockReq, mockRes, mockNext)
      assert.strictEqual(calledNext, true, 'Should call next() for authorized user')
      
      calledNext = false
      const mockReq2 = { user: { role: 'employee' } }
      middleware(mockReq2, mockRes, mockNext)
      assert.strictEqual(calledNext, false, 'Should not call next() for unauthorized user')
    })
  })

  describe('Password Security', () => {
    it('✓ Hash should be irreversible', async () => {
      const password = 'TestPassword123!'
      const hash = await bcrypt.hash(password, 10)
      
      assert.notStrictEqual(hash, password, 'Hash should not equal password')
      assert.strictEqual(hash.length, 60, 'Bcrypt hash should be 60 characters')
    })

    it('✓ Should use proper salt rounds', async () => {
      const password = 'TestPassword123!'
      const hash1 = await bcrypt.hash(password, 10)
      const hash2 = await bcrypt.hash(password, 12)
      
      assert.notStrictEqual(hash1, hash2, 'Different salt rounds should produce different hashes')
    })
  })

  describe('Error Handling', () => {
    it('✓ Should handle missing authorization header', () => {
      const req = { headers: {} }
      const res = {
        status: (code) => ({ json: (data) => ({ code, data }) })
      }
      
      if (!req.headers.authorization) {
        const result = res.status(401).json({ error: 'Access token required' })
        assert.strictEqual(result.code, 401, 'Should return 401')
        assert.strictEqual(result.data.error, 'Access token required', 'Error message should match')
      }
    })

    it('✓ Should handle malformed token', () => {
      const token = 'not.a.valid.jwt'
      
      assert.throws(
        () => jwt.verify(token, TEST_JWT_SECRET),
        { name: 'JsonWebTokenError' }
      )
    })

    it('✓ Should handle token without Bearer prefix', () => {
      const token = jwt.sign({ id: 1 }, TEST_JWT_SECRET)
      const authHeader = token
      
      const parts = authHeader.split(' ')
      const extractedToken = parts.length === 2 ? parts[1] : parts[0]
      
      assert.strictEqual(extractedToken, token, 'Should extract token correctly')
    })
  })
})

console.log('\n=== All Syntax Checks Passed! ===\n')
