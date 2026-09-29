import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login, getHrToken, headersJSON } from './helpers.js'
import { PRODUCTION_CALENDAR } from '../db/productionCalendar.js'

const EMAIL = `prodcal-${Date.now()}@prod-calendar.test`
let userId

async function call(method, path, body) {
  const token = await login(EMAIL)
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const createVacation = (startDate, endDate) => call('POST', '/vacation/requests', { startDate, endDate, vacationType: 'annual_paid', hasTravel: false })

describe('Производственный календарь 2027', () => {
  before(async () => {
    const hash = await bcrypt.hash('password123', 4)
    userId = (await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
       VALUES ($1, $2, 'Иван', 'Календарный', 'Специалист', 'employee', '2015-01-01', 'active') RETURNING id`,
      [EMAIL, hash]
    )).rows[0].id
    await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'employee', true)", [userId])
    await query(
      `INSERT INTO vacation_balances (user_id, year, total_days, used_days, reserved_days, available_days, organization_id)
       VALUES ($1, 2027, 80, 0, 0, 80, 1)`,
      [userId]
    )
  })

  after(async () => {
    await query('UPDATE vacation_settings SET allow_over_balance = false WHERE organization_id = 1')
    await query('DELETE FROM vacation_request_status_history WHERE request_id IN (SELECT id FROM vacation_requests WHERE user_id = $1)', [userId])
    await query('DELETE FROM vacation_request_status_history WHERE changed_by = $1', [userId])
    await query('DELETE FROM vacation_requests WHERE user_id = $1', [userId])
    await query('DELETE FROM users WHERE id = $1', [userId])
  })

  it('в базе ровно данные консультанта: 14 праздников, 6 переносов, 4 сокращённых дня', async () => {
    const res = await call('GET', '/vacation/production-calendar?year=2027')
    assert.strictEqual(res.status, 200)
    const byKind = (k) => res.data.days.filter((d) => d.kind === k).map((d) => d.day)
    assert.strictEqual(res.data.days.length, PRODUCTION_CALENDAR[2027].length)
    assert.deepStrictEqual(byKind('transfer'), ['2027-02-22', '2027-05-03', '2027-05-10', '2027-06-14', '2027-11-05', '2027-12-31'])
    assert.deepStrictEqual(byKind('shortened'), ['2027-02-20', '2027-04-30', '2027-06-11', '2027-11-03'])
    assert.strictEqual(byKind('holiday').length, 14)
    assert.ok(byKind('holiday').includes('2027-01-02') && byKind('holiday').includes('2027-05-09'))
  })

  it('1–26 февраля 2027: вычитается только 23 февраля — 25 дней', async () => {
    const res = await createVacation('2027-02-01', '2027-02-26')
    assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    assert.strictEqual(res.data.duration, 25)
    assert.strictEqual(res.data.holidaysCount, 1)
    assert.strictEqual(res.data.returnDate, '2027-03-01')
  })

  it('выход на работу — первый рабочий день: после 05.03 (пятница, затем выходные и 8 марта) — 09.03, после 30.04 (1.05 праздник, 3.05 перенос) — 04.05', async () => {
    const march = await createVacation('2027-03-03', '2027-03-05')
    assert.strictEqual(march.status, 201, JSON.stringify(march.data))
    assert.strictEqual(march.data.returnDate, '2027-03-09')
    const april = await createVacation('2027-04-28', '2027-04-30')
    assert.strictEqual(april.status, 201, JSON.stringify(april.data))
    assert.strictEqual(april.data.returnDate, '2027-05-04')
  })

  it('1–10 мая 2027: 1 и 9 мая вычитаются, перенесённые 3 и 10 мая входят в отпуск — 8 дней', async () => {
    const res = await createVacation('2027-05-01', '2027-05-10')
    assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    assert.strictEqual(res.data.duration, 8)
  })

  it('без загруженного календаря год возвращается пустым, некорректный год — 400', async () => {
    const empty = await call('GET', '/vacation/production-calendar?year=2099')
    assert.strictEqual(empty.status, 200)
    assert.deepStrictEqual(empty.data.days, [])
    const bad = await call('GET', '/vacation/production-calendar?year=abc')
    assert.strictEqual(bad.status, 400)
  })

  it('настройка HR «сверх баланса»: выключена — 400, включена — 201, сотруднику менять нельзя', async () => {
    const setAllow = async (value) => fetch(`${BASE}/vacation/settings`, {
      method: 'PUT',
      headers: { ...headersJSON(await getHrToken()), 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
      body: JSON.stringify({ allowOverBalance: value }),
    })
    assert.strictEqual((await setAllow(false)).status, 200)
    const blocked = await createVacation('2027-07-01', '2027-09-30')
    assert.strictEqual(blocked.status, 400, JSON.stringify(blocked.data))
    assert.strictEqual((await call('PUT', '/vacation/settings', { allowOverBalance: true })).status, 403)
    assert.strictEqual((await setAllow(true)).status, 200)
    assert.deepStrictEqual((await call('GET', '/vacation/settings')).data, { allowOverBalance: true })
    const allowed = await createVacation('2027-07-01', '2027-09-30')
    assert.strictEqual(allowed.status, 201, JSON.stringify(allowed.data))
    assert.strictEqual((await setAllow(false)).status, 200)
  })
})
