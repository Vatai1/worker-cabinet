import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

const FAKE_MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64, 1)])
const FAKE_PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG'), Buffer.alloc(64, 2)])
const created = []

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'X-Organization-Id': '1',
  'X-CSRF-Token': 'test-csrf',
  Cookie: 'csrf_token=test-csrf',
})

async function send(method, path, token, form) {
  const res = await fetch(`${BASE}${path}`, { method, headers: authHeaders(token), body: form })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

function instructionForm(fields, { video = FAKE_MP4, videoType = 'video/mp4', poster } = {}) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v))
  if (video) form.append('video', new Blob([video], { type: videoType }), 'clip.mp4')
  if (poster) form.append('poster', new Blob([poster], { type: 'image/png' }), 'poster.png')
  return form
}

describe('Instructions API', () => {
  after(async () => {
    const tokenPromise = login('superadmin@example.com')
    const token = await tokenPromise
    for (const id of created) await send('DELETE', `/instructions/admin/${id}`, token)
    await query("DELETE FROM instruction_videos WHERE title LIKE 'test-instr-%'")
  })

  it('суперадмин загружает инструкцию; работник видит только audience=all, руководитель — обе', async () => {
    const su = await login('superadmin@example.com')
    const suffix = Date.now()
    const forAll = await send('POST', '/instructions/admin', su, instructionForm({ title: `test-instr-all-${suffix}`, audience: 'all', placement: 'vacation-create', sortOrder: 900 }))
    assert.strictEqual(forAll.status, 201, JSON.stringify(forAll.data))
    created.push(forAll.data.id)
    assert.ok(forAll.data.src.includes('instructions/video-'))
    assert.strictEqual(forAll.data.poster, null)

    const forManagers = await send('POST', '/instructions/admin', su, instructionForm({ title: `test-instr-mgr-${suffix}`, audience: 'manager', sortOrder: 901 }, { poster: FAKE_PNG }))
    assert.strictEqual(forManagers.status, 201, JSON.stringify(forManagers.data))
    created.push(forManagers.data.id)
    assert.ok(forManagers.data.poster)

    const employee = await send('GET', '/instructions', await login('ivanov@example.com'))
    const employeeIds = employee.data.map((v) => v.id)
    assert.ok(employeeIds.includes(forAll.data.id))
    assert.ok(!employeeIds.includes(forManagers.data.id))

    const manager = await send('GET', '/instructions', await login('petrov@example.com'))
    const managerIds = manager.data.map((v) => v.id)
    assert.ok(managerIds.includes(forAll.data.id))
    assert.ok(managerIds.includes(forManagers.data.id))

    const video = await fetch(forAll.data.src)
    assert.strictEqual(video.status, 200)
  })

  it('не суперадмин не может загружать и смотреть админский список → 403', async () => {
    const admin = await login('admin@example.com')
    const res = await send('POST', '/instructions/admin', admin, instructionForm({ title: 'test-instr-forbidden' }))
    assert.strictEqual(res.status, 403)
    const list = await send('GET', '/instructions/admin', admin)
    assert.strictEqual(list.status, 403)
  })

  it('валидация: без видео, без названия, файл не того формата → 400', async () => {
    const su = await login('superadmin@example.com')
    const noVideo = await send('POST', '/instructions/admin', su, instructionForm({ title: 'test-instr-novideo' }, { video: null }))
    assert.strictEqual(noVideo.status, 400)
    const noTitle = await send('POST', '/instructions/admin', su, instructionForm({ title: '' }))
    assert.strictEqual(noTitle.status, 400)
    const wrongType = await send('POST', '/instructions/admin', su, instructionForm({ title: 'test-instr-wrong' }, { videoType: 'image/png' }))
    assert.strictEqual(wrongType.status, 400)
    const fakeBytes = await send('POST', '/instructions/admin', su, instructionForm({ title: 'test-instr-fake' }, { video: Buffer.alloc(64, 0) }))
    assert.strictEqual(fakeBytes.status, 400)
    assert.match(fakeBytes.data.error, /не соответствует/)
  })

  it('изменение: скрытая инструкция не видна пользователям; удаление обложки; удаление целиком', async () => {
    const su = await login('superadmin@example.com')
    const res = await send('POST', '/instructions/admin', su, instructionForm({ title: `test-instr-edit-${Date.now()}` }, { poster: FAKE_PNG }))
    assert.strictEqual(res.status, 201, JSON.stringify(res.data))
    const id = res.data.id

    const form = new FormData()
    form.append('isActive', 'false')
    form.append('removePoster', 'true')
    form.append('title', 'test-instr-edited')
    const upd = await send('PUT', `/instructions/admin/${id}`, su, form)
    assert.strictEqual(upd.status, 200, JSON.stringify(upd.data))
    assert.strictEqual(upd.data.isActive, false)
    assert.strictEqual(upd.data.poster, null)
    assert.strictEqual(upd.data.title, 'test-instr-edited')

    const visible = await send('GET', '/instructions', await login('ivanov@example.com'))
    assert.ok(!visible.data.some((v) => v.id === id))

    const del = await send('DELETE', `/instructions/admin/${id}`, su)
    assert.strictEqual(del.status, 200)
    const again = await send('DELETE', `/instructions/admin/${id}`, su)
    assert.strictEqual(again.status, 404)
    const badId = await send('DELETE', '/instructions/admin/abc', su)
    assert.strictEqual(badId.status, 404)
  })
})
