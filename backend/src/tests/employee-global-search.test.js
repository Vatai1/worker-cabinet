import { after, before, it } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import router from '../routes/users.js'
import { query, pool } from '../config/database.js'

const users = []
const orgs = []
const departments = []
const marker = `Поиск${Date.now()}`
const year = 2097
let server
let base
let token

async function search(filters = {}, orgId, cookieOrgId) {
  const response = await fetch(`${base}?${new URLSearchParams({ q: marker, page: '1', limit: '20', year: String(year), ...filters })}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(orgId ? { 'X-Organization-Id': String(orgId) } : {}),
      ...(cookieOrgId ? { Cookie: `active_org_id=${cookieOrgId}` } : {}),
    },
  })
  assert.equal(response.status, 200)
  return response.json()
}

before(async () => {
  for (let index = 0; index < 2; index++) {
    orgs.push((await query('INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id', [`${marker} ${index === 0 ? 'Утренняя' : 'Вечерняя'}`, `employee-search-${Date.now()}-${index}`])).rows[0].id)
    departments.push((await query('INSERT INTO departments (name, organization_id) VALUES ($1, $2) RETURNING id', [`${marker} отдел ${index}`, orgs[index]])).rows[0].id)
  }
  for (let index = 0; index < 3; index++) {
    users.push((await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, hire_date, role, status, department_id)
       VALUES ($1, 'unused', 'Тест', $2, 'Тест', CURRENT_DATE, $3, 'active', $4) RETURNING id`,
      [`employee-search-${index}-${Date.now()}@example.com`, marker, index === 0 ? 'superadmin' : 'employee', departments[index === 2 ? 1 : 0]]
    )).rows[0].id)
  }
  token = jwt.sign({ id: users[0] }, process.env.JWT_SECRET, { expiresIn: '5m' })
  for (const [userId, orgIndex, primary] of [[users[0], 0, true], [users[1], 0, true], [users[1], 1, false], [users[2], 1, true]]) {
    await query('INSERT INTO user_organizations (user_id, org_id, department_id, is_primary, is_active) VALUES ($1, $2, $3, $4, true)', [userId, orgs[orgIndex], departments[orgIndex], primary])
    await query('INSERT INTO vacation_balances (user_id, organization_id, year, total_days) VALUES ($1, $2, $3, $4)', [userId, orgs[orgIndex], year, orgIndex === 0 ? 28 : 44])
  }
  const app = express()
  app.use(cookieParser())
  app.use('/users', router)
  server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}/users/search`
})

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve))
  try {
    await query('DELETE FROM vacation_balances WHERE user_id = ANY($1::int[])', [users])
    await query('DELETE FROM user_organizations WHERE user_id = ANY($1::int[])', [users])
    await query('DELETE FROM users WHERE id = ANY($1::int[])', [users])
    await query('DELETE FROM departments WHERE id = ANY($1::int[])', [departments])
    await query('DELETE FROM organizations WHERE id = ANY($1::int[])', [orgs])
  } finally {
    await pool.end()
  }
})

it('глобальный поиск включает сотрудников других организаций независимо от cookie', async () => {
  const result = await search({}, undefined, orgs[0])
  assert.equal(result.total, 3)
  assert.deepEqual(result.data.map(row => row.id), users)
})

it('несколько балансов не дублируют сотрудника, используется баланс основной организации', async () => {
  const result = await search({ userId: String(users[1]) })
  assert.equal(result.total, 1)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].total_days, 28)
})

it('пагинация не теряет сотрудников с одинаковыми ФИО', async () => {
  const ids = []
  for (let page = 1; page <= 3; page++) {
    const result = await search({ page: String(page), limit: '1' })
    assert.equal(result.total, 3)
    ids.push(result.data[0].id)
  }
  assert.deepEqual(ids, users)
})

it('глобальный фильтр отдела учитывает неосновную организацию', async () => {
  const result = await search({ departmentId: String(departments[1]) })
  assert.deepEqual(result.data.map(row => row.id), users.slice(1))
})

it('поиск по названию находит неосновную организацию', async () => {
  const result = await search({ q: `${marker} Вечерняя` })
  assert.deepEqual(result.data.map(row => row.id), users.slice(1))
})

it('контекст организации ограничивает список и выбирает её отдел и баланс', async () => {
  const result = await search({ departmentId: String(departments[1]) }, orgs[1])
  assert.equal(result.total, 2)
  assert.deepEqual(result.data.map(row => row.id), users.slice(1))
  assert.ok(result.data.every(row => row.department_id === departments[1] && row.total_days === 44))
  const primaryOrg = await search({}, orgs[0])
  assert.deepEqual(primaryOrg.data.map(row => row.id), users.slice(0, 2))
})

it('без года и при выгрузке без пагинации сотрудники не повторяются', async () => {
  for (const filters of [{ year: '' }, { page: '' }]) {
    const result = await search(filters)
    const rows = Array.isArray(result) ? result : result.data
    assert.deepEqual(rows.map(row => row.id), users)
  }
})
