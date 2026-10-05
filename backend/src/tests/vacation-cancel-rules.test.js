import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { BASE, login, headersJSON } from './helpers.js'

let employee
let blockedBefore
let balancesBefore
const createdIds = []

async function insertRequest(start, end, status) {
  const id = (await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, duration, vacation_type_id, status_id, organization_id)
     VALUES ($1, $2, $3, 3, (SELECT id FROM vacation_types WHERE code = 'annual_paid' AND organization_id = 1),
             (SELECT id FROM request_statuses WHERE code = $4), 1)
     RETURNING id`,
    [employee.id, start, end, status]
  )).rows[0].id
  createdIds.push(id)
  return id
}

async function cancel(email, id) {
  const res = await fetch(`${BASE}/vacation/requests/${id}/cancel`, {
    method: 'POST',
    headers: { ...headersJSON(await login(email)), 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const setBlocked = (value) => query('UPDATE departments SET vacation_requests_blocked = $1 WHERE id = $2', [value, employee.department_id])

describe('Отмена отпуска: ограничения', () => {
  before(async () => {
    employee = (await query("SELECT id, department_id FROM users WHERE email = 'ivanov@example.com'")).rows[0]
    blockedBefore = (await query('SELECT vacation_requests_blocked FROM departments WHERE id = $1', [employee.department_id])).rows[0].vacation_requests_blocked
    balancesBefore = (await query('SELECT id, used_days, reserved_days FROM vacation_balances WHERE user_id = $1', [employee.id])).rows
  })

  after(async () => {
    await setBlocked(blockedBefore)
    for (const b of balancesBefore) await query('UPDATE vacation_balances SET used_days = $2, reserved_days = $3 WHERE id = $1', [b.id, b.used_days, b.reserved_days])
    await query('DELETE FROM vacation_request_status_history WHERE request_id = ANY($1)', [createdIds])
    await query('DELETE FROM vacation_requests WHERE id = ANY($1)', [createdIds])
  })

  it('прошедший отпуск отменить нельзя — даже HR', async () => {
    const id = await insertRequest('2020-03-02', '2020-03-04', 'approved')
    for (const email of ['ivanov@example.com', 'elena@example.com']) {
      const res = await cancel(email, id)
      assert.strictEqual(res.status, 400, JSON.stringify(res.data))
      assert.match(res.data.error, /прошедший/)
    }
  })

  it('при запрете подачи заявок сотрудник не может отменить согласованный отпуск, но может — заявку на согласовании', async () => {
    await setBlocked(true)
    const approved = await insertRequest('2031-08-04', '2031-08-06', 'approved')
    const blockedRes = await cancel('ivanov@example.com', approved)
    assert.strictEqual(blockedRes.status, 403, JSON.stringify(blockedRes.data))
    assert.match(blockedRes.data.error, /HR закрыл подачу заявок/)

    const pending = await insertRequest('2031-09-01', '2031-09-03', 'on_approval')
    assert.strictEqual((await cancel('ivanov@example.com', pending)).status, 200)
  })

  it('HR может отменить согласованный отпуск и при запрете', async () => {
    await setBlocked(true)
    const approved = await insertRequest('2031-10-06', '2031-10-08', 'approved')
    const res = await cancel('elena@example.com', approved)
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
  })

  it('без запрета сотрудник отменяет согласованный будущий отпуск', async () => {
    await setBlocked(false)
    const approved = await insertRequest('2031-11-03', '2031-11-05', 'approved')
    assert.strictEqual((await cancel('ivanov@example.com', approved)).status, 200)
  })
})
