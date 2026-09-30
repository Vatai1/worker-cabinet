import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import WebSocket from 'ws'
import { query } from '../config/database.js'
import { BASE, headers, headersJSON, getAdminToken, getEmployeeToken, getEmployeeUser } from './helpers.js'

const MARK = `telemetry-test-${Date.now()}`

async function onlineStatusOf(userId) {
  const res = await fetch(`${BASE}/admin/online`, { headers: headers(await getAdminToken()) })
  assert.strictEqual(res.status, 200)
  return (await res.json()).users.find((u) => u.id === userId)
}

function openSocket(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, 'ws').replace(/\/api$/, '/ws'), {
      headers: { Cookie: `auth_token=${token}`, Origin: 'http://localhost:3000' },
    })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

const waitFor = async (check) => {
  for (let i = 0; i < 20; i++) {
    const value = await check()
    if (value) return value
    await new Promise((r) => setTimeout(r, 100))
  }
  return check()
}

describe('Кто на сайте и телеметрия', () => {
  after(async () => {
    await query("DELETE FROM error_log WHERE message = $1", [MARK])
    await query('DELETE FROM bug_reports WHERE title = $1', [MARK])
  })

  it('статус: вкладка открыта без активности — away, после activity — online, после закрытия — offline с lastSeenAt', async () => {
    const employee = await getEmployeeUser()
    const ws = await openSocket(await getEmployeeToken())
    try {
      assert.strictEqual((await waitFor(async () => {
        const u = await onlineStatusOf(employee.id)
        return u?.status === 'away' ? u : null
      }))?.status, 'away')
      ws.send(JSON.stringify({ event: 'activity' }))
      const online = await waitFor(async () => {
        const u = await onlineStatusOf(employee.id)
        return u?.status === 'online' ? u : null
      })
      assert.strictEqual(online?.status, 'online')
      assert.ok(online.since)
    } finally {
      ws.close()
    }
    const offline = await waitFor(async () => {
      const u = await onlineStatusOf(employee.id)
      return u?.status === 'offline' ? u : null
    })
    assert.strictEqual(offline?.status, 'offline')
    assert.ok(offline.lastSeenAt)
  })

  it('/admin/online недоступен работнику', async () => {
    const res = await fetch(`${BASE}/admin/online`, { headers: headers(await getEmployeeToken()) })
    assert.strictEqual(res.status, 403)
  })

  it('ошибка из браузера пишется в журнал с module=frontend и последними 30 действиями', async () => {
    const actions = Array.from({ length: 40 }, (_, i) => ({ t: new Date().toISOString(), type: 'click', text: `кнопка «${i}»`, path: '/vacation' }))
    const res = await fetch(`${BASE}/bug-reports/client-error`, {
      method: 'POST',
      headers: headersJSON(await getEmployeeToken()),
      body: JSON.stringify({ message: MARK, stack: 'Error: boom', path: '/vacation', actions }),
    })
    assert.strictEqual(res.status, 204)
    const row = (await query('SELECT module, status_code, path, actions FROM error_log WHERE message = $1', [MARK])).rows[0]
    assert.strictEqual(row.module, 'frontend')
    assert.strictEqual(row.status_code, null)
    assert.strictEqual(row.actions.length, 30)
    assert.strictEqual(row.actions[29].text, 'кнопка «39»')
  })

  it('баг-репорт сохраняет приложенные действия', async () => {
    const form = new FormData()
    form.append('title', MARK)
    form.append('actions', JSON.stringify([{ t: new Date().toISOString(), type: 'input', text: 'Тип отпуска = Ежегодный', path: '/vacation' }]))
    const res = await fetch(`${BASE}/bug-reports`, { method: 'POST', headers: headers(await getEmployeeToken()), body: form })
    assert.strictEqual(res.status, 201)
    const report = await res.json()
    assert.deepStrictEqual(report.actions.map((a) => a.text), ['Тип отпуска = Ежегодный'])
  })
})
