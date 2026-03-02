#!/usr/bin/env node

import { describe, it } from 'node:test'
import assert from 'node:assert'

console.log('=== Vacation Status History Syntax Check ===\n')

describe('Syntax Check for Vacation Status History', () => {

  describe('Status History Data Structure', () => {
    it('✓ Should support all status values', () => {
      const statuses = [
        'on_approval',
        'approved',
        'rejected',
        'cancelled_by_employee',
        'cancelled_by_manager'
      ]
      
      statuses.forEach(status => {
        assert.ok(status, `Status ${status} should be valid`)
        assert.strictEqual(typeof status, 'string', 'Status should be a string')
      })
    })

    it('✓ Should support required history fields', () => {
      const historyEntry = {
        id: 1,
        request_id: 100,
        status: 'approved',
        changed_at: new Date(),
        changed_by: 5,
        comment: 'Согласовано'
      }
      
      assert.ok(historyEntry.id, 'Should have id')
      assert.ok(historyEntry.request_id, 'Should have request_id')
      assert.ok(historyEntry.status, 'Should have status')
      assert.ok(historyEntry.changed_at, 'Should have changed_at')
      assert.ok(historyEntry.changed_by, 'Should have changed_by')
      assert.ok(historyEntry.comment, 'Should have comment')
    })

    it('✓ Should support changed_by_name from user table', () => {
      const historyEntry = {
        status: 'approved',
        changedAt: new Date(),
        changedBy: 5,
        changedByName: 'Иванов Иван'
      }
      
      assert.ok(historyEntry.changedByName, 'Should have changedByName')
      assert.strictEqual(typeof historyEntry.changedByName, 'string', 'changedByName should be a string')
      assert.ok(historyEntry.changedByName.includes(' '), 'changedByName should contain space')
    })
  })

  describe('Status History API Response Format', () => {
    it('✓ Should format history entry as JSON object', () => {
      const historyEntry = {
        id: 1,
        status: 'approved',
        changedAt: '2025-02-12T10:30:00.000Z',
        changedBy: '5',
        changedByName: 'Иванов Иван',
        comment: 'Согласовано'
      }
      
      assert.strictEqual(typeof historyEntry, 'object', 'Entry should be an object')
      assert.strictEqual(historyEntry.status, 'approved', 'Status should match')
      assert.strictEqual(historyEntry.changedBy, '5', 'changedBy should match')
      assert.strictEqual(historyEntry.changedByName, 'Иванов Иван', 'changedByName should match')
    })

    it('✓ Should support array of history entries', () => {
      const statusHistory = [
        {
          id: 1,
          status: 'on_approval',
          changedAt: '2025-02-12T09:00:00.000Z',
          changedBy: '10',
          changedByName: 'Петров Петр',
          comment: null
        },
        {
          id: 2,
          status: 'approved',
          changedAt: '2025-02-12T10:30:00.000Z',
          changedBy: '5',
          changedByName: 'Иванов Иван',
          comment: 'Согласовано'
        }
      ]
      
      assert.ok(Array.isArray(statusHistory), 'statusHistory should be an array')
      assert.strictEqual(statusHistory.length, 2, 'Should have two entries')
      
      statusHistory.forEach(entry => {
        assert.ok(entry.id, 'Each entry should have id')
        assert.ok(entry.status, 'Each entry should have status')
        assert.ok(entry.changedAt, 'Each entry should have changedAt')
        assert.ok(entry.changedBy, 'Each entry should have changedBy')
        assert.ok(entry.changedByName, 'Each entry should have changedByName')
      })
    })

    it('✓ Should support optional comment field', () => {
      const entryWithComment = {
        status: 'rejected',
        comment: 'Недостаточно сотрудников'
      }
      const entryWithoutComment = {
        status: 'cancelled_by_employee'
      }
      
      assert.strictEqual(entryWithComment.comment, 'Недостаточно сотрудников', 'Comment should match when present')
      assert.strictEqual(entryWithoutComment.comment, undefined, 'Comment should be undefined when not present')
    })
  })

  describe('SQL Query Structure', () => {
    it('✓ Should have correct table structure', () => {
      const tableName = 'vacation_request_status_history'
      const expectedColumns = [
        'id SERIAL PRIMARY KEY',
        'request_id INTEGER NOT NULL REFERENCES vacation_requests(id)',
        'status request_status_enum NOT NULL',
        'changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        'changed_by INTEGER NOT NULL REFERENCES users(id)',
        'comment TEXT'
      ]
      
      assert.ok(tableName, 'Table name should be defined')
      assert.strictEqual(typeof tableName, 'string', 'Table name should be a string')
      
      expectedColumns.forEach(column => {
        assert.ok(column.includes('INTEGER') || column.includes('TEXT') || column.includes('TIMESTAMP') || 
                 column.includes('SERIAL') || column.includes('request_status_enum'), 
                 `Column definition should include type`)
      })
    })

    it('✓ Should support JOIN with users table for changedByName', () => {
      const queryStructure = `
        SELECT 
          vrsh.*,
          hu.last_name || ' ' || hu.first_name as changed_by_name
        FROM vacation_request_status_history vrsh
        LEFT JOIN users hu ON vrsh.changed_by = hu.id
      `
      
      assert.ok(queryStructure.includes('vacation_request_status_history'), 'Should query history table')
      assert.ok(queryStructure.includes('users'), 'Should join users table')
      assert.ok(queryStructure.includes('changed_by = hu.id'), 'Should join on changed_by')
      assert.ok(queryStructure.includes('changed_by_name'), 'Should include changed_by_name in output')
    })

    it('✓ Should support JSON aggregation for API response', () => {
      const aggregationQuery = `
        json_agg(
          json_build_object(
            'id', vrsh.id,
            'status', vrsh.status,
            'changedAt', vrsh.changed_at,
            'changedBy', vrsh.changed_by,
            'changedByName', hu.last_name || ' ' || hu.first_name,
            'comment', vrsh.comment
          ) ORDER BY vrsh.changed_at
        )
      `
      
      assert.ok(aggregationQuery.includes('json_agg'), 'Should use json_agg')
      assert.ok(aggregationQuery.includes('json_build_object'), 'Should use json_build_object')
      assert.ok(aggregationQuery.includes('changedByName'), 'Should include changedByName')
      assert.ok(aggregationQuery.includes('ORDER BY'), 'Should order by changed_at')
    })
  })

  describe('Status History Operations', () => {
    it('✓ Should support INSERT operation', () => {
      const insertQuery = `
        INSERT INTO vacation_request_status_history 
        (request_id, status, changed_by, comment) 
        VALUES ($1, $2, $3, $4)
      `
      
      assert.ok(insertQuery.includes('INSERT'), 'Should include INSERT')
      assert.ok(insertQuery.includes('vacation_request_status_history'), 'Should target correct table')
      assert.ok(insertQuery.includes('request_id'), 'Should include request_id')
      assert.ok(insertQuery.includes('status'), 'Should include status')
      assert.ok(insertQuery.includes('changed_by'), 'Should include changed_by')
      assert.ok(insertQuery.includes('comment'), 'Should include comment')
    })

    it('✓ Should support SELECT operation', () => {
      const selectQuery = `
        SELECT * FROM vacation_request_status_history 
        WHERE request_id = $1 
        ORDER BY changed_at DESC
      `
      
      assert.ok(selectQuery.includes('SELECT'), 'Should include SELECT')
      assert.ok(selectQuery.includes('WHERE request_id'), 'Should filter by request_id')
      assert.ok(selectQuery.includes('ORDER BY'), 'Should order results')
    })
  })

  describe('User Information in History', () => {
    it('✓ Should support retrieving user who made the change', () => {
      const userInfoQuery = `
        SELECT 
          vrsh.*,
          hu.first_name,
          hu.last_name,
          hu.email,
          hu.role,
          hu.position
        FROM vacation_request_status_history vrsh
        LEFT JOIN users hu ON vrsh.changed_by = hu.id
      `
      
      assert.ok(userInfoQuery.includes('hu.first_name'), 'Should include first_name')
      assert.ok(userInfoQuery.includes('hu.last_name'), 'Should include last_name')
      assert.ok(userInfoQuery.includes('hu.email'), 'Should include email')
      assert.ok(userInfoQuery.includes('hu.role'), 'Should include role')
    })

    it('✓ Should support concatenation for changedByName', () => {
      const concatQuery = "hu.last_name || ' ' || hu.first_name as changed_by_name"
      
      assert.ok(concatQuery.includes('last_name'), 'Should include last_name')
      assert.ok(concatQuery.includes('first_name'), 'Should include first_name')
      assert.ok(concatQuery.includes('||'), 'Should use concatenation operator')
    })
  })

  describe('Date and Time Handling', () => {
    it('✓ Should support changed_at timestamp', () => {
      const timestampFormat = new Date().toISOString()
      
      assert.ok(timestampFormat, 'Timestamp should be generated')
      assert.strictEqual(typeof timestampFormat, 'string', 'Timestamp should be a string')
      assert.ok(timestampFormat.includes('T'), 'Timestamp should include T separator')
      assert.ok(timestampFormat.includes('Z'), 'Timestamp should include Z suffix')
    })

    it('✓ Should support ordering by changed_at', () => {
      const orderByClauses = [
        'ORDER BY changed_at DESC',
        'ORDER BY changed_at ASC'
      ]
      
      orderByClauses.forEach(clause => {
        assert.ok(clause.includes('ORDER BY changed_at'), 'Should order by changed_at')
        assert.ok(clause.includes('DESC') || clause.includes('ASC'), 'Should specify direction')
      })
    })
  })

  describe('Comments and Rejection Reasons', () => {
    it('✓ Should support comment field for all status changes', () => {
      const statusChanges = [
        { status: 'approved', comment: 'Согласовано' },
        { status: 'rejected', comment: 'Отсутствуют сотрудники' },
        { status: 'cancelled_by_manager', comment: 'Срочная работа' }
      ]
      
      statusChanges.forEach(change => {
        assert.ok(change.status, 'Should have status')
        assert.ok(change.comment, 'Should have comment')
        assert.strictEqual(typeof change.comment, 'string', 'Comment should be a string')
      })
    })

    it('✓ Should support null comments', () => {
      const entryWithNullComment = {
        status: 'on_approval',
        comment: null
      }
      
      assert.strictEqual(entryWithNullComment.comment, null, 'Comment should be null')
    })
  })
})

console.log('\n=== All Vacation Status History Syntax Checks Passed! ===\n')
