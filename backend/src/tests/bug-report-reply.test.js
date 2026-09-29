import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { BASE, login } from './helpers.js'

let reportId
let reporterId

async function patch(email, body) {
  const token = await login(email)
  const res = await fetch(`${BASE}/bug-reports/${reportId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const replyNotifications = async () =>
  (await query("SELECT data FROM notification_queue WHERE user_id = $1 AND type = 'bug_report_reply' AND (data->>'reportId') = $2", [reporterId, String(reportId)])).rows

describe('Баг-репорт: ответ пользователю', () => {
  before(async () => {
    reporterId = (await query("SELECT id FROM users WHERE email = 'ivanov@example.com'")).rows[0].id
    reportId = (await query("INSERT INTO bug_reports (user_id, title) VALUES ($1, 'Не открывается отпуск') RETURNING id", [reporterId])).rows[0].id
  })

  after(async () => {
    await query("DELETE FROM notification_queue WHERE type = 'bug_report_reply' AND (data->>'reportId') = $1", [String(reportId)])
    await query('DELETE FROM bug_reports WHERE id = $1', [reportId])
  })

  it('ответ сохраняется и приходит автору уведомлением, комментарий остаётся внутренним', async () => {
    const res = await patch('admin@example.com', { admin_comment: 'Внутреннее: проверить кэш', user_reply: '  Исправили, обновите страницу  ' })
    assert.strictEqual(res.status, 200, JSON.stringify(res.data))
    assert.strictEqual(res.data.user_reply, 'Исправили, обновите страницу')
    assert.ok(res.data.user_reply_at)
    assert.ok(res.data.replier_name)
    const notes = await replyNotifications()
    assert.strictEqual(notes.length, 1)
    assert.strictEqual(notes[0].data.message, 'Исправили, обновите страницу')
    assert.match(notes[0].data.subject, /Не открывается отпуск/)
    assert.ok(!JSON.stringify(notes[0].data).includes('Внутреннее'))
  })

  it('тот же ответ повторно не шлёт уведомление, новый — шлёт', async () => {
    await patch('admin@example.com', { user_reply: 'Исправили, обновите страницу' })
    assert.strictEqual((await replyNotifications()).length, 1)
    await patch('admin@example.com', { user_reply: 'Проверьте ещё раз, пожалуйста' })
    assert.strictEqual((await replyNotifications()).length, 2)
  })

  it('сотрудник не может отвечать', async () => {
    const res = await patch('ivanov@example.com', { user_reply: 'Сам себе' })
    assert.ok([401, 403].includes(res.status))
  })
})
