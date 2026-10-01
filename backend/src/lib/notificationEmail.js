import nodemailer from 'nodemailer'
import { getPushCopy } from '../config/notificationCopy.js'
import { getNotificationUrl } from '../config/notificationTarget.js'

let transporter = null

export function isMailConfigured() {
  return !!process.env.MAIL_HOST && !!process.env.MAIL_USER
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.MAIL_PORT) || 465
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      secure: process.env.MAIL_SECURE ? process.env.MAIL_SECURE === 'true' : port === 465,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD },
      pool: true,
      maxConnections: 2,
    })
  }
  return transporter
}

export async function sendEmail({ to, subject, html, text }) {
  return getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    html,
    text,
  })
}

function esc(s) {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

const paragraphs = (text) => esc(text).replace(/\n/g, '<br>')

function absoluteUrl(path) {
  const base = (process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')
  if (!base || !path) return ''
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

const BUTTON = 'display:inline-block;padding:12px 28px;background:#0055b2;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px'
const CELL = 'padding:8px;border:1px solid #e5e7eb'

function layout(title, body, link, linkText = 'Открыть в личном кабинете') {
  const href = esc(link)
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="background:#0055b2;padding:20px 28px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;color:#ffffff;font-size:20px">Личный кабинет работника</h1>
    </div>
    <div style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 16px;font-size:18px">${esc(title)}</h2>
      ${body}
      ${href ? `<p style="margin:24px 0 0"><a href="${href}" style="${BUTTON}">${esc(linkText)}</a></p>` : ''}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin:16px 0 0">Это автоматическое уведомление, отвечать на него не нужно.</p>
  </div>
</body></html>`
}

function period(data) {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">
    <tr><td style="${CELL};color:#6b7280">Период</td><td style="${CELL}">${esc(data.startDate)} — ${esc(data.endDate)}</td></tr>
    ${data.days ? `<tr><td style="${CELL};color:#6b7280">Дней</td><td style="${CELL}">${esc(data.days)}</td></tr>` : ''}
  </table>`
}

const SPECIAL = {
  vacation_created: (d) => ({
    subject: 'Новая заявка на отпуск',
    body: `<p>${esc(d.employeeName)} подал(а) заявку на отпуск.</p>${period(d)}`,
    text: `${d.employeeName} подал(а) заявку на отпуск: ${d.startDate} — ${d.endDate}`,
    linkText: 'Рассмотреть заявку',
  }),
  vacation_status_changed: (d) => {
    const approved = d.status === 'approved'
    const word = approved ? 'согласована' : 'отклонена'
    return {
      subject: `Заявка на отпуск ${word}`,
      body: `<p>Ваша заявка на отпуск <strong style="color:${approved ? '#16a34a' : '#dc2626'}">${word}</strong>.</p>${period(d)}${d.reason || d.comment ? `<p>Комментарий: ${paragraphs(d.reason || d.comment)}</p>` : ''}`,
      text: `Ваша заявка на отпуск (${d.startDate} — ${d.endDate}) ${word}.`,
    }
  },
  survey_assigned: (d) => ({
    subject: 'Новый опрос',
    body: `<p>Для вас доступен опрос «${esc(d.title)}».</p>${d.deadline ? `<p style="color:#6b7280">Пройти до ${esc(new Date(d.deadline).toLocaleDateString('ru-RU'))}</p>` : ''}`,
    text: `Для вас доступен опрос «${d.title}».`,
    linkText: 'Пройти опрос',
  }),
  bug_report_reply: (d) => ({
    subject: `Ответ на сообщение об ошибке: ${d.title || ''}`.trim(),
    body: `<p>${paragraphs(d.message)}</p>`,
    text: d.message || '',
  }),
  mailing: (d) => ({
    subject: d.title || 'Рассылка',
    body: `<p>${paragraphs(d.message)}</p>${(d.imageUrls || []).map((u) => `<img src="${esc(u)}" alt="" style="max-width:100%;border-radius:8px;margin-top:12px">`).join('')}`,
    text: d.message || '',
    noLink: true,
  }),
}

export function renderEmail(notification) {
  const data = notification.data || {}
  const special = SPECIAL[notification.type]?.(data)
  const { title, body } = getPushCopy(notification.type, data)
  const content = special ?? { subject: title, body: `<p>${paragraphs(body)}</p>`, text: body }
  const link = content.noLink ? '' : absoluteUrl(getNotificationUrl(notification.type, data, notification.user_id) || '/notifications')
  return {
    subject: content.subject,
    html: layout(content.subject, content.body, link, content.linkText),
    text: [content.text, link].filter(Boolean).join('\n\n'),
  }
}
