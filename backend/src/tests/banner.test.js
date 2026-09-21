import { describe, it, before, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import { pool, query } from '../config/database.js'
import { BASE, PASSWORD, login } from './helpers.js'

const SUFFIX = '@banner.test'
const SLUG_PREFIX = 'banner-test-'

async function call(method, path, token, body, org) {
  const headers = {}
  if (org !== null) headers['x-organization-id'] = String(org)
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('json') ? await res.json().catch(() => null) : null
  return { status: res.status, data }
}

async function mkOrg(name, slug) {
  return (await query('INSERT INTO organizations (name, slug, is_active) VALUES ($1, $2, true) RETURNING id', [name, slug])).rows[0].id
}

async function mkUser({ email, role = 'employee', orgId, orgRole = role }) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const id = (await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
     VALUES ($1, $2, 'Пётр', 'Пробников', 'Специалист', $3, '2020-01-01', 'active') RETURNING id`,
    [email, hash, role])).rows[0].id
  await query('INSERT INTO user_organizations (user_id, org_id, org_role) VALUES ($1, $2, $3)', [id, orgId, orgRole])
  return { id, email, token: null }
}

async function tokenFor(user) {
  if (!user.token) user.token = await login(user.email)
  return user.token
}

async function cleanupFixtures() {
  const orgIds = (await query('SELECT id FROM organizations WHERE slug LIKE $1', [`${SLUG_PREFIX}%`])).rows.map((r) => r.id)
  await query('DELETE FROM app_banners WHERE scope = $1 OR organization_id = ANY($2::int[])', ['global', orgIds])
  await query('DELETE FROM users WHERE email LIKE $1', [`%${SUFFIX}`])
  if (orgIds.length > 0) {
    await query('DELETE FROM organizations WHERE id = ANY($1)', [orgIds])
  }
}

let orgA, orgB, superadmin, orgAdminA, employeeA

before(async () => {
  await cleanupFixtures()
})

beforeEach(async () => {
  const stamp = Date.now()
  orgA = await mkOrg('Баннер Тест А', `${SLUG_PREFIX}a-${stamp}`)
  orgB = await mkOrg('Баннер Тест Б', `${SLUG_PREFIX}b-${stamp}`)
  superadmin = await mkUser({ email: `sa${SUFFIX}`, role: 'superadmin', orgId: orgA, orgRole: 'admin' })
  orgAdminA = await mkUser({ email: `admin-a${SUFFIX}`, role: 'employee', orgId: orgA, orgRole: 'admin' })
  employeeA = await mkUser({ email: `emp-a${SUFFIX}`, role: 'employee', orgId: orgA })
})

afterEach(async () => {
  await cleanupFixtures()
})

after(() => pool.end())

describe('US-1. «Супер-админ ставит глобальный баннер»', () => {
  it('Given супер-админ, When PUT /admin/banner с level/text, Then 200 и значения сохранены', async () => {
    const token = await tokenFor(superadmin)
    const res = await call('PUT', '/admin/banner', token, { level: 'warning', text: 'Плановые работы ночью' }, orgA)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.level, 'warning')
    assert.strictEqual(res.data.isActive, true)
  })

  it('Then GET /admin/banner возвращает сохранённые значения', async () => {
    const token = await tokenFor(superadmin)
    await call('PUT', '/admin/banner', token, { level: 'warning', text: 'Плановые работы ночью' }, orgA)
    const res = await call('GET', '/admin/banner', token, undefined, orgA)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.level, 'warning')
    assert.strictEqual(res.data.text, 'Плановые работы ночью')
    assert.strictEqual(res.data.isActive, true)
  })

  it('Then любой сотрудник видит глобальный баннер в GET /banner', async () => {
    const saToken = await tokenFor(superadmin)
    await call('PUT', '/admin/banner', saToken, { level: 'warning', text: 'Плановые работы ночью' }, orgA)
    const res = await call('GET', '/banner', await tokenFor(employeeA), undefined, orgA)
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(res.data.global, { level: 'warning', text: 'Плановые работы ночью' })
  })
})

describe('US-2. «Админ организации ставит свой баннер»', () => {
  it('Given админ организации А, When PUT /admin/banner/org, Then 200', async () => {
    const token = await tokenFor(orgAdminA)
    const res = await call('PUT', '/admin/banner/org', token, { level: 'info', text: 'Собрание в пятницу' }, orgA)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.level, 'info')
  })

  it('Then GET /banner с X-Organization-Id организации А видит org-баннер, с чужой — null', async () => {
    await call('PUT', '/admin/banner/org', await tokenFor(orgAdminA), { level: 'info', text: 'Собрание в пятницу' }, orgA)
    const inA = await call('GET', '/banner', await tokenFor(employeeA), undefined, orgA)
    assert.deepStrictEqual(inA.data.org, { level: 'info', text: 'Собрание в пятницу' })
    const inB = await call('GET', '/banner', await tokenFor(employeeA), undefined, orgB)
    assert.strictEqual(inB.data.org, null)
  })

  it('Then GET /banner без X-Organization-Id возвращает org: null', async () => {
    await call('PUT', '/admin/banner/org', await tokenFor(orgAdminA), { level: 'info', text: 'Собрание в пятницу' }, orgA)
    const res = await call('GET', '/banner', await tokenFor(superadmin), undefined, null)
    assert.strictEqual(res.data.org, null)
  })
})

describe('US-3. «Права»', () => {
  it('Given сотрудник, When PUT /admin/banner, Then 403', async () => {
    const res = await call('PUT', '/admin/banner', await tokenFor(employeeA), { level: 'info', text: 'нельзя' }, orgA)
    assert.strictEqual(res.status, 403)
  })

  it('Given сотрудник, When PUT /admin/banner/org, Then 403', async () => {
    const res = await call('PUT', '/admin/banner/org', await tokenFor(employeeA), { level: 'info', text: 'нельзя' }, orgA)
    assert.strictEqual(res.status, 403)
  })

  it('Given админ организации А, When PUT /admin/banner/org с заголовком организации Б, Then 403', async () => {
    const res = await call('PUT', '/admin/banner/org', await tokenFor(orgAdminA), { level: 'info', text: 'чужая org' }, orgB)
    assert.strictEqual(res.status, 403)
  })
})

describe('US-4. «Валидация»', () => {
  it('When level вне enum, Then 400', async () => {
    const res = await call('PUT', '/admin/banner', await tokenFor(superadmin), { level: 'critical', text: 'текст' }, orgA)
    assert.strictEqual(res.status, 400)
  })

  it('When text длиннее 500 символов, Then 400', async () => {
    const res = await call('PUT', '/admin/banner', await tokenFor(superadmin), { level: 'info', text: 'а'.repeat(501) }, orgA)
    assert.strictEqual(res.status, 400)
  })

  it('When пустой text при активном баннере, Then 400', async () => {
    const res = await call('PUT', '/admin/banner', await tokenFor(superadmin), { level: 'info', text: '   ' }, orgA)
    assert.strictEqual(res.status, 400)
  })
})

describe('US-5. «Деактивация»', () => {
  it('Given активный баннер, When PUT isActive=false, Then GET /banner возвращает null', async () => {
    const saToken = await tokenFor(superadmin)
    await call('PUT', '/admin/banner', saToken, { level: 'danger', text: 'Авария' }, orgA)
    const off = await call('PUT', '/admin/banner', saToken, { level: 'danger', text: '', isActive: false }, orgA)
    assert.strictEqual(off.status, 200)
    assert.strictEqual(off.data.isActive, false)

    const res = await call('GET', '/banner', await tokenFor(employeeA), undefined, orgA)
    assert.strictEqual(res.data.global, null)
  })

  it('Then org-баннер тоже деактивируется', async () => {
    await call('PUT', '/admin/banner/org', await tokenFor(orgAdminA), { level: 'warning', text: 'Отключение света' }, orgA)
    const off = await call('PUT', '/admin/banner/org', await tokenFor(orgAdminA), { level: 'warning', text: '', isActive: false }, orgA)
    assert.strictEqual(off.status, 200)
    const res = await call('GET', '/banner', await tokenFor(employeeA), undefined, orgA)
    assert.strictEqual(res.data.org, null)
  })
})
