import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import net from 'node:net'
import bcrypt from 'bcryptjs'
import { query, inTransaction } from '../config/database.js'
import { notify, notifyBatch, getUnreadCount } from '../config/notifications.js'
import { listen, NOTIFICATION_CHANNEL } from '../lib/pgListen.js'

const STAMP = Date.now()
const users = []
const received = []
let rejectRecipients = false
let smtp

function startSmtpSink() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let inData = false
      let message = ''
      let rcpt = null
      socket.write('220 sink ESMTP\r\n')
      socket.on('data', (chunk) => {
        for (const line of chunk.toString().split('\r\n')) {
          if (inData) {
            if (line === '.') {
              inData = false
              received.push({ to: rcpt, message })
              message = ''
              socket.write('250 queued\r\n')
            } else {
              message += line + '\n'
            }
            continue
          }
          if (!line) continue
          const cmd = line.slice(0, 4).toUpperCase()
          if (cmd === 'EHLO') socket.write('250-sink\r\n250 AUTH PLAIN LOGIN\r\n')
          else if (cmd === 'AUTH') socket.write('235 ok\r\n')
          else if (cmd === 'MAIL') socket.write('250 ok\r\n')
          else if (cmd === 'RCPT') {
            rcpt = line.match(/<([^>]+)>/)?.[1]
            socket.write(rejectRecipients ? '550 mailbox unavailable\r\n' : '250 ok\r\n')
          } else if (cmd === 'DATA') {
            inData = true
            socket.write('354 go\r\n')
          } else if (cmd === 'QUIT') socket.end('221 bye\r\n')
          else socket.write('250 ok\r\n')
        }
      })
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const statusOf = async (id) => (await query('SELECT status, attempts, next_attempt_at, error FROM notification_queue WHERE id = $1', [id])).rows[0]

async function deliverUntil(id, predicate) {
  const { deliverEmails } = await import('../lib/notificationDelivery.js')
  for (let i = 0; i < 400; i++) {
    const row = await statusOf(id)
    if (predicate(row)) return row
    await deliverEmails()
  }
  return statusOf(id)
}

describe('Доставка уведомлений', () => {
  before(async () => {
    smtp = await startSmtpSink()
    Object.assign(process.env, {
      MAIL_HOST: '127.0.0.1',
      MAIL_PORT: String(smtp.address().port),
      MAIL_SECURE: 'false',
      MAIL_USER: 'sink',
      MAIL_PASSWORD: 'sink',
      MAIL_FROM: 'noreply@example.test',
      MAIL_RATE_PER_MINUTE: '100000',
      FRONTEND_URL: 'https://cabinet.example.test',
    })
    await query("UPDATE modules SET is_enabled = true WHERE code = 'notifications' AND organization_id IS NULL")
    const hash = await bcrypt.hash('password123', 4)
    for (const key of ['a', 'b', 'c']) {
      users.push((await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, position, role, hire_date, status)
         VALUES ($1, $2, 'Уведомлёнов', $3, 'Специалист', 'employee', '2015-01-01', 'active') RETURNING id, email`,
        [`notify-${key}-${STAMP}@delivery.test`, hash, key]
      )).rows[0])
    }
  })

  after(async () => {
    smtp.close()
    await query('DELETE FROM users WHERE id = ANY($1)', [users.map((u) => u.id)])
  })

  it('уведомление в откаченной транзакции не сохраняется, сигнал приходит только после фиксации', async () => {
    const signals = []
    const stop = listen(NOTIFICATION_CHANNEL, (p) => { if (p.user_id === users[0].id) signals.push(p) }, 'TEST')
    await new Promise((r) => setTimeout(r, 300))

    await assert.rejects(inTransaction(async (client) => {
      await notify({ userId: users[0].id, type: 'generic', data: { subject: 'откат' }, db: client })
      throw new Error('rollback')
    }))
    const kept = await inTransaction((client) => notify({ userId: users[0].id, type: 'vacation_status_changed', data: { status: 'approved', startDate: '01.07.2031', endDate: '10.07.2031', requestId: 1 }, db: client }))
    await new Promise((r) => setTimeout(r, 500))
    stop()

    const rows = (await query('SELECT id, status, push_status FROM notification_queue WHERE user_id = $1', [users[0].id])).rows
    assert.deepStrictEqual(rows.map((r) => r.id), [kept])
    assert.strictEqual(rows[0].status, 'pending')
    assert.strictEqual(rows[0].push_status, 'pending')
    assert.deepStrictEqual(signals.map((s) => s.id), [kept])
  })

  it('массовая рассылка — одна вставка на всех, без push', async () => {
    const ids = await notifyBatch({ userIds: [users[1].id, users[2].id, users[1].id], type: 'mailing', data: { title: 'Новости', message: 'Текст' } })
    assert.strictEqual(ids.length, 2)
    const rows = (await query('SELECT push_status FROM notification_queue WHERE id = ANY($1)', [ids])).rows
    assert.ok(rows.every((r) => r.push_status === null))
  })

  it('письмо уходит на адрес сотрудника со ссылкой на сайт', async () => {
    const id = (await query("SELECT id FROM notification_queue WHERE user_id = $1 AND type = 'vacation_status_changed'", [users[0].id])).rows[0].id
    const row = await deliverUntil(id, (r) => r.status !== 'pending' && r.status !== 'processing')
    assert.strictEqual(row.status, 'sent', JSON.stringify(row))
    const mail = received.find((m) => m.to === users[0].email)
    assert.ok(mail, 'письмо не дошло до SMTP')
    assert.match(mail.message, /cabinet\.example\.test\/vacation/)
  })

  it('сбой SMTP — повтор с паузой, после лимита попыток — окончательная неудача; счётчик непрочитанных не зависит от доставки', async () => {
    rejectRecipients = true
    const id = await notify({ userId: users[2].id, type: 'generic', data: { subject: 'Проверка' } })
    let row = await deliverUntil(id, (r) => r.attempts >= 1 && r.status === 'pending')
    assert.strictEqual(row.status, 'pending')
    assert.ok(new Date(row.next_attempt_at) > new Date(), 'следующая попытка должна быть отложена')
    assert.match(row.error, /550/)

    await query('UPDATE notification_queue SET attempts = 4, next_attempt_at = NOW() - INTERVAL \'1 minute\' WHERE id = $1', [id])
    row = await deliverUntil(id, (r) => r.status === 'failed')
    assert.strictEqual(row.status, 'failed')
    rejectRecipients = false

    const unread = await getUnreadCount(users[2].id)
    assert.strictEqual(unread, 2)
  })
})
