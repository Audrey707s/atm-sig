import WorkspaceTabs, { MASTER_TABS } from '../_components/WorkspaceTabs'
// T-505 / FR-100 / CR-0003: master kategori dan template task otomatis berkala.

import type { Metadata } from 'next'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { getTaskMasterData } from '@/lib/task-masters/queries'
import TaskTemplateManager from './TaskTemplateManager'

export const metadata: Metadata = { title: 'Kategori Tugas' }

export default async function TaskTemplatesPage() {
  const user = await getSessionUser()
  requireRole(user, 'Staff/PIC')
  const data = await getTaskMasterData(user)
  return <><div className="px-4 pt-5 sm:px-6 lg:px-8"><WorkspaceTabs current="/task-templates" tabs={MASTER_TABS} roleLevel={user.roleLevel} /></div><TaskTemplateManager {...data} /></>
}
