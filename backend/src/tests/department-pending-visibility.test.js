import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login, headers } from './helpers.js'

const STAMP = Date.now()
const deptIds = []
const users = {}

async function mkUser(key, deptId) {
  const email = `pending-${key}-${STAMP}@pending-visibility.test`
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status, department_id)
     VALUES ($1, $2, $3, 'Коллегов', 'Специалист', 'employee', '2015-01-01', 'active', $4) RETURNING id`,
    [email, hash, key, deptId]
  )).rows[0].id
  await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active, department_id) VALUES ($1, 1, 'employee', true, $2)", [id, deptId])
  users[key] = { id, email }
}

const requestIdsSeenBy = async (key, qs = '') => {
  const res = await fetch(`${BASE}/vacation/requests${qs}`, { headers: headers(await login(users[key].email)) })
  assert.strictEqual(res.status, 200)
  return (await res.json()).map((r) => r.id)
}

describe('Заявки на согласовании видны коллегам по отделу', () => {
  let pendingId

  before(async () => {
    for (const name of ['свой', 'чужой']) {
      deptIds.push((await query('INSERT INTO departments (name, organization_id) VALUES ($1, 1) RETURNING id', [`Видимость ${name} ${STAMP}`])).rows[0].id)
    }
    await mkUser('author', deptIds[0])
    await mkUser('colleague', deptIds[0])
    await mkUser('stranger', deptIds[1])
    pendingId = (await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, duration, vacation_type_id, status_id, organization_id)
       VALUES ($1, '2031-07-01', '2031-07-10', 10,
               (SELECT id FROM vacation_types WHERE code = 'annual_paid' AND organization_id = 1),
               (SELECT id FROM request_statuses WHERE code = 'on_approval'), 1)
       RETURNING id`,
      [users.author.id]
    )).rows[0].id
  })

  after(async () => {
    await query('DELETE FROM vacation_requests WHERE id = $1', [pendingId])
    await query('DELETE FROM users WHERE id = ANY($1)', [Object.values(users).map((u) => u.id)])
    await query('DELETE FROM departments WHERE id = ANY($1)', [deptIds])
  })

  it('коллега из того же отдела видит заявку на согласовании — в общем списке и по отделу', async () => {
    assert.ok((await requestIdsSeenBy('colleague')).includes(pendingId))
    assert.ok((await requestIdsSeenBy('colleague', `?departmentId=${deptIds[0]}`)).includes(pendingId))
  })

  it('сотрудник другого отдела её не видит', async () => {
    assert.ok(!(await requestIdsSeenBy('stranger')).includes(pendingId))
    assert.ok(!(await requestIdsSeenBy('stranger', `?departmentId=${deptIds[0]}`)).includes(pendingId))
  })
})
