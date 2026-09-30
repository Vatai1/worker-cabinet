import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login, getHrToken } from './helpers.js'

const EMAIL = `dayoff-${Date.now()}@day-offs.test`
const MANAGER_EMAIL = `dayoff-mgr-${Date.now()}@day-offs.test`
let managerId
const ORG = { 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' }
let userId
let deptId

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token ?? await login(EMAIL)}`, 'Content-Type': 'application/json', ...ORG },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const hrCall = async (method, path, body) => call(method, path, body, await getHrToken())
const balance2027 = async () => (await query('SELECT total_days, reserved_days, used_days, available_days FROM vacation_balances WHERE user_id = $1 AND year = 2027', [userId])).rows[0]

describe('Отгулы и начисления дней', () => {
  before(async () => {
    const hash = await bcrypt.hash('password123', 4)
    deptId = (await query("INSERT INTO departments (name, organization_id, vacation_requests_blocked) VALUES ($1, 1, true) RETURNING id", [`Отгулы ${Date.now()}`])).rows[0].id
    userId = (await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status, department_id)
       VALUES ($1, $2, 'Олег', 'Отгульный', 'Специалист', 'employee', '2015-01-01', 'active', $3) RETURNING id`,
      [EMAIL, hash, deptId]
    )).rows[0].id
    await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active, department_id) VALUES ($1, 1, 'employee', true, $2)", [userId, deptId])
    await query('INSERT INTO vacation_balances (user_id, year, total_days, used_days, reserved_days, available_days, organization_id) VALUES ($1, 2027, 28, 0, 0, 28, 1)', [userId])
    managerId = (await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
       VALUES ($1, $2, 'Мария', 'Начальникова', 'Руководитель', 'manager', '2015-01-01', 'active') RETURNING id`,
      [MANAGER_EMAIL, hash]
    )).rows[0].id
    await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'manager', true)", [managerId])
    await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [managerId, deptId])
  })

  after(async () => {
    await query('DELETE FROM vacation_request_status_history WHERE request_id IN (SELECT id FROM vacation_requests WHERE user_id = $1)', [userId])
    await query('DELETE FROM vacation_request_status_history WHERE changed_by = $1', [userId])
    await query('DELETE FROM vacation_requests WHERE user_id = $1', [userId])
    await query('UPDATE departments SET manager_id = NULL WHERE id = $1', [deptId])
    await query('DELETE FROM users WHERE id = ANY($1)', [[userId, managerId]])
    await query('DELETE FROM departments WHERE id = $1', [deptId])
  })

  it('без отгулов заявка на отгул — 400, работник не может начислять себе', async () => {
    const res = await call('POST', '/vacation/requests', { startDate: '2027-03-01', endDate: '2027-03-01', vacationType: 'day_off' })
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.error, 'Недостаточно отгулов')
    const self = await call('POST', '/vacation/adjustments', { userId, kind: 'day_off', days: 1, comment: 'сам себе' })
    assert.strictEqual(self.status, 403)
  })

  it('HR начисляет отгулы и дни отпуска с обязательным комментарием', async () => {
    assert.strictEqual((await hrCall('POST', '/vacation/adjustments', { userId, kind: 'day_off', days: 2 })).status, 400)
    const dayOff = await hrCall('POST', '/vacation/adjustments', { userId, kind: 'day_off', days: 2, comment: 'за работу в выходной' })
    assert.strictEqual(dayOff.status, 201, JSON.stringify(dayOff.data))
    assert.strictEqual(dayOff.data.dayOffs.available, 2)
    const vac = await hrCall('POST', '/vacation/adjustments', { userId, kind: 'vacation', days: 3, year: 2027, comment: 'за ненормированный день' })
    assert.strictEqual(vac.status, 201, JSON.stringify(vac.data))
    assert.strictEqual((await balance2027()).total_days, 31)
    const noBalanceYet = await hrCall('POST', '/vacation/adjustments', { userId, kind: 'vacation', days: 2, year: 2029, comment: 'на год без баланса' })
    assert.strictEqual(noBalanceYet.status, 201, JSON.stringify(noBalanceYet.data))
    const created2029 = (await query('SELECT total_days, used_days FROM vacation_balances WHERE user_id = $1 AND year = 2029', [userId])).rows[0]
    assert.ok(created2029 && created2029.total_days >= 2 && created2029.used_days === 0, JSON.stringify(created2029))
    await hrCall('POST', '/vacation/adjustments', { userId, kind: 'vacation', days: -2, year: 2029, comment: 'откат' })
    const tooMuch = await hrCall('POST', '/vacation/adjustments', { userId, kind: 'day_off', days: -5, comment: 'списание' })
    assert.strictEqual(tooMuch.status, 400)
    const mine = await call('GET', '/vacation/adjustments')
    assert.strictEqual(mine.status, 200)
    assert.strictEqual(mine.data.items.length, 4)
    assert.strictEqual(mine.data.dayOffs.available, 2)
  })

  it('отгул берётся при заблокированной подаче отпусков, считается в рабочих днях и не трогает баланс отпуска', async () => {
    const vacation = await call('POST', '/vacation/requests', { startDate: '2027-03-01', endDate: '2027-03-01', vacationType: 'annual_paid' })
    assert.strictEqual(vacation.status, 403)
    const before = await balance2027()
    const res = await call('POST', '/vacation/requests', { startDate: '2027-03-05', endDate: '2027-03-09', vacationType: 'day_off', comment: 'отгул' })
    assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    assert.strictEqual(res.data.duration, 2)
    assert.deepStrictEqual(await balance2027(), before)
    const more = await call('POST', '/vacation/requests', { startDate: '2027-03-15', endDate: '2027-03-15', vacationType: 'day_off' })
    assert.strictEqual(more.status, 400)
    assert.strictEqual((await call('GET', '/vacation/adjustments')).data.dayOffs.pending, 2)
    const cancel = await call('POST', `/vacation/requests/${res.data.id}/cancel`, {})
    assert.ok([200, 204].includes(cancel.status), JSON.stringify(cancel.data))
    assert.deepStrictEqual(await balance2027(), before)
    assert.strictEqual((await call('GET', '/vacation/adjustments')).data.dayOffs.available, 2)
  })

  it('сводка по организации: HR видит работника с остатком отгулов и историю, работнику — 403', async () => {
    const all = await hrCall('GET', '/vacation/adjustments/all')
    assert.strictEqual(all.status, 200)
    const me = all.data.employees.find((e) => e.id === userId)
    assert.ok(me, 'работник с начислениями не попал в сводку')
    assert.strictEqual(me.day_off_available, 2)
    assert.strictEqual(me.vacation_granted, 3)
    assert.strictEqual(all.data.items.filter((i) => i.user_id === userId).length, 4)
    assert.strictEqual((await call('GET', '/vacation/adjustments/all')).status, 403)
  })

  it('руководитель начисляет и видит только своих подчинённых', async () => {
    const token = await login(MANAGER_EMAIL)
    const own = await call('POST', '/vacation/adjustments', { userId, kind: 'day_off', days: 1, comment: 'за дежурство' }, token)
    assert.strictEqual(own.status, 201, JSON.stringify(own.data))
    const foreign = await call('POST', '/vacation/adjustments', { userId: 1, kind: 'day_off', days: 1, comment: 'чужому' }, token)
    assert.strictEqual(foreign.status, 403)
    const vacationByManager = await call('POST', '/vacation/adjustments', { userId, kind: 'vacation', days: 1, year: 2027, comment: 'отпуск от руководителя' }, token)
    assert.strictEqual(vacationByManager.status, 403)
    const dayOffOnly = await call('GET', '/vacation/adjustments/all?kind=day_off', undefined, token)
    assert.ok(dayOffOnly.data.items.length > 0 && dayOffOnly.data.items.every((i) => i.kind === 'day_off'))
    const all = await call('GET', '/vacation/adjustments/all', undefined, token)
    assert.strictEqual(all.status, 200)
    assert.strictEqual(all.data.scope, 'subordinates')
    assert.deepStrictEqual(all.data.people.map((p) => p.id), [userId])
    assert.ok(all.data.items.every((i) => i.user_id === userId))
    assert.strictEqual((await call('GET', `/vacation/adjustments?userId=${userId}`, undefined, token)).status, 200)
    assert.strictEqual((await call('GET', '/vacation/adjustments?userId=1', undefined, token)).status, 403)
    const back = await call('POST', '/vacation/adjustments', { userId, kind: 'day_off', days: -1, comment: 'откат теста' }, token)
    assert.strictEqual(back.status, 201)
  })

  it('отгул согласует тот же человек, что и отпуск', async () => {
    const hr = await getHrToken()
    await call('POST', '/vacation/adjustments', { userId, kind: 'day_off', days: 1, comment: 'для проверки согласующего' }, hr)
    await query('UPDATE departments SET vacation_requests_blocked = false WHERE id = $1', [deptId])
    const vacation = await call('POST', '/vacation/requests', { startDate: '2027-06-01', endDate: '2027-06-02', vacationType: 'annual_paid' })
    const dayOff = await call('POST', '/vacation/requests', { startDate: '2027-06-07', endDate: '2027-06-07', vacationType: 'day_off' })
    assert.strictEqual(vacation.status, 201, JSON.stringify(vacation.data))
    assert.strictEqual(dayOff.status, 201, JSON.stringify(dayOff.data))
    assert.strictEqual(dayOff.data.approver_id, vacation.data.approver_id)
    assert.strictEqual(dayOff.data.approver_id, managerId)
  })

  it('чужие начисления видит HR, но не другой работник', async () => {
    assert.strictEqual((await hrCall('GET', `/vacation/adjustments?userId=${userId}`)).status, 200)
    const other = await call('GET', '/vacation/adjustments?userId=1')
    assert.strictEqual(other.status, 403)
  })
})
