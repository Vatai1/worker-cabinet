import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, headers, login } from './helpers.js'

const SUFFIX = `@vac-reports-${Date.now()}.test`
const YEAR = 2031
let deptId
let userId
let idleId
let adminToken

async function report(type, token, params = {}) {
  const qs = new URLSearchParams({ year: String(YEAR), departmentId: String(deptId), ...params })
  const res = await fetch(`${BASE}/vacation/reports/${type}?${qs}`, { headers: headers(token) })
  return { status: res.status, type: res.headers.get('content-type'), data: res.headers.get('content-type')?.includes('json') ? await res.json() : null }
}

describe('Отчёты по отпускам', () => {
  before(async () => {
    adminToken = await login('admin@example.com')
    deptId = (await query("INSERT INTO departments (name, organization_id) VALUES ($1, 1) RETURNING id", [`Отчёты ${SUFFIX}`])).rows[0].id
    userId = (await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date, status)
       VALUES ($1, $2, 'Отчёт', 'Проверочный', 'Специалист', 'employee', $3, '2020-01-01', 'active') RETURNING id`,
      [`emp${SUFFIX}`, await bcrypt.hash('password123', 4), deptId]
    )).rows[0].id
    await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'employee', true)", [userId])
    idleId = (await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date, status)
       VALUES ($1, $2, 'Без', 'Заявления', 'Специалист', 'employee', $3, '2020-01-01', 'active') RETURNING id`,
      [`idle${SUFFIX}`, await bcrypt.hash('password123', 4), deptId]
    )).rows[0].id
    await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'employee', true)", [idleId])
    await query('INSERT INTO vacation_balances (user_id, organization_id, year, total_days, used_days, reserved_days, available_days) VALUES ($1, 1, $2, 28, 14, 0, 14)', [userId, YEAR])
    await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, duration, vacation_type_id, status_id, organization_id)
       VALUES ($1, $2, $3, 14, (SELECT id FROM vacation_types WHERE code = 'annual_paid' ORDER BY id LIMIT 1), (SELECT id FROM request_statuses WHERE code = 'approved'), 1)`,
      [userId, `${YEAR}-07-01`, `${YEAR}-07-14`]
    )
  })

  after(async () => {
    await query('DELETE FROM vacation_requests WHERE user_id = $1', [userId])
    await query('DELETE FROM users WHERE id = ANY($1::int[])', [[userId, idleId]])
    await query('DELETE FROM departments WHERE id = $1', [deptId])
  })

  it('остатки и распределение считают дни сотрудника', async () => {
    const balances = await report('balances', adminToken)
    assert.strictEqual(balances.status, 200)
    const own = balances.data.rows.find((r) => r.name === 'Проверочный Отчёт')
    assert.deepStrictEqual([own.total_days, own.used_days, own.available_days], [28, 14, 14])

    const plan = await report('plan', adminToken)
    const row = plan.data.rows.find((r) => r.name === 'Проверочный Отчёт')
    assert.deepStrictEqual([row.approved, row.pending, row.unplanned, row.longest, row.part14], [14, 0, 14, 14, 'есть'])
  })

  it('одновременные отсутствия показывают сотрудника в неделях отпуска', async () => {
    const res = await report('overlaps', adminToken)
    assert.strictEqual(res.status, 200)
    assert.ok(res.data.rows.length >= 2)
    assert.ok(res.data.rows.every((r) => r.names === 'Проверочный Отчёт' && r.total === 2 && r.share === 50))
  })

  it('заявления: подавший и не подавший в отделе, сводка и график по отделам', async () => {
    const res = await report('submissions', adminToken)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.title, `Заявления на отпуск ${YEAR} года по отделам`)
    const byName = Object.fromEntries(res.data.rows.map((r) => [r.name, r]))
    assert.deepStrictEqual(Object.keys(byName).sort(), ['Заявления Без', 'Проверочный Отчёт'])
    const done = byName['Проверочный Отчёт']
    assert.deepStrictEqual([done.state, done.approved, done.pending, done.days, done.first_start, done._tone.state], ['подал', 1, 0, 14, `01.07.${YEAR}`, 'success'])
    const idle = byName['Заявления Без']
    assert.deepStrictEqual([idle.state, idle.approved, idle.days, idle.first_start, idle._tone.state], ['не подал', 0, 0, '', 'danger'])
    assert.deepStrictEqual(res.data.summary.map((k) => k.value), [1, 1, 0, 0])
    const chart = res.data.charts.find((c) => c.id === 'departments')
    assert.deepStrictEqual(chart.series.map((sr) => [sr.name, sr.values]), [['Подали', [1]], ['Не подали', [1]]])
    const other = await report('submissions', adminToken, { year: String(YEAR + 1) })
    assert.ok(other.data.rows.every((r) => r.state === 'не подал'))
    const xlsx = await report('submissions', adminToken, { format: 'xlsx' })
    assert.match(xlsx.type, /spreadsheetml/)
  })

  it('все отчёты отвечают, Excel выгружается, неизвестный отчёт — 404', async () => {
    for (const type of ['submissions', 'unused', 'approvals', 'changes', 'day-offs', 'travel']) {
      const res = await report(type, adminToken)
      assert.strictEqual(res.status, 200, type)
      assert.ok(Array.isArray(res.data.columns) && Array.isArray(res.data.rows), type)
    }
    const xlsx = await report('balances', adminToken, { format: 'xlsx' })
    assert.strictEqual(xlsx.status, 200)
    assert.match(xlsx.type, /spreadsheetml/)
    assert.strictEqual((await report('nope', adminToken)).status, 404)
  })

  it('обычному сотруднику отчёты недоступны', async () => {
    const res = await report('balances', await login('ivanov@example.com'))
    assert.strictEqual(res.status, 403)
  })
})
