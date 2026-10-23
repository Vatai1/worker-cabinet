import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractLdapDn, dnOus, dnOuNames, normalizeOus, departmentIdFromDn, resolveDepartmentFromDn } from '../lib/ldapDn.js'

const DN = 'CN=Иванов\\, Иван,OU=Users,OU=IT-Dept,OU=Moscow,DC=corp,DC=local'

test('extractLdapDn: известные ключи, массив и произвольное имя claim', () => {
  assert.equal(extractLdapDn({ LDAP_ENTRY_DN: [DN] }), DN)
  assert.equal(extractLdapDn({ ldap_dn: DN }), DN)
  assert.equal(extractLdapDn({ DN }), DN)
  assert.equal(extractLdapDn({ email: 'a@b.c', my_custom_dn: DN }), DN)
  assert.equal(extractLdapDn({ email: 'a@b.c' }), null)
  assert.equal(extractLdapDn(undefined), null)
})

test('dnOus: все OU от глубокого к корню, экранирование, регистр', () => {
  assert.deepEqual(dnOus(DN), ['users', 'it-dept', 'moscow'])
  assert.deepEqual(dnOus('cn=x,ou=A\\, B,dc=c'), ['a, b'])
  assert.deepEqual(dnOus(null), [])
})

test('normalizeOus: trim, lower, без пустых и дублей', () => {
  assert.deepEqual(normalizeOus([' IT-Dept ', 'it-dept', '', 'Moscow']), ['it-dept', 'moscow'])
  assert.deepEqual(normalizeOus(null), [])
})

test('departmentIdFromDn: побеждает самый глубокий OU', async () => {
  const db = { query: async () => ({ rows: [{ id: 1, ldap_ous: ['moscow'] }, { id: 2, ldap_ous: ['x', 'it-dept'] }] }) }
  assert.equal(await departmentIdFromDn(DN, 5, db), 2)
  assert.equal(await departmentIdFromDn(DN, null, db), null)
  assert.equal(await departmentIdFromDn('cn=x,dc=y', 5, db), null)
})

function fakeDb({ matched = [], byName = [] } = {}) {
  const calls = []
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params })
      if (sql.includes('ldap_ous && ')) return { rows: matched }
      if (sql.includes('lower(name)')) return { rows: byName }
      if (sql.startsWith('INSERT')) return { rows: [{ id: 99 }] }
      return { rows: [] }
    },
  }
}

test('dnOuNames: исходный регистр', () => {
  assert.deepEqual(dnOuNames(DN), ['Users', 'IT-Dept', 'Moscow'])
})

test('resolveDepartmentFromDn: совпадение по коду', async () => {
  const db = fakeDb({ matched: [{ id: 2, ldap_ous: ['it-dept'] }] })
  assert.deepEqual(await resolveDepartmentFromDn(DN, 5, db), { deptId: 2, created: false })
  assert.equal(db.calls.length, 1)
})

test('resolveDepartmentFromDn: нет совпадения — создаётся отдел по первому OU', async () => {
  const db = fakeDb()
  assert.deepEqual(await resolveDepartmentFromDn(DN, 5, db), { deptId: 99, created: true })
  assert.deepEqual(db.calls.at(-1).params, ['Users', 5, 'users'])
})

test('resolveDepartmentFromDn: отдел с таким названием есть — ему добавляется код', async () => {
  const db = fakeDb({ byName: [{ id: 7 }] })
  assert.deepEqual(await resolveDepartmentFromDn(DN, 5, db), { deptId: 7, created: false })
  assert.match(db.calls.at(-1).sql, /array_append/)
  assert.deepEqual(db.calls.at(-1).params, ['users', 7])
})

test('resolveDepartmentFromDn: в DN нет OU — отдел не определяется', async () => {
  assert.deepEqual(await resolveDepartmentFromDn('cn=x,dc=y', 5, fakeDb()), { deptId: null, created: false })
})
