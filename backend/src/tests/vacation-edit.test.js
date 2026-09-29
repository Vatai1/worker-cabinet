import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const SUFFIX = `@vac-edit-${Date.now()}.test`
const YEAR = new Date().getFullYear() + 1
let owner
let other

async function mkUser(tag) {
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
     VALUES ($1, $2, 'Иван', 'Редактируев', 'Специалист', 'employee', '2020-01-01', 'active') RETURNING id`,
    [`${tag}${SUFFIX}`, hash]
  )).rows[0].id
  await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'employee', true)", [id])
  await query(
    `INSERT INTO vacation_balances (user_id, year, total_days, used_days, reserved_days, available_days, organization_id)
     VALUES ($1, $2, 28, 0, 0, 28, 1)`,
    [id, YEAR]
  )
  return { id, email: `${tag}${SUFFIX}` }
}

async function call(method, path, email, body) {
  const token = await login(email)
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Organization-Id': '1', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const balance = async (userId) => (await query('SELECT reserved_days, available_days FROM vacation_balances WHERE user_id = $1 AND year = $2', [userId, YEAR])).rows[0]

describe('Редактирование заявки на отпуск', () => {
  let requestId

  before(async () => {
    owner = await mkUser('owner')
    other = await mkUser('other')
    const created = await call('POST', '/vacation/requests', owner.email, {
      startDate: `${YEAR}-03-02`, endDate: `${YEAR}-03-06`, vacationType: 'annual_paid', hasTravel: false, comment: 'исходная',
    })
    assert.strictEqual(created.status, 201, JSON.stringify(created.data))
    requestId = created.data.id
  })

  after(async () => {
    const ids = [owner.id, other.id]
    await query('DELETE FROM vacation_request_status_history WHERE changed_by = ANY($1) OR request_id IN (SELECT id FROM vacation_requests WHERE user_id = ANY($1))', [ids])
    await query('DELETE FROM vacation_requests WHERE user_id = ANY($1)', [ids])
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
  })

  it('автор меняет даты и комментарий, резерв на балансе пересчитывается', async () => {
    const before = await balance(owner.id)
    assert.strictEqual(before.reserved_days, 5)
    const res = await call('PUT', `/vacation/requests/${requestId}`, owner.email, {
      startDate: `${YEAR}-04-06`, endDate: `${YEAR}-04-15`, vacationType: 'annual_paid', hasTravel: false, comment: 'изменённая',
    })
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    assert.strictEqual(String(res.data.start_date).slice(0, 10), `${YEAR}-04-06`)
    assert.strictEqual(res.data.comment, 'изменённая')
    const after = await balance(owner.id)
    assert.strictEqual(after.reserved_days, res.data.duration)
    assert.strictEqual(after.available_days, 28 - res.data.duration)
  })

  it('данные о проезде сохраняются', async () => {
    const res = await call('PUT', `/vacation/requests/${requestId}`, owner.email, {
      startDate: `${YEAR}-04-06`, endDate: `${YEAR}-04-15`, vacationType: 'annual_paid', hasTravel: true, travelDestination: 'Сочи',
      travelChildren: [{ fullName: 'Иванов Пётр', birthDate: `${YEAR - 10}-05-01` }],
    })
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    assert.strictEqual(res.data.travel_destination, 'Сочи')
    assert.strictEqual(res.data.travel_children_count, 1)
  })

  it('чужую заявку редактировать нельзя, превышение баланса и прошлые даты отклоняются', async () => {
    const foreign = await call('PUT', `/vacation/requests/${requestId}`, other.email, {
      startDate: `${YEAR}-04-06`, endDate: `${YEAR}-04-10`, vacationType: 'annual_paid', hasTravel: false,
    })
    assert.strictEqual(foreign.status, 403)
    const tooLong = await call('PUT', `/vacation/requests/${requestId}`, owner.email, {
      startDate: `${YEAR}-06-01`, endDate: `${YEAR}-07-31`, vacationType: 'annual_paid', hasTravel: false,
    })
    assert.strictEqual(tooLong.status, 400)
    assert.match(tooLong.data.error, /Недостаточно дней/)
    const past = await call('PUT', `/vacation/requests/${requestId}`, owner.email, {
      startDate: '2020-01-10', endDate: '2020-01-12', vacationType: 'annual_paid', hasTravel: false,
    })
    assert.strictEqual(past.status, 400)
  })

  it('согласованную заявку редактировать нельзя', async () => {
    await query("UPDATE vacation_requests SET status_id = (SELECT id FROM request_statuses WHERE code = 'approved') WHERE id = $1", [requestId])
    const res = await call('PUT', `/vacation/requests/${requestId}`, owner.email, {
      startDate: `${YEAR}-04-06`, endDate: `${YEAR}-04-10`, vacationType: 'annual_paid', hasTravel: false,
    })
    assert.strictEqual(res.status, 400)
  })
})
