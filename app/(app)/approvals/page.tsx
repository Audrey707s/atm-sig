import WorkspaceTabs, { APPROVAL_TABS } from '../_components/WorkspaceTabs'
import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import { ROLE_LEVELS, ROLES } from '@/lib/constants/rbac'
import { redirect } from 'next/navigation'
import { getPendingDeadlineRequests } from '@/lib/tasks/queries'
import ApprovalClient from './ApprovalClient'

export const metadata: Metadata = { title: 'Approval Perubahan Deadline' }

export default async function ApprovalsPage() {
  const user = await getSessionUser()
  if (user.roleLevel < ROLE_LEVELS[ROLES.SM]) redirect('/tasks?error=forbidden')
  const requests = await getPendingDeadlineRequests(user)

  return <><div className="px-4 pt-5 sm:px-6 lg:px-8"><WorkspaceTabs current="/approvals" tabs={APPROVAL_TABS} roleLevel={user.roleLevel} /></div><ApprovalClient requests={requests} /></>
}
