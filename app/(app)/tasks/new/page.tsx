import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { getTaskCreationOptions, getTaskSupportRecipients } from '@/lib/tasks/queries'
import CreateTaskForm from './CreateTaskForm'

export const metadata: Metadata = { title: 'Buat Task' }

export default async function NewTaskPage() {
  const user = await getSessionUser()
  if (user.roleLevel < 2) notFound()

  const [options, recipients] = await Promise.all([
    getTaskCreationOptions(user),
    user.roleLevel === 2 ? getTaskSupportRecipients(user.id) : Promise.resolve([]),
  ])
  return <div><nav aria-label="Jenis tugas" className="mx-auto flex max-w-3xl gap-2 px-4 pt-5"><span aria-current="page" className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Tugas Sekali Jalan</span><Link href="/tasks/recurring" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Tugas Berulang</Link></nav><CreateTaskForm {...options} supportRecipients={recipients} currentUserRoleLevel={user.roleLevel} currentUserId={user.id} /></div>
}
