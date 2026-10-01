import { listen, NOTIFICATION_CHANNEL } from './lib/pgListen.js'
import { deliverEmails, deliverPush, EMAIL_BATCH, PUSH_BATCH } from './lib/notificationDelivery.js'
import { isMailConfigured } from './lib/notificationEmail.js'

const POLL_MS = Number(process.env.NOTIFY_POLL_MS) || 10_000

let running = false
let rerun = false

async function tick() {
  if (running) {
    rerun = true
    return
  }
  running = true
  try {
    do {
      rerun = false
      const pushed = await deliverPush()
      const mailed = await deliverEmails()
      if (pushed === PUSH_BATCH || mailed === EMAIL_BATCH) rerun = true
    } while (rerun)
  } catch (err) {
    console.error('[WORKER] delivery error:', err.message)
  } finally {
    running = false
  }
}

const stopListening = listen(NOTIFICATION_CHANNEL, () => tick(), 'WORKER')
const timer = setInterval(tick, POLL_MS)
console.log(`[WORKER] notification delivery started (poll ${POLL_MS} ms, email ${isMailConfigured() ? 'on' : 'off — MAIL_HOST/MAIL_USER not set'})`)
tick()

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    clearInterval(timer)
    stopListening()
    const wait = setInterval(() => {
      if (!running) {
        clearInterval(wait)
        process.exit(0)
      }
    }, 100)
  })
}
