import TaskTypeTabs from '../../_components/TaskTypeTabs'
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
  return <div><TaskTypeTabs current="once" /><CreateTaskForm {...options} supportRecipients={recipients} currentUserRoleLevel={user.roleLevel} currentUserId={user.id} /></div>
}
