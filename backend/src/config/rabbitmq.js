import amqp from 'amqplib'

let connection = null
let channel = null

const EXCHANGE = 'notifications'
const EXCHANGE_TYPE = 'topic'

export async function connect() {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'


  connection = await amqp.connect(url)

  connection.on('error', (err) => {
    console.error('[RABBITMQ] Publisher connection error:', err.message)
  })

  connection.on('close', () => {
    console.warn('[RABBITMQ] Publisher connection closed')
    connection = null
    channel = null
  })

  channel = await connection.createChannel()
  await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true })


  return { connection, channel }
}

export function getChannel() {
  if (!channel) throw new Error('RabbitMQ channel not initialized. Call connect() first.')
  return channel
}

export async function publishNotification({ notificationId, userId, type, channel: msgChannel, data }) {
  const rmqChannel = getChannel()
  const routingKey = `notification.${msgChannel || 'email'}`
  const payload = {
    notificationId,
    userId,
    type,
    channel: msgChannel || 'email',
    data,
    publishedAt: new Date().toISOString(),
  }

  const published = rmqChannel.publish(
    EXCHANGE,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  )

  if (!published) {
    console.warn('[RABBITMQ] Message buffered (write buffer full)')
  }

  return published
}

export async function close() {
  if (channel) await channel.close().catch(() => {})
  if (connection) await connection.close().catch(() => {})
  channel = null
  connection = null
}
