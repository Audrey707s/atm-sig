import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import {
  getTaskDetail,
  getTaskCreationOptions,
  getTaskSupportRecipients,
} from '@/lib/tasks/queries'
import { isValidUuid } from '@/lib/tasks/validation'
import TaskDetailClient from './TaskDetailClient'

export const metadata: Metadata = { title: 'Detail Task' }

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const [{ taskId }, user] = await Promise.all([params, getSessionUser()])
  if (!isValidUuid(taskId)) notFound()

  const task = await getTaskDetail(taskId, user)
  if (!task) notFound()

  const [supportRecipients, creationOptions] = await Promise.all([
    task.ownerId === user.id ? getTaskSupportRecipients(user.id) : Promise.resolve([]),
    user.roleLevel >= 3 ? getTaskCreationOptions(user) : Promise.resolve(null),
  ])

  return (
    <>
    {user.roleLevel >= 2 && <div className="flex justify-end px-4 pt-4 sm:px-6 lg:px-8"><Link href={`/tasks/new?duplicate=${task.id}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Duplikasi tugas</Link></div>}
    <TaskDetailClient
      task={task}
      currentUserId={user.id}
      currentUserRoleLevel={user.roleLevel}
      supportRecipients={supportRecipients}
      reassignmentOptions={(creationOptions?.owners ?? []).filter((owner) => owner.id !== task.ownerId)}
    />
    </>
  )
}
