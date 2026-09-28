import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const SUFFIX = `@word-search-${Date.now()}.test`
const MARK = `Зюйдов${Date.now() % 100000}`
let alexey
let boris
let tagId

async function mkUser(tag, firstName) {
  const hash = await bcrypt.hash('password123', 4)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
     VALUES ($1, $2, $3, $4, 'Специалист', 'employee', '2020-01-01', 'active') RETURNING id`,
    [`${tag}${SUFFIX}`, hash, firstName, MARK]
  )).rows[0].id
  await query("INSERT INTO user_organizations (user_id, org_id, org_role, is_active) VALUES ($1, 1, 'employee', true)", [id])
  return id
}

async function search(q) {
  const token = await login('admin@example.com')
  const res = await fetch(`${BASE}/users/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Organization-Id': '1' },
  })
  assert.strictEqual(res.status, 200)
  return (await res.json()).map((u) => u.id).filter((id) => id === alexey || id === boris)
}

describe('Поиск сотрудников по началу слова', () => {
  before(async () => {
    alexey = await mkUser('alexey', 'Алексей')
    boris = await mkUser('boris', 'Борис')
    tagId = (await query('INSERT INTO skills_dictionary (name, organization_id) VALUES ($1, 1) RETURNING id', [`${MARK}ский клуб`])).rows[0].id
    await query('INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2)', [boris, tagId])
  })

  after(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
    await query('DELETE FROM skills_dictionary WHERE id = $1', [tagId])
  })

  it('кусок из середины слова не находит', async () => {
    assert.deepStrictEqual(await search('лексей'), [])
    assert.deepStrictEqual(await search(MARK.slice(2)), [])
  })

  it('начало слова находит', async () => {
    assert.deepStrictEqual(await search('Алекс'), [alexey])
  })

  it('несколько слов — каждое по началу', async () => {
    assert.deepStrictEqual(await search(`Алекс ${MARK.slice(0, 4)}`), [alexey])
  })

  it('совпадения по тегу идут первыми', async () => {
    assert.deepStrictEqual(await search(MARK), [boris, alexey])
  })
})
