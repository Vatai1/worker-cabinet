import { expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'

export const API = 'http://localhost:5000/api'
export const PASSWORD = 'password123'
export const THIS_YEAR = new Date().getFullYear()
export const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export const iso = (offsetDays: number) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const ruDate = (isoStr: string) => isoStr.split('-').reverse().join('.')
export const monthName = (isoStr: string) => RU_MONTHS[parseInt(isoStr.slice(5, 7), 10) - 1]
export const dayOfMonth = (isoStr: string) => parseInt(isoStr.slice(8, 10), 10)
export const rangeText = (s: string, e: string, days: number) => `${ruDate(s)} - ${ruDate(e)} (${days} дней)`

export function workdayOffset(minOffset: number) {
  let offset = minOffset
  for (;;) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    if (d.getDay() !== 0 && d.getDay() !== 6) return offset
    offset += 1
  }
}

export type Role = 'employee' | 'manager' | 'hr' | 'admin'

export interface FixtureUser {
  id: number
  email: string
  lastName: string
  firstName: string
  token: string
}

export class World {
  api!: APIRequestContext
  adminToken = ''
  users: Record<string, FixtureUser> = {}
  departments: Record<string, number> = {}

  orgId = 0

  constructor(readonly ns: string, private readonly org: number | string) {}

  async init() {
    this.api = await pwRequest.newContext()
    this.adminToken = await this.login('admin@example.com')
    if (typeof this.org === 'number') {
      this.orgId = this.org
      return
    }
    const res = await this.api.get(`${API}/organizations`, { headers: { Authorization: `Bearer ${this.adminToken}` } })
    const orgs = (await res.json()) as Array<{ id: number; slug: string }>
    const found = orgs.find((o) => o.slug === this.org)
    if (!found) throw new Error(`учреждение ${this.org} не найдено среди учреждений администратора`)
    this.orgId = found.id
  }

  headers(token = this.adminToken) {
    return { Authorization: `Bearer ${token}`, 'x-organization-id': String(this.orgId) }
  }

