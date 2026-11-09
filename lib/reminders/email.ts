export type ReminderEmail = {
  reminder_id: string
  task_id: string
  owner_id: string
  owner_email: string
  task_title: string
  checkpoint_pct: number
}

export function reminderEmailText(reminder: ReminderEmail) {
  return [
    `Task "${reminder.task_title}" telah melewati checkpoint ${reminder.checkpoint_pct}%.`,
    'Reminder ini belum mendapat tanggapan selama 72 jam kalender.',
    'Silakan buka aplikasi Task Manager Accounting untuk memperbarui progres atau menanggapi reminder.',
  ].join('\n\n')
}

export async function sendReminderEmail(
  reminder: ReminderEmail,
  apiKey: string,
  fromEmail: string,
) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `task-reminder-${reminder.reminder_id}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [reminder.owner_email],
      subject: `Reminder ${reminder.checkpoint_pct}%: ${reminder.task_title}`,
      text: reminderEmailText(reminder),
    }),
  })

  return { ok: response.ok, status: response.status }
}
