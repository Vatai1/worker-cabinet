import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, headers, login } from './helpers.js'

const SUFFIX = `@staff-reports-${Date.now()}.test`
const YEAR = new Date().getFullYear()
let deptId
let token

async function report(type, params = {}) {
  const qs = new URLSearchParams({ year: String(YEAR), departmentId: String(deptId), ...params })
  const res = await fetch(`${BASE}/users/reports/${type}?${qs}`, { headers: headers(token) })
  return { status: res.status, type: res.headers.get('content-type'), data: res.headers.get('content-type')?.includes('json') ? await res.json() : null }
}

describe('Отчёты по персоналу', () => {
  before(async () => {
    token = await login('elena@example.com')
    deptId = (await query('INSERT INTO departments (name, organization_id) VALUES ($1, 1) RETURNING id', [`Персонал ${SUFFIX}`])).rows[0].id
    const hash = await bcrypt.hash('password123', 4)
    for (const [tag, hire] of [['new', `${YEAR}-02-10`], ['old', '2015-03-01']]) {
      const id = (await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, position, role, department_id, hire_date, status)
         VALUES ($1, $2, 'Отчёт', $3, 'Аналитик', 'employee', $4, $5, 'active') RETURNING id`,
        [`${tag}${SUFFIX}`, hash, tag === 'new' ? 'Новичков' : 'Старожилов', deptId, hire]
      )).rows[0].id
      await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'employee', true)", [id])
    }
  })

  after(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
    await query('DELETE FROM departments WHERE id = $1', [deptId])
  })

  it('численность и приём считают сотрудников отдела', async () => {
    const hc = await report('headcount')
    assert.strictEqual(hc.status, 200)
    assert.deepStrictEqual(hc.data.rows.map((r) => [r.headcount, r.hired, r.manager]), [[2, 1, 'не назначен']])
    const hires = await report('hires')
    assert.deepStrictEqual(hires.data.rows.map((r) => r.name), ['Новичков Отчёт'])
    assert.strictEqual(hires.data.charts[0].series[0].values[1], 1)
  })

  it('стаж делит по группам, должности и структура отвечают', async () => {
    const t = await report('tenure')
    assert.deepStrictEqual(t.data.rows.map((r) => r.group).sort(), ['5 лет и больше', 'до 1 года'])
    const p = await report('positions')
    assert.deepStrictEqual(p.data.rows.map((r) => [r.position, r.headcount]), [['Аналитик', 2]])
    const s = await report('structure')
    assert.strictEqual(s.data.rows[0].headcount, 2)
    const a = await report('activity')
    assert.strictEqual(a.data.rows.length, 2)
    assert.ok(a.data.rows.every((r) => r.group === 'никогда не заходил'))
  })

  it('Excel выгружается, неизвестный отчёт — 404, сотруднику — 403', async () => {
    const x = await report('headcount', { format: 'xlsx' })
    assert.strictEqual(x.status, 200)
    assert.match(x.type, /spreadsheetml/)
    assert.strictEqual((await report('nope')).status, 404)
    const res = await fetch(`${BASE}/users/reports/headcount`, { headers: headers(await login('ivanov@example.com')) })
    assert.strictEqual(res.status, 403)
  })
})
