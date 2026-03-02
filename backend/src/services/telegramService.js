import TelegramBot from 'node-telegram-bot-api'

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN not found in environment variables')
}

const bot = token ? new TelegramBot(token, { polling: false }) : null

const VACATION_TYPE_LABELS = {
  annual_paid: '🏖 Ежегодный оплачиваемый',
  unpaid: '📋 Без сохранения зарплаты',
  educational: '🎓 Учебный',
  maternity: '🤱 Декретный',
  child_care: '👶 По уходу за ребёнком',
  additional: '➕ Дополнительный',
  veteran: '⭐ Ветеранский',
}

function getVacationTypeLabel(type) {
  return VACATION_TYPE_LABELS[type] || '📋 Отпуск'
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function pluralizeDays(n) {
  const abs = Math.abs(n)
  if (abs % 10 === 1 && abs % 100 !== 11) return `${n} день`
  if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20)) return `${n} дня`
  return `${n} дней`
}

const LINE = '━━━━━━━━━━━━━━━━━━━━'

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

  static async sendVacationApprovedNotification(user, request) {
    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) return null

    const startDate = formatDate(request.start_date)
    const endDate = formatDate(request.end_date)
    const duration = pluralizeDays(request.duration)
    const vacationType = getVacationTypeLabel(request.vacation_type)

    const message = [
      LINE,
      `✅  <b>ОТПУСК ОДОБРЕН</b>`,
      LINE,
      ``,
      `Ваша заявка на отпуск одобрена!`,
      ``,
      `${vacationType}`,
      `📅  ${startDate} — ${endDate}`,
      `⏱  ${duration}`,
      request.has_travel ? `🚂  Включая дни проезда` : null,
      ``,
      LINE,
      `🎉 Приятного отдыха!`,
    ].filter(line => line !== null).join('\n')

    return this.sendMessage(user.telegram_chat_id, message, { parse_mode: 'HTML' })
  }

  static async sendVacationRejectedNotification(user, request) {
    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) return null

    const startDate = formatDate(request.start_date)
    const endDate = formatDate(request.end_date)
    const duration = pluralizeDays(request.duration)
    const reason = request.rejection_reason || 'Причина не указана'

    const message = [
      LINE,
      `❌  <b>ОТПУСК ОТКЛОНЁН</b>`,
      LINE,
      ``,
      `Ваша заявка на отпуск отклонена.`,
      ``,
      `📅  ${startDate} — ${endDate}`,
      `⏱  ${duration}`,
      ``,
      `💬  <b>Причина:</b>`,
      `<i>${reason}</i>`,
      ``,
      LINE,
    ].join('\n')

    return this.sendMessage(user.telegram_chat_id, message, { parse_mode: 'HTML' })
  }

  static async sendVacationCancelledNotification(user, request) {
    if (!user.telegram_chat_id || !user.telegram_notifications_enabled) return null

    const startDate = formatDate(request.start_date)
    const endDate = formatDate(request.end_date)
    const duration = pluralizeDays(request.duration)
    const isByManager = request.status === 'cancelled_by_manager'
    const reason = request.cancellation_reason

    const message = [
      LINE,
      `🚫  <b>ЗАЯВКА ОТМЕНЕНА</b>`,
      LINE,
      ``,
      isByManager
        ? `Ваша заявка на отпуск отменена руководителем.`
        : `Заявка на отпуск отменена.`,
      ``,
      `📅  ${startDate} — ${endDate}`,
      `⏱  ${duration}`,
      reason ? `` : null,
      reason ? `💬  <b>Причина:</b>` : null,
      reason ? `<i>${reason}</i>` : null,
      ``,
      LINE,
    ].filter(line => line !== null).join('\n')

    return this.sendMessage(user.telegram_chat_id, message, { parse_mode: 'HTML' })
  }

  static async sendNewRequestNotification(manager, request, employee) {
    if (!manager.telegram_chat_id || !manager.telegram_notifications_enabled) return null

    const startDate = formatDate(request.start_date)
    const endDate = formatDate(request.end_date)
    const duration = pluralizeDays(request.duration)
    const vacationType = getVacationTypeLabel(request.vacation_type)
    const empName = `${employee.last_name} ${employee.first_name}`
    const comment = request.comment

    const message = [
      LINE,
      `🆕  <b>НОВАЯ ЗАЯВКА НА ОТПУСК</b>`,
      LINE,
      ``,
      `👤  <b>${empName}</b>`,
      `💼  ${employee.position}`,
      ``,
      `${vacationType}`,
      `📅  ${startDate} — ${endDate}`,
      `⏱  ${duration}`,
      request.has_travel ? `🚂  Включая дни проезда` : null,
      comment ? `` : null,
      comment ? `💬  <b>Комментарий:</b>` : null,
      comment ? `<i>${comment}</i>` : null,
      ``,
      LINE,
      `⏳ Ожидает вашего решения`,
    ].filter(line => line !== null).join('\n')

    return this.sendMessage(manager.telegram_chat_id, message, { parse_mode: 'HTML' })
  }
}

export default bot
