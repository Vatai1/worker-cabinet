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
      return await bot.sendMessage(chatId, text, options)
    } catch (error) {
      console.error('Error sending Telegram message:', error)
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
    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) {
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
    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) {
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
    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) {
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
    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) {
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
    if (!manager.telegram_chat_id || !manager.telegram_notifications_enabled) {
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
