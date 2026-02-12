import TelegramBot from 'node-telegram-bot-api'

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN not found in environment variables')
}

const bot = token ? new TelegramBot(token, { polling: false }) : null

export class TelegramService {
  static isAvailable() {
    return bot !== null
  }

  static async sendMessage(chatId, text, options = {}) {
    if (!this.isAvailable()) {
      console.warn('Telegram bot is not available')
      return null
    }

    try {
      console.log('Telegram: Sending message to chat:', chatId)
      const result = await bot.sendMessage(chatId, text, options)
      console.log('Telegram: Message sent successfully to:', chatId)
      return result
    } catch (error) {
      console.error('Telegram: Error sending message to chat', chatId, ':', error)
      return null
    }
  }

  static formatNotificationMessage(data) {
    const { type, title, message, user } = data

    let emoji = '🔔'
    if (type === 'vacation_request') emoji = '🏖️'
    if (type === 'vacation_approved') emoji = '✅'
    if (type === 'vacation_rejected') emoji = '❌'
    if (type === 'vacation_cancelled') emoji = '🚫'

    return `
${emoji} *${title}*

${message}

_Сотрудник: ${user.firstName} ${user.lastName}_
    `.trim()
  }

  static async sendVacationRequestNotification(user, request) {
    console.log('Telegram: sendVacationRequestNotification called for user:', user.id, user.first_name, user.last_name)
    console.log('Telegram: User telegram_chat_id:', user.telegram_chat_id)
    console.log('Telegram: User telegram_notifications_enabled:', user.telegram_notifications_enabled)

    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) {
      console.log('Telegram: Skipping notification - chat_id or notifications disabled')
      return null
    }

    const dates = `${new Date(request.startDate).toLocaleDateString('ru-RU')} - ${new Date(request.endDate).toLocaleDateString('ru-RU')}`
    const message = this.formatNotificationMessage({
      type: 'vacation_request',
      title: 'Новая заявка на отпуск',
      message: `Сотрудник хочет пойти в отпуск\n\n📅 Даты: ${dates}\n📝 Комментарий: ${request.comment || 'Без комментария'}`,
      user
    })

    return this.sendMessage(user.telegram_chat_id, message, { parse_mode: 'Markdown' })
  }

  static async sendVacationApprovedNotification(user, request) {
    console.log('Telegram: sendVacationApprovedNotification called for user:', user.id, user.first_name, user.last_name)
    console.log('Telegram: User telegram_chat_id:', user.telegram_chat_id)
    console.log('Telegram: User telegram_notifications_enabled:', user.telegram_notifications_enabled)

    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) {
      console.log('Telegram: Skipping notification - chat_id or notifications disabled')
      return null
    }

    const dates = `${new Date(request.startDate).toLocaleDateString('ru-RU')} - ${new Date(request.endDate).toLocaleDateString('ru-RU')}`
    const message = this.formatNotificationMessage({
      type: 'vacation_approved',
      title: 'Отпуск одобрен',
      message: `Ваша заявка на отпуск одобрена\n\n📅 Даты: ${dates}`,
      user
    })

    return this.sendMessage(user.telegram_chat_id, message, { parse_mode: 'Markdown' })
  }

  static async sendVacationRejectedNotification(user, request) {
    console.log('Telegram: sendVacationRejectedNotification called for user:', user.id, user.first_name, user.last_name)
    console.log('Telegram: User telegram_chat_id:', user.telegram_chat_id)
    console.log('Telegram: User telegram_notifications_enabled:', user.telegram_notifications_enabled)

    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) {
      console.log('Telegram: Skipping notification - chat_id or notifications disabled')
      return null
    }

    const dates = `${new Date(request.startDate).toLocaleDateString('ru-RU')} - ${new Date(request.endDate).toLocaleDateString('ru-RU')}`
    const message = this.formatNotificationMessage({
      type: 'vacation_rejected',
      title: 'Отпуск отклонен',
      message: `Ваша заявка на отпуск отклонена\n\n📅 Даты: ${dates}\n📝 Причина: ${request.rejectionReason || 'Без причины'}`,
      user
    })

    return this.sendMessage(user.telegram_chat_id, message, { parse_mode: 'Markdown' })
  }

  static async sendVacationCancelledNotification(user, request) {
    console.log('Telegram: sendVacationCancelledNotification called for user:', user.id, user.first_name, user.last_name)
    console.log('Telegram: User telegram_chat_id:', user.telegram_chat_id)
    console.log('Telegram: User telegram_notifications_enabled:', user.telegram_notifications_enabled)

    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) {
      console.log('Telegram: Skipping notification - chat_id or notifications disabled')
      return null
    }

    const dates = `${new Date(request.startDate).toLocaleDateString('ru-RU')} - ${new Date(request.endDate).toLocaleDateString('ru-RU')}`
    const message = this.formatNotificationMessage({
      type: 'vacation_cancelled',
      title: 'Заявка отменена',
      message: `Заявка на отпуск отменена\n\n📅 Даты: ${dates}`,
      user
    })

    return this.sendMessage(user.telegram_chat_id, message, { parse_mode: 'Markdown' })
  }

  static async sendNewRequestNotification(manager, request, employee) {
    console.log('Telegram: sendNewRequestNotification called for manager:', manager.id, manager.first_name, manager.last_name)
    console.log('Telegram: Manager telegram_chat_id:', manager.telegram_chat_id)
    console.log('Telegram: Manager telegram_notifications_enabled:', manager.telegram_notifications_enabled)

    if (!manager.telegram_chat_id || !manager.telegram_notifications_enabled) {
      console.log('Telegram: Skipping notification - chat_id or notifications disabled')
      return null
    }

    const dates = `${new Date(request.startDate).toLocaleDateString('ru-RU')} - ${new Date(request.endDate).toLocaleDateString('ru-RU')}`
    const message = `
🆕 *Новая заявка на рассмотрении*

Сотрудник: ${employee.firstName} ${employee.lastName}
Должность: ${employee.position}

📅 Даты: ${dates}
📝 Комментарий: ${request.comment || 'Без комментария'}

Необходимо рассмотреть заявку в системе.
`.trim()

    return this.sendMessage(manager.telegram_chat_id, message, { parse_mode: 'Markdown' })
  }
}

export default bot
