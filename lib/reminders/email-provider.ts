import { randomUUID } from 'node:crypto'
import { reminderEmailText, sendReminderEmail, type ReminderEmail } from './email'

type Delivery = { ok: boolean; status: number }
const singleAddress = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

async function sendGmailMessage(user: string, password: string, recipient: string, subject: string, text: string, messageId: string): Promise<Delivery> {
  if (!singleAddress.test(recipient)) return { ok: false, status: 422 }
  const { default: nodemailer } = await import('nodemailer')
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  try {
    const result = await transport.sendMail({
      from: { name: 'ATM-SIG', address: user },
      to: [{ address: recipient }],
      subject: subject,
      text: text,
      messageId: messageId,
    })
    const accepted = result.accepted.some(address =>
      typeof address === 'string' && address.toLowerCase() === recipient.toLowerCase())
    return { ok: accepted, status: accepted ? 200 : 502 }
  } catch {
    // SMTP responses can contain account/provider details. Never return
    // or log them, and never mark a rejected/uncertain delivery as sent.
    return { ok: false, status: 502 }
  } finally {
    transport.close()
  }
}

/** Server-only configuration. A partial/unknown provider never claims emails. */
export function getReminderEmailSender(): {
  batchSize: number
  send: (reminder: ReminderEmail) => Promise<Delivery>
  sendTest?: () => Promise<Delivery>
} | null {
  const provider = process.env.REMINDER_EMAIL_PROVIDER?.trim() || 'resend'
  if (provider === 'gmail') {
    const user = process.env.GMAIL_USER?.trim()
    const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '')
    if (!user || !singleAddress.test(user) || !password || password.length !== 16) return null
    return {
      // Bound each scheduled batch so SMTP timeouts fit the function duration.
      batchSize: 5,
      sendTest: () => sendGmailMessage(user, password, user,
        'Tes email ATM-SIG',
        'Email tes ini dikirim oleh ATM-SIG melalui Gmail. Ini bukan reminder tugas dan tidak mengubah data task.',
        `<atm-sig-test-${randomUUID()}@${user.split('@')[1]}>`),
      send: async reminder => {
        return sendGmailMessage(user, password, reminder.owner_email,
          `Reminder ${reminder.checkpoint_pct}%: ${reminder.task_title}`, reminderEmailText(reminder),
          `<task-reminder-${reminder.reminder_id}@${user.split('@')[1]}>`)
      },
    }
  }
  if (provider !== 'resend') return null
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !fromEmail) return null
  return { batchSize: 50, send: reminder => sendReminderEmail(reminder, apiKey, fromEmail) }
}
