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
    <TaskDetailClient
      task={task}
      currentUserId={user.id}
      currentUserRoleLevel={user.roleLevel}
      supportRecipients={supportRecipients}
      reassignmentOptions={(creationOptions?.owners ?? []).filter((owner) => owner.id !== task.ownerId)}
    />
  )
}
