import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { AdminConfigurationError, createAdminClient } from '@/lib/supabase/admin'
import { getReminderEmailSender } from '@/lib/reminders/email-provider'

function hasValidCronAuthorization(request: Request, secret: string) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return false
  const provided = Buffer.from(authorization.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Scheduler belum dikonfigurasi.' }, { status: 500 })
  }
  if (!hasValidCronAuthorization(request, secret)) {
    return NextResponse.json({ error: 'Akses scheduler ditolak.' }, { status: 401 })
  }

  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (error) {
    if (error instanceof AdminConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    throw error
  }
  const { data, error } = await supabase.rpc('process_task_reminder_checkpoints', {
    p_now: new Date().toISOString(),
  })
  if (error) {
    console.error('Reminder scheduler RPC failed', error)
    return NextResponse.json({ error: 'Gagal memproses checkpoint reminder.' }, { status: 500 })
  }

  const { data: templateRuns, error: templateRunsError } = await supabase.rpc('process_task_template_runs', {
    p_now: new Date().toISOString(),
  })
  if (templateRunsError) {
    console.error('Task template scheduler RPC failed', templateRunsError)
    return NextResponse.json({ error: 'Gagal membuat task terjadwal dari template.' }, { status: 500 })
  }
  const taskTemplatesCreated = templateRuns?.[0]?.created_count ?? 0
  const taskTemplatesSkipped = templateRuns?.[0]?.skipped_count ?? 0

  const created = data?.length ?? 0
  const emailSender = getReminderEmailSender()
  if (!emailSender) {
    // In-app and Android push reminders are independent of email.
    // Report the disabled email channel explicitly without marking successful
    // checkpoint/template processing as a failed cron execution.
    return NextResponse.json({
      created,
      taskTemplatesCreated,
      taskTemplatesSkipped,
      emailsSent: 0,
      emailFailures: 0,
      emailStatus: 'not_configured',
    })
  }

  const now = new Date().toISOString()
  const { data: reminders, error: claimError } = await supabase.rpc('claim_due_reminder_emails', {
    p_now: now,
    p_batch_size: emailSender.batchSize,
  })
  if (claimError) {
    console.error('Reminder email claim RPC failed', claimError)
    return NextResponse.json({ error: 'Gagal mengambil antrean email reminder.' }, { status: 500 })
  }

  let emailsSent = 0
  let emailFailures = 0
  for (const reminder of reminders ?? []) {
    let delivery: Awaited<ReturnType<typeof emailSender.send>>
    try {
      delivery = await emailSender.send(reminder)
    } catch {
      console.error('Reminder email request failed', { reminderId: reminder.reminder_id })
      emailFailures += 1
      continue
    }

    if (!delivery.ok) {
      console.error('Reminder email provider rejected a request', {
        reminderId: reminder.reminder_id,
        status: delivery.status,
      })
      emailFailures += 1
      continue
    }

    emailsSent += 1
    const { error: markError } = await supabase.rpc('mark_reminder_email_sent', {
      p_reminder_id: reminder.reminder_id,
      p_sent_at: new Date().toISOString(),
    })
    if (markError) {
      console.error('Failed to record sent reminder email', {
        reminderId: reminder.reminder_id,
        error: markError,
      })
      emailFailures += 1
    }
  }

  return NextResponse.json({
    created,
    emailsSent,
    emailFailures,
    taskTemplatesCreated,
    taskTemplatesSkipped,
  }, { status: emailFailures > 0 ? 502 : 200 })
}
