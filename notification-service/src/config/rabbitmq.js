import amqp from 'amqplib'

let connection = null
let channel = null

const EXCHANGE = 'notifications'
const EXCHANGE_TYPE = 'topic'
const QUEUE = 'notification.email'
const ROUTING_KEY = 'notification.#'

export async function connect() {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'

  console.log(`[RABBITMQ] Connecting to ${url.replace(/\/\/.*@/, '//***@')}...`)

  connection = await amqp.connect(url)

  connection.on('error', (err) => {
    console.error('[RABBITMQ] Connection error:', err.message)
  })

  connection.on('close', () => {
    console.warn('[RABBITMQ] Connection closed')
    connection = null
    channel = null
  })

  channel = await connection.createChannel()

  await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true })
  await channel.assertQueue(QUEUE, { durable: true })
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY)

  channel.prefetch(10)

  console.log(`[RABBITMQ] Connected. Exchange="${EXCHANGE}", Queue="${QUEUE}"`)

  return { connection, channel }
}

export function getChannel() {
  if (!channel) throw new Error('RabbitMQ channel not initialized. Call connect() first.')
  return channel
}

export async function close() {
  if (channel) await channel.close().catch(() => {})
  if (connection) await connection.close().catch(() => {})
  channel = null
  connection = null
  console.log('[RABBITMQ] Disconnected')
}

export { EXCHANGE, QUEUE }
