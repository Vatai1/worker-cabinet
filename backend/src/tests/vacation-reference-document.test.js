import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { query } from '../config/database.js'
import { BASE, login, headers, headersJSON } from './helpers.js'

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
const CSRF = { 'X-CSRF-Token': 'dd', Cookie: 'csrf_token=dd' }
const createdIds = []
let createdBalanceId = null

async function upload(email, name, type, body) {
  const form = new FormData()
  form.append('file', new Blob([body], { type }), name)
  const res = await fetch(`${BASE}/vacation/reference-documents`, { method: 'POST', headers: { ...headers(await login(email)), ...CSRF }, body: form })
  return { status: res.status, data: await res.json().catch(() => null) }
}

async function createEducational(email, extra) {
  const res = await fetch(`${BASE}/vacation/requests`, {
    method: 'POST',
    headers: { ...headersJSON(await login(email)), ...CSRF },
    body: JSON.stringify({ startDate: '2031-12-01', endDate: '2031-12-03', vacationType: 'educational', ...extra }),
  })
  const data = await res.json().catch(() => null)
  if (data?.id) createdIds.push(data.id)
  return { status: res.status, data }
}

async function reference(email, id) {
  const res = await fetch(`${BASE}/vacation/requests/${id}/reference-document`, { headers: headers(await login(email)) })
  return { status: res.status, data: await res.json().catch(() => null) }
}

describe('Учебный отпуск: справка', () => {
  before(async () => {
    const exists = await query("SELECT 1 FROM vacation_balances WHERE user_id = (SELECT id FROM users WHERE email = 'ivanov@example.com') AND year = 2031 AND organization_id = 1")
    if (exists.rows.length === 0) {
      createdBalanceId = (await query(
        "INSERT INTO vacation_balances (user_id, year, total_days, organization_id) VALUES ((SELECT id FROM users WHERE email = 'ivanov@example.com'), 2031, 28, 1) RETURNING id"
      )).rows[0].id
    }
  })

  after(async () => {
    await query('DELETE FROM vacation_request_status_history WHERE request_id = ANY($1)', [createdIds])
    await query('DELETE FROM notification_queue WHERE (data->>\'requestId\')::text = ANY($1)', [createdIds.map(String)])
    await query('DELETE FROM vacation_requests WHERE id = ANY($1)', [createdIds])
    if (createdBalanceId) await query('DELETE FROM vacation_balances WHERE id = $1', [createdBalanceId])
  })

  it('без загруженного файла заявку не создать — одного имени файла недостаточно', async () => {
    const res = await createEducational('ivanov@example.com', { referenceDocument: 'справка.pdf' })
    assert.strictEqual(res.status, 400)
    assert.match(res.data.error, /приложить справку/)
  })

  it('файл другого типа не принимается', async () => {
    const res = await upload('ivanov@example.com', 'notes.txt', 'text/plain', Buffer.from('hello'))
    assert.strictEqual(res.status, 400)
    assert.match(res.data.error, /PDF, JPEG, PNG или DOCX/)
  })

  it('чужой файл приложить нельзя', async () => {
    const foreign = await upload('anna.efimova@example.com', 'spravka.pdf', 'application/pdf', PDF)
    assert.strictEqual(foreign.status, 201, JSON.stringify(foreign.data))
    const res = await createEducational('ivanov@example.com', { referenceDocument: 'spravka.pdf', referenceDocumentKey: foreign.data.key })
    assert.strictEqual(res.status, 400)
    assert.match(res.data.error, /Некорректный файл справки/)
  })

  it('справку видят автор и HR, посторонний сотрудник — нет', async () => {
    const uploaded = await upload('ivanov@example.com', 'spravka.pdf', 'application/pdf', PDF)
    assert.strictEqual(uploaded.status, 201, JSON.stringify(uploaded.data))
    const created = await createEducational('ivanov@example.com', { referenceDocument: 'Справка-вызов.pdf', referenceDocumentKey: uploaded.data.key })
    assert.strictEqual(created.status, 201, JSON.stringify(created.data))
    assert.strictEqual(created.data.reference_document, 'Справка-вызов.pdf')

    const own = await reference('ivanov@example.com', created.data.id)
    assert.strictEqual(own.status, 200, JSON.stringify(own.data))
    assert.ok(own.data.url)
    assert.strictEqual(own.data.name, 'Справка-вызов.pdf')

    assert.strictEqual((await reference('elena@example.com', created.data.id)).status, 200)
    assert.strictEqual((await reference('anna.efimova@example.com', created.data.id)).status, 403)
  })
})
