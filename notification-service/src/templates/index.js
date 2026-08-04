function esc(s) {
  if (!s) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

function safeLink(link) {
  if (!link || link.startsWith('https://') || link.startsWith('http://')) return esc(link)
  return ''
}

const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1a1a1a;
  line-height: 1.6;
`

const CONTAINER_STYLES = `
  max-width: 600px;
  margin: 0 auto;
  padding: 32px 24px;
`

const HEADER_STYLES = `
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  padding: 24px 32px;
  border-radius: 12px 12px 0 0;
  text-align: center;
`

const BODY_STYLES = `
  background: #ffffff;
  padding: 32px;
  border: 1px solid #e5e7eb;
  border-top: none;
  border-radius: 0 0 12px 12px;
`

const BUTTON_STYLES = `
  display: inline-block;
  padding: 12px 32px;
  background: #3b82f6;
  color: #ffffff;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
`

const FOOTER_STYLES = `
  text-align: center;
  padding: 16px;
  color: #9ca3af;
  font-size: 12px;
`

function wrapHtml(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
</head>
<body style="${BASE_STYLES} background: #f3f4f6; margin: 0; padding: 0;">
  <div style="${CONTAINER_STYLES}">
    <div style="${HEADER_STYLES}">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px;">Worker Cabinet</h1>
    </div>
    <div style="${BODY_STYLES}">
      ${bodyContent}
    </div>
    <div style="${FOOTER_STYLES}">
      Это автоматическое уведомление от системы Worker Cabinet
    </div>
  </div>
</body>
</html>`
}

export function vacationCreated(data) {
  const { employeeName, startDate, endDate, days, approverName, link } = data
  const body = `
    <p>Здравствуйте${approverName ? ', ' + esc(approverName) : ''}!</p>
    <p>Сотрудник <strong>${esc(employeeName)}</strong> подал заявку на отпуск:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Период</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(startDate)} — ${esc(endDate)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Количество дней</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(days)}</td></tr>
    </table>
    ${safeLink(link) ? `<a href="${safeLink(link)}" style="${BUTTON_STYLES}">Рассмотреть заявку</a>` : ''}
  `
  return {
    subject: 'Новая заявка на отпуск',
    html: wrapHtml('Заявка на отпуск', body),
    text: `Новая заявка на отпуск от ${employeeName}: ${startDate} — ${endDate} (${days} дн.)`,
  }
}

export function vacationStatusChanged(data) {
  const { employeeName, status, startDate, endDate, comment, link } = data
  const statusText = status === 'approved' ? 'одобрен' : 'отклонён'
  const statusColor = status === 'approved' ? '#16a34a' : '#dc2626'
  const body = `
    <p>Здравствуйте, ${esc(employeeName)}!</p>
    <p>Ваша заявка на отпуск <span style="color: ${statusColor}; font-weight: 600;">${statusText}</span>.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Период</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(startDate)} — ${esc(endDate)}</td></tr>
      ${comment ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Комментарий</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(comment)}</td></tr>` : ''}
    </table>
    ${safeLink(link) ? `<a href="${safeLink(link)}" style="${BUTTON_STYLES}">Перейти в систему</a>` : ''}
  `
  return {
    subject: `Заявка на отпуск ${statusText}`,
    html: wrapHtml(`Отпуск ${statusText}`, body),
    text: `Ваша заявка на отпуск (${startDate} — ${endDate}) ${statusText}.${comment ? ' Комментарий: ' + comment : ''}`,
  }
}

export function surveyAssigned(data) {
  const { title, deadline, link } = data
  const deadlineStr = deadline
    ? new Date(deadline).toLocaleDateString('ru-RU')
    : null
  const body = `
    <p>Здравствуйте!</p>
    <p>Для вас доступен новый опрос «${esc(title)}».</p>
    ${deadlineStr ? `<p style="color: #6b7280;">Дедлайн: <strong>${esc(deadlineStr)}</strong></p>` : ''}
    ${safeLink(link) ? `<a href="${safeLink(link)}" style="${BUTTON_STYLES}">Перейти к опросу</a>` : ''}
  `
  return {
    subject: 'Новый опрос',
    html: wrapHtml('Новый опрос', body),
    text: `Для вас доступен новый опрос «${title}».${deadlineStr ? ' Дедлайн: ' + deadlineStr : ''}`,
  }
}

export function generic(data) {
  const { recipientName, subject, message, link, linkText } = data
  const body = `
    <p>Здравствуйте${recipientName ? ', ' + esc(recipientName) : ''}!</p>
    <p>${esc(message)}</p>
    ${safeLink(link) ? `<a href="${safeLink(link)}" style="${BUTTON_STYLES}">${esc(linkText || 'Перейти в систему')}</a>` : ''}
  `
  return {
    subject: esc(subject) || 'Уведомление от Worker Cabinet',
    html: wrapHtml(esc(subject) || 'Уведомление', body),
    text: message,
  }
}

export const templates = {
  vacation_created: vacationCreated,
  vacation_status_changed: vacationStatusChanged,
  survey_assigned: surveyAssigned,
  generic,
  mailing,
}

export function mailing(data) {
  const { title, message, imageUrls = [] } = data
  const imagesHtml = imageUrls
    .map(url => `<img src="${esc(url)}" style="max-width:100%;border-radius:8px;margin-top:12px" />`)
    .join('')
  const body = `
    <p>Здравствуйте!</p>
    <p>${esc(message)}</p>
    ${imagesHtml}
  `
  return {
    subject: title || 'Рассылка',
    html: wrapHtml(title || 'Рассылка', body),
    text: message,
  }
}
