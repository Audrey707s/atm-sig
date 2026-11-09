import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, sendMail, close } = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
}))

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail, close }) },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

import { POST } from './route'

describe('reminder scheduler endpoint', () => {
  beforeEach(() => {
    rpc.mockReset()
    sendMail.mockReset()
    close.mockClear()
    vi.stubEnv('REMINDER_EMAIL_PROVIDER', 'resend')
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    vi.stubEnv('RESEND_API_KEY', 'resend-test-secret')
    vi.stubEnv('RESEND_FROM_EMAIL', 'ATM <noreply@example.test>')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects requests without the configured bearer secret', async () => {
    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST',
    }))

    expect(response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails explicitly when the scheduler secret is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')

    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    }))

    expect(response.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('processes checkpoints and claims due email batches', async () => {
    rpc.mockResolvedValue({ data: [], error: null })

    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      created: 0,
      emailsSent: 0,
      emailFailures: 0,
      taskTemplatesCreated: 0,
      taskTemplatesSkipped: 0,
    })
    expect(rpc).toHaveBeenCalledWith('process_task_reminder_checkpoints', {
      p_now: expect.any(String),
    })
    expect(rpc).toHaveBeenCalledWith('process_task_template_runs', {
      p_now: expect.any(String),
    })
    expect(rpc).toHaveBeenCalledWith('claim_due_reminder_emails', {
      p_now: expect.any(String),
      p_batch_size: 50,
    })
  })

  it('returns an error if the database processor fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('database unavailable') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    }))

    expect(response.status).toBe(500)
    expect(rpc).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })

  it('fails before claiming emails when the recurring task processor fails', async () => {
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('template database unavailable') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Gagal membuat task terjadwal dari template.' })
    expect(rpc).toHaveBeenCalledTimes(2)
    errorSpy.mockRestore()
  })

  it('does not claim email deliveries until Resend is configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    rpc
      .mockResolvedValueOnce({ data: [{ reminder_id: '1' }], error: null })
      .mockResolvedValueOnce({ data: [{ created_count: 2, skipped_count: 1 }], error: null })

    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      created: 1,
      taskTemplatesCreated: 2,
      taskTemplatesSkipped: 1,
      emailsSent: 0,
      emailFailures: 0,
      emailStatus: 'not_configured',
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('does not claim pending email when the selected Gmail provider lacks credentials', async () => {
    vi.stubEnv('REMINDER_EMAIL_PROVIDER', 'gmail')
    vi.stubEnv('GMAIL_USER', 'owner@gmail.com')
    vi.stubEnv('GMAIL_APP_PASSWORD', '')
    rpc.mockResolvedValue({ data: [], error: null })
    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST', headers: { authorization: 'Bearer test-cron-secret' },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({ emailStatus: 'not_configured' }))
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('sends claimed reminders and records a successful provider delivery', async () => {
    const reminder = {
      reminder_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      task_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      owner_email: 'pic@example.test',
      task_title: 'Reconciliation review',
      checkpoint_pct: 80,
    }
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ created_count: 2, skipped_count: 1 }], error: null })
      .mockResolvedValueOnce({ data: [reminder], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      created: 0,
      emailsSent: 1,
      emailFailures: 0,
      taskTemplatesCreated: 2,
      taskTemplatesSkipped: 1,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenLastCalledWith('mark_reminder_email_sent', {
      p_reminder_id: reminder.reminder_id,
      p_sent_at: expect.any(String),
    })
  })

  it('sends Gmail reminders through the same claim and completion flow', async () => {
    vi.stubEnv('REMINDER_EMAIL_PROVIDER', 'gmail')
    vi.stubEnv('GMAIL_USER', 'owner@gmail.com')
    vi.stubEnv('GMAIL_APP_PASSWORD', 'abcdefghijklmnop')
    sendMail.mockResolvedValue({ accepted: ['pic@example.test'] })
    const reminder = {
      reminder_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      task_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      owner_email: 'pic@example.test', task_title: 'Monthly task', checkpoint_pct: 80,
    }
    rpc.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [reminder], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST', headers: { authorization: 'Bearer test-cron-secret' },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({ emailsSent: 1, emailFailures: 0 }))
    expect(rpc).toHaveBeenCalledWith('claim_due_reminder_emails', { p_now: expect.any(String), p_batch_size: 5 })
    expect(rpc).toHaveBeenLastCalledWith('mark_reminder_email_sent', {
      p_reminder_id: reminder.reminder_id, p_sent_at: expect.any(String),
    })
    expect(close).toHaveBeenCalledOnce()
  })

  it('reports provider errors and leaves the claim to expire before retry', async () => {
    const reminder = {
      reminder_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      task_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      owner_email: 'pic@example.test',
      task_title: 'Reconciliation review',
      checkpoint_pct: 80,
    }
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ created_count: 0, skipped_count: 1 }], error: null })
      .mockResolvedValueOnce({ data: [reminder], error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(new Request('https://example.test/api/cron/reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    }))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      created: 0,
      emailsSent: 0,
      emailFailures: 1,
      taskTemplatesCreated: 0,
      taskTemplatesSkipped: 1,
    })
    expect(rpc).toHaveBeenCalledTimes(3)
    errorSpy.mockRestore()
  })
})
