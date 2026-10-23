import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractLdapDn, dnOus, normalizeOus, departmentIdFromDn } from '../lib/ldapDn.js'

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
