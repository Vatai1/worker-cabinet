import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import webpush from 'web-push'
import { query } from '../config/database.js'
import { BASE, headers, headersJSON, getEmployeeToken, getEmployeeUser } from './helpers.js'
import * as pushService from '../services/pushService.js'

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? headers(token) : headersJSON(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

describe('Web Push API', () => {
  let employeeToken, employeeUser
  const endpoint = `https://push.test/ep/${Date.now()}`

  before(async () => {
    employeeToken = await getEmployeeToken()
    employeeUser = await getEmployeeUser()
  })

  after(async () => {
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint])
  })

  describe('US «Подписка сохраняется»', () => {
    it('POST /push/subscribe → 201, subscribed:true', async () => {
      const res = await call('POST', '/push/subscribe', employeeToken, {
        endpoint,
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      })
      assert.strictEqual(res.status, 201, JSON.stringify(res.data))
      assert.strictEqual(res.data.subscribed, true)

      const status = await call('GET', '/push/status', employeeToken)
      assert.strictEqual(status.data.subscribed, true)
    })

    it('повторный POST того же endpoint — upsert без дубля', async () => {
      await call('POST', '/push/subscribe', employeeToken, {
        endpoint,
        keys: { p256dh: 'test-p256dh-2', auth: 'test-auth-2' },
      })
      const rows = (await query('SELECT id, keys FROM push_subscriptions WHERE endpoint = $1', [endpoint])).rows
      assert.strictEqual(rows.length, 1)
      assert.strictEqual(rows[0].keys.p256dh, 'test-p256dh-2')
    })
  })

  describe('US «Отписка»', () => {
    it('POST /push/unsubscribe → subscribed:false, запись удалена', async () => {
      const res = await call('POST', '/push/unsubscribe', employeeToken, { endpoint })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.subscribed, false)

      const status = await call('GET', '/push/status', employeeToken)
      assert.strictEqual(status.data.subscribed, false)

      const rows = (await query('SELECT id FROM push_subscriptions WHERE endpoint = $1', [endpoint])).rows
      assert.strictEqual(rows.length, 0)
    })
  })

  describe('US «Конфиг без ключей»', () => {
    it('VAPID_* не заданы → { enabled: false }', () => {
      const orig = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY }
      process.env.VAPID_PUBLIC_KEY = ''
      process.env.VAPID_PRIVATE_KEY = ''
      try {
        assert.strictEqual(pushService.isPushConfigured(), false)
      } finally {
        process.env.VAPID_PUBLIC_KEY = orig.pub
        process.env.VAPID_PRIVATE_KEY = orig.priv
      }
    })
  })

  describe('sendToUser', () => {
    it('подписки нет → тихо (не бросает)', async () => {
      await assert.doesNotReject(pushService.sendToUser(employeeUser.id, { title: 't', body: 'b', url: null }))
    })

    it('410 от провайдера → подписка удалена', async () => {
      const testEndpoint = `https://push.test/ep-410/${Date.now()}`
      await call('POST', '/push/subscribe', employeeToken, {
        endpoint: testEndpoint,
        keys: { p256dh: 'p', auth: 'a' },
      })
      const original = webpush.sendNotification
      webpush.sendNotification = async () => {
        const err = new Error('gone')
        err.statusCode = 410
        throw err
      }
      try {
        await pushService.sendToUser(employeeUser.id, { title: 't', body: 'b', url: null })
      } finally {
        webpush.sendNotification = original
      }
      const rows = (await query('SELECT id FROM push_subscriptions WHERE endpoint = $1', [testEndpoint])).rows
      assert.strictEqual(rows.length, 0)
    })
  })
})
