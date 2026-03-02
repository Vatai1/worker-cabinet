import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query, getClient } from '../src/config/database.js'

describe('Vacation Request Status History', () => {
  let employeeId
  let managerId
  let vacationRequestId

  const EMPLOYEE = {
    email: 'vacation-emp@example.com',
    password: 'EmployeePass123!',
    firstName: 'Employee',
    lastName: 'Test',
    position: 'Developer',
    role: 'employee',
    departmentId: 1
  }

  const MANAGER = {
    email: 'vacation-mgr@example.com',
    password: 'ManagerPass123!',
    firstName: 'Manager',
    lastName: 'Test',
    position: 'Team Lead',
    role: 'manager',
    departmentId: 1
  }

  const VACATION_REQUEST = {
    startDate: '2025-03-10',
    endDate: '2025-03-14',
    vacationType: 'annual_paid',
    comment: 'Test vacation request'
  }

  beforeEach(async () => {
    try {
      const client = await getClient()
      await client.query('BEGIN')

      const empHash = await bcrypt.hash(EMPLOYEE.password, 10)
      const empResult = await client.query(
        `INSERT INTO users 
         (email, password_hash, first_name, last_name, position, department_id, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [EMPLOYEE.email, empHash, EMPLOYEE.firstName, EMPLOYEE.lastName, EMPLOYEE.position, EMPLOYEE.departmentId, EMPLOYEE.role]
      )
      employeeId = empResult.rows[0].id

      const mgrHash = await bcrypt.hash(MANAGER.password, 10)
      const mgrResult = await client.query(
        `INSERT INTO users 
         (email, password_hash, first_name, last_name, position, department_id, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [MANAGER.email, mgrHash, MANAGER.firstName, MANAGER.lastName, MANAGER.position, MANAGER.departmentId, MANAGER.role]
      )
      managerId = mgrResult.rows[0].id

      await client.query(
        `INSERT INTO vacation_balances (user_id, total_days, used_days, available_days, reserved_days)
         VALUES ($1, 28, 0, 28, 0)`,
        [employeeId]
      )

      const vacationResult = await client.query(
        `INSERT INTO vacation_requests 
         (user_id, start_date, end_date, duration, vacation_type, comment, status)
         VALUES ($1, $2, $3, 5, $4, $5, 'on_approval')
         RETURNING id`,
        [employeeId, VACATION_REQUEST.startDate, VACATION_REQUEST.endDate, VACATION_REQUEST.vacationType, VACATION_REQUEST.comment]
      )
      vacationRequestId = vacationResult.rows[0].id

      await client.query('COMMIT')
    } catch (error) {
      console.error('Setup error:', error.message)
      throw error
    }
  })

  afterEach(async () => {
    try {
      if (managerId) {
        await query('DELETE FROM vacation_balances WHERE user_id = $1', [managerId])
        await query('DELETE FROM users WHERE id = $1', [managerId])
      }
      if (employeeId) {
        await query('DELETE FROM vacation_balances WHERE user_id = $1', [employeeId])
        await query('DELETE FROM users WHERE id = $1', [employeeId])
      }
    } catch (error) {
      console.error('Cleanup error:', error.message)
    }
  })

  describe('Status History Creation', () => {
    it('should create initial status history entry when vacation request is created', async () => {
      const result = await query(
        `SELECT * FROM vacation_request_status_history 
         WHERE request_id = $1 
         ORDER BY changed_at DESC 
         LIMIT 1`,
        [vacationRequestId]
      )

      assert.strictEqual(result.rows.length, 1, 'Should have one history entry')
      const history = result.rows[0]
      assert.strictEqual(history.status, 'on_approval', 'Initial status should be on_approval')
      assert.strictEqual(history.changed_by, employeeId, 'Should be changed by employee')
      assert.ok(history.changed_at, 'Should have changed_at timestamp')
    })

    it('should record who approved a vacation request', async () => {
      await query(
        `UPDATE vacation_requests 
         SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
         WHERE id = $2`,
        [managerId, vacationRequestId]
      )

      await query(
        `INSERT INTO vacation_request_status_history 
         (request_id, status, changed_by, comment) 
         VALUES ($1, 'approved', $2, 'Согласовано')`,
        [vacationRequestId, managerId]
      )

      const result = await query(
        `SELECT * FROM vacation_request_status_history 
         WHERE request_id = $1 
         ORDER BY changed_at DESC`,
        [vacationRequestId]
      )

      assert.strictEqual(result.rows.length, 2, 'Should have two history entries')
      
      const approvedEntry = result.rows[0]
      assert.strictEqual(approvedEntry.status, 'approved', 'Should have approved status')
      assert.strictEqual(approvedEntry.changed_by, managerId, 'Should be changed by manager')
      assert.strictEqual(approvedEntry.comment, 'Согласовано', 'Should have approval comment')
    })

    it('should record who rejected a vacation request with reason', async () => {
      const rejectionReason = 'Отсутствуют сотрудники для замены'
      
      await query(
        `UPDATE vacation_requests 
         SET status = 'rejected', rejection_reason = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
         WHERE id = $3`,
        [rejectionReason, managerId, vacationRequestId]
      )

      await query(
        `INSERT INTO vacation_request_status_history 
         (request_id, status, changed_by, comment) 
         VALUES ($1, 'rejected', $2, $3)`,
        [vacationRequestId, managerId, rejectionReason]
      )

      const result = await query(
        `SELECT * FROM vacation_request_status_history 
         WHERE request_id = $1 AND status = 'rejected'
         LIMIT 1`,
        [vacationRequestId]
      )

      assert.strictEqual(result.rows.length, 1, 'Should have rejected history entry')
      const history = result.rows[0]
      assert.strictEqual(history.status, 'rejected', 'Status should be rejected')
      assert.strictEqual(history.changed_by, managerId, 'Should be changed by manager')
      assert.strictEqual(history.comment, rejectionReason, 'Should have rejection reason as comment')
    })

    it('should record employee cancellation', async () => {
      await query(
        `UPDATE vacation_requests 
         SET status = 'cancelled_by_employee'
         WHERE id = $1`,
        [vacationRequestId]
      )

      await query(
        `INSERT INTO vacation_request_status_history 
         (request_id, status, changed_by) 
         VALUES ($1, 'cancelled_by_employee', $2)`,
        [vacationRequestId, employeeId]
      )

      const result = await query(
        `SELECT * FROM vacation_request_status_history 
         WHERE request_id = $1 AND status = 'cancelled_by_employee'
         LIMIT 1`,
        [vacationRequestId]
      )

      assert.strictEqual(result.rows.length, 1, 'Should have cancellation history entry')
      const history = result.rows[0]
      assert.strictEqual(history.changed_by, employeeId, 'Should be changed by employee')
    })

    it('should record manager cancellation with reason', async () => {
      await query(
        `UPDATE vacation_requests 
         SET status = 'approved'
         WHERE id = $1`,
        [vacationRequestId]
      )

      await query(
        `UPDATE vacation_requests 
         SET status = 'cancelled_by_manager', cancellation_reason = $1
         WHERE id = $2`,
        ['Срочная работа', vacationRequestId]
      )

      await query(
        `INSERT INTO vacation_request_status_history 
         (request_id, status, changed_by, comment) 
         VALUES ($1, 'cancelled_by_manager', $2, $3)`,
        [vacationRequestId, managerId, 'Срочная работа']
      )

      const result = await query(
        `SELECT * FROM vacation_request_status_history 
         WHERE request_id = $1 AND status = 'cancelled_by_manager'
         LIMIT 1`,
        [vacationRequestId]
      )

      assert.strictEqual(result.rows.length, 1, 'Should have manager cancellation history entry')
      const history = result.rows[0]
      assert.strictEqual(history.changed_by, managerId, 'Should be changed by manager')
      assert.strictEqual(history.comment, 'Срочная работа', 'Should have cancellation reason')
    })
  })

  describe('Status History Query with User Information', () => {
    it('should return status history with user who made the change', async () => {
      await query(
        `UPDATE vacation_requests 
         SET status = 'approved', reviewed_by = $1
         WHERE id = $2`,
        [managerId, vacationRequestId]
      )

      await query(
        `INSERT INTO vacation_request_status_history 
         (request_id, status, changed_by, comment) 
         VALUES ($1, 'approved', $2, 'Согласовано')`,
        [vacationRequestId, managerId]
      )

      const result = await query(
        `SELECT 
           vrsh.*,
           hu.first_name as changer_first_name,
           hu.last_name as changer_last_name,
           hu.email as changer_email,
           hu.role as changer_role
         FROM vacation_request_status_history vrsh
         LEFT JOIN users hu ON vrsh.changed_by = hu.id
         WHERE vrsh.request_id = $1
         ORDER BY vrsh.changed_at DESC`,
        [vacationRequestId]
      )

      assert.strictEqual(result.rows.length, 2, 'Should have two history entries')
      
      const approvedEntry = result.rows[0]
      assert.strictEqual(approvedEntry.changer_first_name, MANAGER.firstName, 'Manager first name should match')
      assert.strictEqual(approvedEntry.changer_last_name, MANAGER.lastName, 'Manager last name should match')
      assert.strictEqual(approvedEntry.changer_email, MANAGER.email, 'Manager email should match')
      assert.strictEqual(approvedEntry.changer_role, MANAGER.role, 'Manager role should match')
    })

    it('should return full status history for a vacation request', async () => {
      const result = await query(
        `SELECT 
           vrsh.*,
           CONCAT(hu.last_name, ' ', hu.first_name) as changed_by_name
         FROM vacation_request_status_history vrsh
         LEFT JOIN users hu ON vrsh.changed_by = hu.id
         WHERE vrsh.request_id = $1
         ORDER BY vrsh.changed_at ASC`,
        [vacationRequestId]
      )

      assert.ok(result.rows.length > 0, 'Should have history entries')
      
      for (const entry of result.rows) {
        assert.ok(entry.status, 'Should have status')
        assert.ok(entry.changed_by, 'Should have changed_by user ID')
        assert.ok(entry.changed_at, 'Should have changed_at timestamp')
        assert.ok(entry.changed_by_name, 'Should have changed_by_name from user table')
        assert.strictEqual(
          entry.changed_by_name, 
          `${EMPLOYEE.lastName} ${EMPLOYEE.firstName}`,
          'Changed by name should match employee name'
        )
      }
    })
  })

  describe('Status History Format for API Response', () => {
    it('should format status history as JSON for API response', async () => {
      await query(
        `UPDATE vacation_requests 
         SET status = 'approved', reviewed_by = $1
         WHERE id = $2`,
        [managerId, vacationRequestId]
      )

      await query(
        `INSERT INTO vacation_request_status_history 
         (request_id, status, changed_by, comment) 
         VALUES ($1, 'approved', $2, 'Согласовано')`,
        [vacationRequestId, managerId]
      )

      const result = await query(
        `SELECT 
           json_agg(
             json_build_object(
               'id', vrsh.id,
               'status', vrsh.status,
               'changedAt', vrsh.changed_at,
               'changedBy', vrsh.changed_by,
               'changedByName', hu.last_name || ' ' || hu.first_name,
               'comment', vrsh.comment
             ) ORDER BY vrsh.changed_at
           ) as status_history
         FROM vacation_request_status_history vrsh
         LEFT JOIN users hu ON vrsh.changed_by = hu.id
         WHERE vrsh.request_id = $1`,
        [vacationRequestId]
      )

      const statusHistory = result.rows[0].status_history
      assert.ok(Array.isArray(statusHistory), 'status_history should be an array')
      assert.strictEqual(statusHistory.length, 2, 'Should have two history entries')
      
      const approvedEntry = statusHistory.find(h => h.status === 'approved')
      assert.ok(approvedEntry, 'Should have approved entry')
      assert.ok(approvedEntry.id, 'Should have id')
      assert.strictEqual(approvedEntry.status, 'approved', 'Status should be approved')
      assert.ok(approvedEntry.changedAt, 'Should have changedAt')
      assert.strictEqual(approvedEntry.changedBy, managerId, 'changedBy should match manager ID')
      assert.strictEqual(
        approvedEntry.changedByName, 
        `${MANAGER.lastName} ${MANAGER.firstName}`,
        'changedByName should match manager name'
      )
      assert.strictEqual(approvedEntry.comment, 'Согласовано', 'Should have comment')
    })
  })
})
