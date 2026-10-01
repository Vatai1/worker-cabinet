import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { findOrCreateUser, keycloakOrgSource } from '../middleware/auth.js'

const STAMP = Date.now()
const createdOrgs = []
const createdUsers = []

const activeOrgs = async (userId) => (await query(
  'SELECT org_id FROM user_organizations WHERE user_id = $1 AND is_active ORDER BY org_id', [userId]
)).rows.map((r) => r.org_id)

const payload = (key, extra) => ({
  sub: `kc-org-${key}-${STAMP}`,
  email: `kc-org-${key}-${STAMP}@kc.test`,
  given_name: 'Кейклоков',
  family_name: key,
  ...extra,
})

describe('Организация из Keycloak', () => {
  after(async () => {
    await query('DELETE FROM users WHERE id = ANY($1)', [createdUsers])
    await query('DELETE FROM organizations WHERE id = ANY($1)', [createdOrgs])
  })

  it('без groups организация берётся из company — по названию без учёта регистра и кавычек', async () => {
    const org = (await query('INSERT INTO organizations (name, slug, is_active) VALUES ($1, $2, true) RETURNING id', [`ГКУ «Тест ${STAMP}»`, `kc-test-${STAMP}`])).rows[0].id
    createdOrgs.push(org)
    const kc = payload('a', { company: `  гку тест   ${STAMP} ` })
    assert.strictEqual(keycloakOrgSource(kc).source, 'company')
    const user = await findOrCreateUser(kc)
    createdUsers.push(user.id)
    assert.deepStrictEqual(await activeOrgs(user.id), [org])
  })

  it('сотрудник, ранее попавший в организацию по умолчанию, переносится в организацию из company', async () => {
    const kc = payload('b', {})
    const user = await findOrCreateUser(kc)
    createdUsers.push(user.id)
    assert.deepStrictEqual(await activeOrgs(user.id), [1])

    await findOrCreateUser({ ...kc, company: `Новая организация ${STAMP}` })
    const org = (await query('SELECT id FROM organizations WHERE name = $1', [`Новая организация ${STAMP}`])).rows[0]?.id
    assert.ok(org, 'неизвестная организация создаётся автоматически')
    createdOrgs.push(org)
    assert.deepStrictEqual(await activeOrgs(user.id), [org])
  })

  it('groups важнее company', () => {
    const { source, orgs } = keycloakOrgSource({ groups: ['/org-crct'], company: 'Что угодно' })
    assert.strictEqual(source, 'groups')
    assert.deepStrictEqual(orgs, [{ slug: 'crct' }])
  })
})
