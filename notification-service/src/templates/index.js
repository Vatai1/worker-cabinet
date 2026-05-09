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
  <title>${title}</title>
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
    <p>Здравствуйте${approverName ? ', ' + approverName : ''}!</p>
    <p>Сотрудник <strong>${employeeName}</strong> подал заявку на отпуск:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Период</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${startDate} — ${endDate}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Количество дней</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${days}</td></tr>
    </table>
    ${link ? `<a href="${link}" style="${BUTTON_STYLES}">Рассмотреть заявку</a>` : ''}
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
    <p>Здравствуйте, ${employeeName}!</p>
    <p>Ваша заявка на отпуск <span style="color: ${statusColor}; font-weight: 600;">${statusText}</span>.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Период</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${startDate} — ${endDate}</td></tr>
      ${comment ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Комментарий</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${comment}</td></tr>` : ''}
    </table>
    ${link ? `<a href="${link}" style="${BUTTON_STYLES}">Перейти в систему</a>` : ''}
  `
  return {
    subject: `Заявка на отпуск ${statusText}`,
    html: wrapHtml(`Отпуск ${statusText}`, body),
    text: `Ваша заявка на отпуск (${startDate} — ${endDate}) ${statusText}.${comment ? ' Комментарий: ' + comment : ''}`,
  }
}

export function documentAssigned(data) {
  const { employeeName, documentTitle, assignerName, link } = data
  const body = `
    <p>Здравствуйте, ${employeeName}!</p>
    <p><strong>${assignerName}</strong> назначил(а) вам документ для ознакомления:</p>
    <p style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 16px 0;">
      ${documentTitle}
    </p>
    ${link ? `<a href="${link}" style="${BUTTON_STYLES}">Перейти к документу</a>` : ''}
  `
  return {
    subject: 'Новый документ для ознакомления',
    html: wrapHtml('Документ для ознакомления', body),
    text: `${assignerName} назначил(а) вам документ: ${documentTitle}`,
  }
}

export function surveyAssigned(data) {
  const { employeeName, surveyTitle, dueDate, link } = data
  const body = `
    <p>Здравствуйте, ${employeeName}!</p>
    <p>Вам назначен новый опрос:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Опрос</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${surveyTitle}</td></tr>
      ${dueDate ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Срок</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${dueDate}</td></tr>` : ''}
    </table>
    ${link ? `<a href="${link}" style="${BUTTON_STYLES}">Пройти опрос</a>` : ''}
  `
  return {
    subject: 'Новый опрос',
    html: wrapHtml('Новый опрос', body),
    text: `Вам назначен опрос: ${surveyTitle}${dueDate ? '. Срок: ' + dueDate : ''}`,
  }
}

export function onboardingTask(data) {
  const { employeeName, taskTitle, dueDate, link } = data
  const body = `
    <p>Здравствуйте, ${employeeName}!</p>
    <p>Вам назначена новая задача онбординга:</p>
    <p style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #8b5cf6; margin: 16px 0;">
      ${taskTitle}
    </p>
    ${dueDate ? `<p style="color: #6b7280;">Срок выполнения: <strong>${dueDate}</strong></p>` : ''}
    ${link ? `<a href="${link}" style="${BUTTON_STYLES}">Перейти к задаче</a>` : ''}
  `
  return {
    subject: 'Новая задача онбординга',
    html: wrapHtml('Задача онбординга', body),
    text: `Новая задача онбординга: ${taskTitle}${dueDate ? '. Срок: ' + dueDate : ''}`,
  }
}

export function generic(data) {
  const { recipientName, subject, message, link, linkText } = data
  const body = `
    <p>Здравствуйте${recipientName ? ', ' + recipientName : ''}!</p>
    <p>${message}</p>
    ${link ? `<a href="${link}" style="${BUTTON_STYLES}">${linkText || 'Перейти в систему'}</a>` : ''}
  `
  return {
    subject: subject || 'Уведомление от Worker Cabinet',
    html: wrapHtml(subject || 'Уведомление', body),
    text: message,
  }
}

export const templates = {
  vacation_created: vacationCreated,
  vacation_status_changed: vacationStatusChanged,
  document_assigned: documentAssigned,
  survey_assigned: surveyAssigned,
  onboarding_task: onboardingTask,
  generic,
}
