import { after, before, it } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import router from '../routes/organizations.js'
import { errorHandler } from '../middleware/errors.js'
import { query, pool } from '../config/database.js'

let server
let base
const users = []
const orgs = []
const tokens = []

async function request(method, path, body, token = tokens[0]) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, data: await response.json() }
}

before(async () => {
  const suffix = `${Date.now()}-${process.pid}`
  for (const role of ['employee', 'employee', 'superadmin']) {
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, position, hire_date, role)
       VALUES ($1, 'unused', 'Тест', 'Закрепления', 'Тест', CURRENT_DATE, $2) RETURNING id`,
      [`pins-${users.length}-${suffix}@example.com`, role]
    )
    users.push(result.rows[0].id)
    tokens.push(jwt.sign({ id: result.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '5m' }))
  }
  for (let index = 0; index < 3; index++) {
    const result = await query('INSERT INTO organizations (name, slug, is_active) VALUES ($1, $2, $3) RETURNING id', ['Тест закрепления', `pins-${index}-${suffix}`, index !== 2])
    orgs.push(result.rows[0].id)
  }
  await query('UPDATE organizations SET parent_id = $1 WHERE id = $2', [orgs[0], orgs[1]])
  for (const id of users.slice(0, 2)) {
    await query('INSERT INTO user_organizations (user_id, org_id, is_active) VALUES ($1, $2, true)', [id, orgs[0]])
  }
  const app = express()
  app.use(express.json())
  app.use('/organizations', router)
  app.use(errorHandler)
  server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}/organizations`
})

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve))
  try {
    await query('DELETE FROM user_organizations WHERE user_id = ANY($1::int[])', [users])
    await query('DELETE FROM organizations WHERE id = ANY($1::int[])', [orgs])
    await query('DELETE FROM users WHERE id = ANY($1::int[])', [users])
  } finally {
    await pool.end()
  }
})

it('проверяет авторизацию, идентификатор и логический признак', async () => {
  assert.equal((await request('PUT', `/${orgs[0]}/pin`, { is_pinned: true }, null)).status, 401)
  for (const id of ['abc', '0', '-1', '1.2']) {
    assert.equal((await request('PUT', `/${id}/pin`, { is_pinned: true })).status, 400)
  }
  assert.equal((await request('PUT', `/${orgs[0]}/pin`, { is_pinned: 'true' })).status, 400)
})

it('сохраняет персональное закрепление и допускает повторный запрос', async () => {
  for (let index = 0; index < 2; index++) {
    const result = await request('PUT', `/${orgs[0]}/pin`, { is_pinned: true })
    assert.equal(result.status, 200)
    assert.equal(result.data.is_pinned, true)
  }
  const own = await request('GET', '/')
  assert.equal(own.status, 200)
  assert.equal(own.data.find(org => org.id === orgs[0]).is_pinned, true)
  const other = await request('GET', '/', undefined, tokens[1])
  assert.equal(other.data.find(org => org.id === orgs[0]).is_pinned, false)
})

it('запрещает закрепление без активного членства', async () => {
  assert.equal((await request('PUT', `/${orgs[1]}/pin`, { is_pinned: true })).status, 403)
  await query('INSERT INTO user_organizations (user_id, org_id, is_active) VALUES ($1, $2, false)', [users[0], orgs[1]])
  assert.equal((await request('PUT', `/${orgs[1]}/pin`, { is_pinned: true })).status, 403)
})

it('поддерживает суперадминистратора без членства и возвращает иерархию', async () => {
  assert.equal((await request('PUT', `/${orgs[1]}/pin`, { is_pinned: true }, tokens[2])).status, 200)
  const result = await request('GET', '/', undefined, tokens[2])
  const org = result.data.find(item => item.id === orgs[1])
  assert.equal(org.is_pinned, true)
  assert.equal(org.parent_id, orgs[0])
  assert.equal((await request('PUT', `/${orgs[2]}/pin`, { is_pinned: true }, tokens[2])).status, 404)
})

it('снимает закрепление', async () => {
  assert.equal((await request('PUT', `/${orgs[0]}/pin`, { is_pinned: false })).status, 200)
  const result = await request('GET', '/')
  assert.equal(result.data.find(org => org.id === orgs[0]).is_pinned, false)
})
