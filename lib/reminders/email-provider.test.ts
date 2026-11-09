import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getReminderEmailSender } from './email-provider'

const { createTransport, sendMail, close } = vi.hoisted(() => ({
  createTransport: vi.fn(), sendMail: vi.fn(), close: vi.fn(),
}))
vi.mock('nodemailer', () => ({ default: { createTransport } }))

const reminder = {
  reminder_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  task_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  owner_email: 'pic@example.test', task_title: 'Monthly task', checkpoint_pct: 80,
}

beforeEach(() => {
  vi.clearAllMocks()
  createTransport.mockReturnValue({ sendMail, close })
  vi.stubEnv('REMINDER_EMAIL_PROVIDER', 'gmail')
  vi.stubEnv('GMAIL_USER', 'owner@gmail.com')
  vi.stubEnv('GMAIL_APP_PASSWORD', 'abcd efgh ijkl mnop')
})
afterEach(() => vi.unstubAllEnvs())

it('uses authenticated TLS Gmail SMTP and sends only to the PIC', async () => {
  sendMail.mockResolvedValue({ accepted: ['pic@example.test'] })
  const sender = getReminderEmailSender()!
  expect(sender.batchSize).toBe(5)
  await expect(sender.send(reminder)).resolves.toEqual({ ok: true, status: 200 })
  expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: 'owner@gmail.com', pass: 'abcdefghijklmnop' },
  }))
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: { name: 'ATM Accounting', address: 'owner@gmail.com' },
    to: [{ address: 'pic@example.test' }],
    messageId: `<task-reminder-${reminder.reminder_id}@gmail.com>`,
  }))
  expect(close).toHaveBeenCalledOnce()
})

it('does not select Resend or claim mail when Gmail credentials are incomplete', () => {
  vi.stubEnv('GMAIL_APP_PASSWORD', '')
  vi.stubEnv('RESEND_API_KEY', 'configured-resend-secret')
  vi.stubEnv('RESEND_FROM_EMAIL', 'App <test@example.test>')
  expect(getReminderEmailSender()).toBeNull()
  expect(createTransport).not.toHaveBeenCalled()
})

it('fails closed for an unknown provider', () => {
  vi.stubEnv('REMINDER_EMAIL_PROVIDER', 'unknown')
  expect(getReminderEmailSender()).toBeNull()
})

it('does not expose SMTP errors or report failures as sent', async () => {
  sendMail.mockRejectedValue(new Error('private provider/account details'))
  await expect(getReminderEmailSender()!.send(reminder)).resolves.toEqual({ ok: false, status: 502 })
  expect(close).toHaveBeenCalledOnce()
})

it('does not report an unaccepted recipient as sent', async () => {
  sendMail.mockResolvedValue({ accepted: [] })
  await expect(getReminderEmailSender()!.send(reminder)).resolves.toEqual({ ok: false, status: 502 })
})

it('rejects multiple-recipient input before connecting to SMTP', async () => {
  await expect(getReminderEmailSender()!.send({ ...reminder, owner_email: 'pic@example.test,other@example.test' }))
    .resolves.toEqual({ ok: false, status: 422 })
  expect(createTransport).not.toHaveBeenCalled()
})
