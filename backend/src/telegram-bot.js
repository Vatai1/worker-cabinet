import TelegramBot from 'node-telegram-bot-api'
import { query } from './config/database.js'
import dotenv from 'dotenv'

dotenv.config()

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in environment variables')
  process.exit(1)
}

const bot = new TelegramBot(token, { polling: true })

console.log('✅ Telegram bot started')

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const telegramUsername = msg.chat.username

  if (!telegramUsername) {
    bot.sendMessage(
      chatId,
      '⚠️ Пожалуйста, установите username в Telegram для подключения бота'
    )
    return
  }

  try {
    const normalizedUsername = telegramUsername.startsWith('@')
      ? telegramUsername
      : `@${telegramUsername}`

    const result = await query(
      `SELECT id, first_name, last_name
       FROM users
       WHERE telegram_username = $1
       LIMIT 1`,
      [normalizedUsername]
    )

    if (result.rows.length === 0) {
      bot.sendMessage(
        chatId,
        `⚠️ Пользователь с username "${normalizedUsername}" не найден в системе.\n\n` +
        `Войдите в систему, перейдите в "Настройки" и введите ваш Telegram username для подключения.`
      )
      return
    }

    const user = result.rows[0]

    await query(
      `UPDATE users
       SET telegram_chat_id = $1
       WHERE id = $2`,
      [chatId, user.id]
    )

    const LINE = '━━━━━━━━━━━━━━━━━━━━'

    bot.sendMessage(
      chatId,
      `${LINE}\n` +
      `✅  <b>ПОДКЛЮЧЕНО УСПЕШНО</b>\n` +
      `${LINE}\n\n` +
      `Добро пожаловать, <b>${user.first_name} ${user.last_name}</b>!\n\n` +
      `Теперь вы будете получать уведомления:\n\n` +
      `🆕  Новые заявки на отпуск\n` +
      `✅  Одобрение заявки\n` +
      `❌  Отклонение заявки\n` +
      `🚫  Отмена заявки\n\n` +
      `${LINE}\n` +
      `⚙️ Управление — в настройках приложения`,
      { parse_mode: 'HTML' }
    )

    console.log(`✅ User connected: ${user.first_name} ${user.last_name} (${normalizedUsername}) -> Chat ID: ${chatId}`)
  } catch (error) {
    console.error('❌ Error connecting user:', error)
    bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при подключении. Пожалуйста, попробуйте позже.'
    )
  }
})

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id

  const LINE = '━━━━━━━━━━━━━━━━━━━━'

  bot.sendMessage(
    chatId,
    `${LINE}\n` +
    `📋  <b>СПРАВКА ПО БОТУ</b>\n` +
    `${LINE}\n\n` +
    `<b>Команды:</b>\n` +
    `/start — Подключить аккаунт\n` +
    `/help — Показать справку\n\n` +
    `<b>Уведомления:</b>\n` +
    `🆕  Новая заявка на отпуск\n` +
    `✅  Одобрение заявки\n` +
    `❌  Отклонение заявки\n` +
    `🚫  Отмена заявки\n\n` +
    `${LINE}\n` +
    `⚙️ Управление — в настройках приложения`,
    { parse_mode: 'HTML' }
  )
})

bot.on('polling_error', (error) => {
  console.error('❌ Telegram polling error:', error)
})

process.on('SIGINT', () => {
  console.log('\n🛑 Stopping bot...')
  bot.stopPolling()
  process.exit(0)
})
