import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

let transporter = null

export function getTransporter() {
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD,
    },
  })

  return transporter
}

export async function verifyConnection() {
  try {
    const transport = getTransporter()
    await transport.verify()
    console.log('[MAIL] SMTP connection verified')
    return true
  } catch (err) {
    console.error('[MAIL] SMTP connection failed:', err.message)
    return false
  }
}

export async function sendEmail({ to, subject, html, text }) {
  const transport = getTransporter()

  const result = await transport.sendMail({
    from: process.env.MAIL_FROM || '"Worker Cabinet" <noreply@example.com>',
    to,
    subject,
    html,
    text: text || undefined,
  })

  console.log(`[MAIL] Sent to ${to}: ${subject} (id=${result.messageId})`)
  return result
}