  async call<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: unknown, token = this.adminToken): Promise<{ status: number; body: T }> {
    const res = await this.api.fetch(`${API}${path}`, { method, headers: this.headers(token), data })
    const body = (await res.json().catch(() => null)) as T
    return { status: res.status(), body }
  }

  async ok<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: unknown, token = this.adminToken): Promise<T> {
    const res = await this.call<T>(method, path, data, token)
    if (res.status >= 300) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(res.body)}`)
    return res.body
  }

  async login(email: string) {
    const res = await this.api.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })
    const body = await res.json()
    if (!body.token) throw new Error(`login failed for ${email}: ${JSON.stringify(body)}`)
    return body.token as string
  }

  email(key: string) {
    return `e2e.${this.ns}.${key}@example.com`
  }

  async ensureDepartment(key: string, name: string) {
    const list = await this.ok<Array<{ id: number; name: string }>>('GET', '/dictionaries/departments')
    const found = list.find((d) => d.name === name)
    const id = found?.id ?? (await this.ok<{ id: number }>('POST', '/dictionaries/departments', { name })).id
    await this.ok('PUT', `/dictionaries/departments/${id}`, {
      name, manager_id: null, parent_id: null, vacation_requests_blocked: false,
      vac_parent_sees_child: true, vac_child_sees_parent: true, vac_parent_approves: true,
      emp_parent_sees_child: false, emp_child_sees_parent: false,
    })
    this.departments[key] = id
    return id
  }

  async ensureUser(key: string, opts: { lastName: string; firstName: string; role: Role; department?: string; position?: string }) {
    const email = this.email(key)
    const reg = await this.api.post(`${API}/auth/register`, {
      data: { email, password: PASSWORD, firstName: opts.firstName, lastName: opts.lastName, position: opts.position ?? 'Специалист', hireDate: '2015-01-01' },
    })
    let id: number
    if (reg.ok()) {
      id = (await reg.json()).user.id
    } else {
      const found = await this.ok<Array<{ id: number; email: string }>>('GET', `/users/search?q=${encodeURIComponent(opts.lastName)}&includeInactive=true`)
      const row = found.find((u) => u.email === email)
      if (row) {
        id = row.id
      } else {
        const all = await this.ok<Array<{ id: number; email: string }>>('GET', '/admin/users?limit=5000').catch(() => [])
        const hit = Array.isArray(all) ? all.find((u) => u.email === email) : undefined
        if (!hit) throw new Error(`не удалось найти пользователя ${email}`)
        id = hit.id
      }
    }
    await this.ok('PUT', '/users/bulk-status', { userIds: [id], status: 'active' })
    await this.call('POST', `/organizations/${this.orgId}/members`, { email, org_role: opts.role === 'admin' ? 'admin' : opts.role })
    const deptId = opts.department ? this.departments[opts.department] : null
    await this.ok('PUT', `/organizations/${this.orgId}/members/${id}`, { org_role: opts.role, department_id: deptId, is_active: true })
    await this.ok('PUT', `/admin/users/${id}/role`, { role: opts.role })
    await this.ok('PUT', `/admin/users/${id}`, { department_id: deptId, hire_date: '2015-01-01', manager_id: null, position: opts.position ?? 'Специалист' })
    for (const year of [THIS_YEAR, THIS_YEAR + 1]) {
      await this.ok('PATCH', `/vacation/balances/${id}`, { year, total_days: 40 })
    }
    const token = await this.login(email)
    this.users[key] = { id, email, lastName: opts.lastName, firstName: opts.firstName, token }
    return this.users[key]
  }

  async setDepartment(key: string, patch: Record<string, unknown>) {
    const id = this.departments[key]
    const list = await this.ok<Array<Record<string, unknown>>>('GET', '/dictionaries/departments')
    const cur = list.find((d) => d.id === id)
    if (!cur) throw new Error(`отдел ${key} не найден`)
    await this.ok('PUT', `/dictionaries/departments/${id}`, {
      name: cur.name, manager_id: cur.manager_id, parent_id: cur.parent_id, description: cur.description,
      vacation_requests_blocked: cur.vacation_requests_blocked,
      vac_parent_sees_child: cur.vac_parent_sees_child, vac_child_sees_parent: cur.vac_child_sees_parent, vac_parent_approves: cur.vac_parent_approves,
      emp_parent_sees_child: cur.emp_parent_sees_child, emp_child_sees_parent: cur.emp_child_sees_parent,
      ...patch,
    })
  }

  async departmentRow(key: string) {
    const list = await this.ok<Array<Record<string, unknown>>>('GET', '/dictionaries/departments')
    return list.find((d) => d.id === this.departments[key])
  }

  async createRequest(userKey: string, startDate: string, endDate: string, extra: Record<string, unknown> = {}) {
    return this.ok<{ id: number; approver_id: number | null; duration: number }>(
      'POST', '/vacation/requests', { startDate, endDate, vacationType: 'annual_paid', hasTravel: false, ...extra }, this.users[userKey].token,
    )
  }

  async approve(requestId: number) {
    return this.ok('POST', `/vacation/requests/${requestId}/approve`, {})
  }

  async requestRow(requestId: number) {
    const list = await this.ok<Array<{ id: number; status: string; approver_id: number | null }>>('GET', '/vacation/requests')
    return list.find((r) => r.id === requestId)
  }

  async cancelAllRequests() {
    for (const user of Object.values(this.users)) {
      const list = await this.ok<Array<{ id: number; status: string }>>('GET', `/vacation/requests?userId=${user.id}`, undefined, user.token).catch(() => [])
      for (const r of list.filter((r) => ['on_approval', 'approved'].includes(r.status))) {
        await this.call('POST', `/vacation/requests/${r.id}/cancel`, {})
      }
    }
  }

  async hierarchySnapshot() {
    return this.ok<{ data?: Record<string, unknown>; version?: number }>('GET', '/hierarchy')
  }

  async putHierarchy(data: { nodes?: unknown[]; edges?: unknown[]; viewport?: unknown; orgPositions?: unknown }) {
    const cur = await this.hierarchySnapshot()
    await this.ok('PUT', '/hierarchy', {
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      viewport: data.viewport ?? { x: 0, y: 0, zoom: 1 },
      orgPositions: data.orgPositions ?? {},
      baseVersion: cur.version ?? 0,
    })
  }

  async teardown() {
    await this.cancelAllRequests().catch(() => {})
    const ids = Object.values(this.users).map((u) => u.id)
    for (const key of Object.keys(this.departments)) {
      await this.setDepartment(key, { manager_id: null, parent_id: null }).catch(() => {})
    }
    if (ids.length) await this.call('PUT', '/users/bulk-status', { userIds: ids, status: 'inactive' })
    for (const id of Object.values(this.departments)) {
      await this.call('DELETE', `/dictionaries/departments/${id}`)
    }
    await this.api.dispose()
  }

  async loginPage(page: Page, userKey: string, cookies: Record<string, string> = {}) {
    const email = this.users[userKey]?.email ?? userKey
    const res = await this.api.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })
    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
    const token = setCookie.find((c) => c.startsWith('auth_token='))
    const csrf = setCookie.find((c) => c.startsWith('csrf_token='))
    if (!token) throw new Error(`login failed for ${email}`)
    const value = (c: string) => c.split('=')[1].split(';')[0]
    await page.context().addCookies([
      { name: 'auth_token', value: value(token), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
      { name: 'csrf_token', value: csrf ? value(csrf) : '', domain: 'localhost', path: '/', sameSite: 'Lax' },
      { name: 'active_org_id', value: String(this.orgId), domain: 'localhost', path: '/', sameSite: 'Lax' },
      { name: 'vacation_intro_seen', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
      { name: 'hr_panel_intro_seen', value: '1', domain: 'localhost', path: '/', sameSite: 'Lax' },
      ...Object.entries(cookies).map(([name, v]) => ({ name, value: v, domain: 'localhost', path: '/', sameSite: 'Lax' as const })),
    ])
  }
}

export async function openVacationPage(page: Page, path = '/vacation') {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Отпуска', exact: true })).toBeVisible({ timeout: 15000 })
}

export const monthCard = (page: Page, name: string) => page.getByTestId('month-card').filter({ hasText: name }).first()

export async function selectRange(page: Page, startIso: string, endIso: string) {
  await monthCard(page, monthName(startIso)).locator('[data-date-cell]').nth(dayOfMonth(startIso) - 1).click()
  await expect(page.getByText(/Выбрана дата:/)).toBeVisible({ timeout: 5000 })
  await monthCard(page, monthName(endIso)).locator('[data-date-cell]').nth(dayOfMonth(endIso) - 1).click()
  await expect(page.getByText(/Период:/)).toBeVisible({ timeout: 5000 })
}

export const myCard = (page: Page, text: string) => page.getByText(text, { exact: true }).locator('xpath=../..').first()

export async function expandMyCard(page: Page, text: string) {
  const card = page.getByText(text, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]').first()
  await card.waitFor({ state: 'visible', timeout: 15000 })
  const probe = card.getByText('Тип: ')
  if (!(await probe.isVisible().catch(() => false))) {
    await page.getByText(text, { exact: true }).locator('xpath=../..').click()
    await expect(probe).toBeVisible({ timeout: 5000 })
  }
  return card
}

export async function openTab(page: Page, name: RegExp | string) {
  await page.getByRole('button', { name, exact: typeof name === 'string' }).first().click()
}

export async function approvalCards(page: Page) {
  await openTab(page, /Согласование/)
  return page.getByTestId('approval-card')
}
