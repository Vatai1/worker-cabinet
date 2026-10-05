import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const createdIds = []

async function submit(files) {
  const form = new FormData()
  form.append('title', `Картинки ${Date.now()}`)
  for (const [field, name, type, body] of files) form.append(field, new Blob([body], { type }), name)
  const res = await fetch(`${BASE}/bug-reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await login('ivanov@example.com')}`, 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
    body: form,
  })
  const data = await res.json().catch(() => null)
  if (data?.id) createdIds.push(data.id)
  return { status: res.status, data }
}

const image = (i) => ['images', `photo-${i}.png`, 'image/png', PNG]

describe('Баг-репорт: изображения', () => {
  after(async () => {
    await query("DELETE FROM notification_queue WHERE type = 'bug_report_new' AND (data->>'reportId')::int = ANY($1)", [createdIds])
    await query('DELETE FROM bug_reports WHERE id = ANY($1)', [createdIds])
  })

  it('скриншот и несколько изображений сохраняются, администратор получает ссылки на все', async () => {
    const res = await submit([['screenshot', 'screenshot.jpg', 'image/jpeg', PNG], image(1), image(2)])
    assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    assert.strictEqual(res.data.image_s3_keys.length, 2)
    assert.ok(res.data.screenshot_s3_key)

    const links = await fetch(`${BASE}/bug-reports/${res.data.id}/screenshot`, { headers: { Authorization: `Bearer ${await login('admin@example.com')}` } })
    const body = await links.json()
    assert.strictEqual(links.status, 200)
    assert.ok(body.url)
    assert.strictEqual(body.images.length, 2)
  })

  it('не изображение отклоняется', async () => {
    const res = await submit([['images', 'notes.txt', 'text/plain', Buffer.from('hello')]])
    assert.strictEqual(res.status, 400)
    assert.match(res.data.error, /только изображения/)
  })

  it('больше пяти изображений нельзя', async () => {
    const res = await submit([1, 2, 3, 4, 5, 6].map(image))
    assert.strictEqual(res.status, 400)
    assert.match(res.data.error, /не больше 5/)
  })
})
