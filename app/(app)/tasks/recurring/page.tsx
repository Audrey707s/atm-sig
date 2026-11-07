import TaskTypeTabs from '../../_components/TaskTypeTabs'
import type { Metadata } from 'next'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { ROLES } from '@/lib/constants/rbac'
import { getTaskMasterData } from '@/lib/task-masters/queries'
import TaskTemplateManager from '../../task-templates/TaskTemplateManager'

export const metadata: Metadata = { title: 'Tugas Berulang' }

export default async function RecurringTasksPage() {
  const user = await getSessionUser()
  requireRole(user, ROLES.STAFF_PIC)
  const data = await getTaskMasterData(user)
  return <div>
    <TaskTypeTabs current="recurring" />
    <div className="mx-auto max-w-3xl">
      <TaskTemplateManager {...data} mode="recurring" />
    </div>
  </div>
}
