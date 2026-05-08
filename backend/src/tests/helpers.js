import assert from 'node:assert'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const BASE = 'http://localhost:5000/api'
export const PASSWORD = 'password123'

const CACHE_FILE = join(tmpdir(), 'worker-cabinet-test-tokens.json')
const CACHE_TTL = 5 * 60 * 1000

export async function tryLogin(email, password = PASSWORD) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.status !== 200) return null
  const data = await res.json()
  return data.token
}

export async function login(email, password = PASSWORD) {
  const token = await tryLogin(email, password)
  assert.ok(token, `Login failed for ${email}`)
  return token
}

export function headers(token) {
  return { Authorization: `Bearer ${token}` }
}

export function headersJSON(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const raw = readFileSync(CACHE_FILE, 'utf8')
    const cached = JSON.parse(raw)
    if (Date.now() - cached.ts > CACHE_TTL) {
      try { unlinkSync(CACHE_FILE) } catch {}
      return null
    }
    return cached
  } catch {
    return null
  }
}

function writeCache(data) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({ ...data, ts: Date.now() }))
  } catch {}
}

let _cache = null
let _pending = null

async function resolveUsers() {
  if (_cache) return _cache
  if (_pending) return _pending
  _pending = doResolve()
  try {
    _cache = await _pending
    return _cache
  } finally {
    _pending = null
  }
}

async function doResolve() {
  const fileCache = readCache()
  if (fileCache && fileCache.tokens) {
    return fileCache.tokens
  }

  let bootstrapToken = await tryLogin('admin@example.com')
  if (!bootstrapToken) {
    bootstrapToken = await tryLogin('elena@example.com')
  }
  if (!bootstrapToken) {
    bootstrapToken = await tryLogin('maria@example.com')
  }
  if (!bootstrapToken) {
    bootstrapToken = await tryLogin('anna@example.com')
  }
  assert.ok(bootstrapToken, 'No admin or HR user could login')

  const res = await fetch(`${BASE}/users`, { headers: headers(bootstrapToken) })
  const users = await res.json()

  const admin = users.find(u => u.role === 'admin')
  const hr = users.find(u => u.role === 'hr')
  const manager = users.find(u => u.role === 'manager')
  const employee = users.find(u => u.role === 'employee')
  const employee2 = users.filter(u => u.role === 'employee').find(u => u.id !== employee?.id)

  const tokens = {
    adminToken: bootstrapToken,
    adminUser: admin,
    hrToken: null,
    hrUser: hr,
    managerToken: null,
    managerUser: manager,
    employeeToken: null,
    employeeUser: employee,
    employee2Token: null,
    employee2User: employee2,
  }

  if (hr) tokens.hrToken = await tryLogin(hr.email)
  if (manager) tokens.managerToken = await tryLogin(manager.email)
  if (employee) tokens.employeeToken = await tryLogin(employee.email)
  if (employee2) tokens.employee2Token = await tryLogin(employee2.email)

  writeCache({ tokens })

  return tokens
}

export async function getAdminToken() {
  return (await resolveUsers()).adminToken
}

export async function getHrToken() {
  return (await resolveUsers()).hrToken
}

export async function getHrUser() {
  return (await resolveUsers()).hrUser
}

export async function getManagerToken() {
  return (await resolveUsers()).managerToken
}

export async function getManagerUser() {
  return (await resolveUsers()).managerUser
}

export async function getEmployeeToken() {
  return (await resolveUsers()).employeeToken
}

export async function getEmployeeUser() {
  return (await resolveUsers()).employeeUser
}

export async function getEmployee2Token() {
  return (await resolveUsers()).employee2Token
}

export async function getEmployee2User() {
  return (await resolveUsers()).employee2User
}

export async function getFirstDepartment() {
  const token = await getAdminToken()
  const res = await fetch(`${BASE}/departments`, { headers: headers(token) })
  const depts = await res.json()
  return depts[0]
}

export async function getSecondDepartment() {
  const token = await getAdminToken()
  const res = await fetch(`${BASE}/departments`, { headers: headers(token) })
  const depts = await res.json()
  return depts[1]
}
